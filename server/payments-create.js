const { checkRateLimit, cleanText, createClientFromEnv, decryptSecret, paymongoRequest,
  readJson, sendJson, validateDeviceId, validatePaymentInput } = require('./_business-utils');
const { authenticateDevice, publicSettings } = require('./_device-payments');
const { paymentResponse, reconcilePayment } = require('./_native-qrph');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
  if (!checkRateLimit(request, 'payment_create', 60)) return sendJson(response, 429, { ok: false, status: 'rate_limited' });
  const supabase = createClientFromEnv();
  if (!supabase) return sendJson(response, 500, { ok: false, status: 'server_not_configured' });
  let body;
  try { body = await readJson(request); } catch { return sendJson(response, 400, { ok: false, status: 'invalid_json' }); }
  const deviceId = cleanText(body.deviceId, 200);
  const mode = cleanText(body.mode, 40);
  const amount = body.amount;
  const currency = body.currency || 'PHP';
  const requestId = cleanText(body.requestId, 36);
  const inputError = validatePaymentInput({ amount, currency, mode });
  if (!validateDeviceId(deviceId) || inputError || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return sendJson(response, 400, { ok: false, status: inputError || 'invalid_payment_request' });
  }
  const device = await authenticateDevice(supabase, request, response, deviceId);
  if (!device) return;
  const lookup = () => supabase.from('payment_sessions').select('*').eq('business_id', device.business_id)
    .eq('device_id', deviceId).eq('request_id', requestId).maybeSingle();
  const respondExisting = async (session) => {
    if (session.amount !== amount || session.mode !== mode || session.currency !== currency) {
      return sendJson(response, 409, { ok: false, status: 'request_id_conflict' });
    }
    try {
      session = await reconcilePayment(supabase, session);
      if (session.status === 'pending' && !session.qr_image_url) {
        return sendJson(response, 409, { ok: false, status: 'payment_initializing', paymentSessionId: session.id });
      }
      sendJson(response, 200, paymentResponse(session));
    } catch {
      sendJson(response, 503, { ok: false, status: 'payment_status_unavailable', paymentSessionId: session.id });
    }
  };
  const { data: existing, error: lookupError } = await lookup();
  if (lookupError) return sendJson(response, 503, { ok: false, status: 'payment_lookup_failed' });
  if (existing) return respondExisting(existing);
  const { data: settings, error: settingsError } = await supabase.from('business_payment_settings')
    .select('*').eq('business_id', device.business_id).maybeSingle();
  if (settingsError) return sendJson(response, 503, { ok: false, status: 'settings_unavailable' });
  if (!publicSettings(settings).paymentEnabled) return sendJson(response, 409, { ok: false, status: 'payments_not_configured' });
  let secret;
  try { secret = decryptSecret(settings.paymongo_secret_key_encrypted); }
  catch { return sendJson(response, 500, { ok: false, status: 'paymongo_secret_unavailable' }); }
  // Reserve the request before contacting PayMongo; the unique index serializes retries.
  const { data: session, error: saveError } = await supabase.from('payment_sessions').insert({
    business_id: device.business_id, device_id: deviceId, request_id: requestId,
    mode, amount, currency, status: 'pending', payment_flow: 'qrph',
    payment_payload: { key_mode: publicSettings(settings).keyMode },
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  }).select('*').single();
  if (saveError) {
    if (saveError.code === '23505') {
      const { data: duplicate } = await lookup();
      if (duplicate) return respondExisting(duplicate);
    }
    return sendJson(response, 500, { ok: false, status: 'payment_session_save_failed' });
  }
  try {
    const intent = await paymongoRequest(secret, '/payment_intents', { method: 'POST', body: { data: { attributes: {
      amount, currency, payment_method_allowed: ['qrph'], description: `PhotoTags ${mode}`,
      metadata: { payment_session_id: session.id, business_id: device.business_id, device_id: deviceId }
    } } } });
    if (!intent.data?.id) throw new Error('invalid_intent');
    const { error } = await supabase.from('payment_sessions').update({ paymongo_payment_id: intent.data.id }).eq('id', session.id);
    if (error) throw error;
    session.paymongo_payment_id = intent.data.id;
    // Public-key calls keep the secret and intent client key entirely on the server.
    const method = await paymongoRequest(settings.paymongo_public_key, '/payment_methods', {
      method: 'POST', body: { data: { attributes: { type: 'qrph', expiry_seconds: 1800 } } }
    });
    if (!method.data?.id) throw new Error('invalid_method');
    const attached = await paymongoRequest(settings.paymongo_public_key,
      `/payment_intents/${encodeURIComponent(intent.data.id)}/attach`, {
        method: 'POST', body: { data: { attributes: {
          payment_method: method.data.id, client_key: intent.data.attributes.client_key
        } } }
      });
    const qr = attached.data?.attributes?.next_action?.code?.image_url;
    if (!qr || attached.data.id !== intent.data.id) throw new Error('invalid_qr_response');
    const { error: qrError } = await supabase.from('payment_sessions').update({ qr_image_url: qr }).eq('id', session.id);
    if (qrError) throw qrError;
    // Read status rather than overwriting a fast webhook's paid state.
    const { data: current, error: readError } = await supabase.from('payment_sessions').select('*').eq('id', session.id).single();
    if (readError) throw readError;
    sendJson(response, 201, paymentResponse(current));
  } catch (error) {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      const { error: updateError } = await supabase.from('payment_sessions').update({ status: 'failed' })
        .eq('id', session.id).eq('status', 'pending');
      if (!updateError) return sendJson(response, 502, { ok: false, status: 'paymongo_rejected', paymentSessionId: session.id });
    }
    // An attach may have succeeded even when its HTTP response was lost. Keep the
    // reservation for reconciliation, and never silently issue a second QR.
    sendJson(response, 503, { ok: false, status: 'payment_creation_uncertain', paymentSessionId: session.id });
  }
};

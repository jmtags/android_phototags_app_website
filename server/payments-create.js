const {
  checkRateLimit,
  cleanText,
  createClientFromEnv,
  decryptSecret,
  paymongoRequest,
  readJson,
  sendJson,
  validateDeviceId,
  validatePaymentInput
} = require('./_business-utils');

function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, item]) => [String(key).slice(0, 40), String(item).slice(0, 200)])
  );
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'payment_create', 60, 60 * 1000)) {
    sendJson(response, 429, { ok: false, status: 'rate_limited' });
    return;
  }

  const supabase = createClientFromEnv();
  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const deviceId = cleanText(body.deviceId || body.device_id, 200);
  const mode = cleanText(body.mode, 40);
  const amount = Number(body.amount);
  const currency = cleanText(body.currency || 'PHP', 8).toUpperCase();
  const metadata = safeMetadata(body.metadata);
  const inputError = validatePaymentInput({ amount, currency, mode });

  if (!validateDeviceId(deviceId) || inputError) {
    sendJson(response, 400, { ok: false, status: inputError || 'invalid_device_id' });
    return;
  }

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, business_id, businesses(id, business_name)')
    .eq('device_id', deviceId)
    .not('business_id', 'is', null)
    .maybeSingle();

  if (deviceError || !device?.business_id) {
    sendJson(response, 404, { ok: false, status: 'device_not_paired' });
    return;
  }

  const { data: settings, error: settingsError } = await supabase
    .from('business_payment_settings')
    .select('paymongo_secret_key_encrypted, qrph_enabled')
    .eq('business_id', device.business_id)
    .maybeSingle();

  if (settingsError || !settings?.paymongo_secret_key_encrypted || !settings.qrph_enabled) {
    sendJson(response, 409, { ok: false, status: 'payments_not_configured' });
    return;
  }

  let secretKey;
  try {
    secretKey = decryptSecret(settings.paymongo_secret_key_encrypted);
  } catch {
    sendJson(response, 500, { ok: false, status: 'paymongo_secret_unavailable' });
    return;
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const siteUrl = (process.env.SITE_URL || `https://${request.headers.host}`).replace(/\/$/, '');
  let checkout;

  try {
    checkout = await paymongoRequest(secretKey, '/checkout_sessions', {
      method: 'POST',
      body: {
        data: {
          attributes: {
            billing: {},
            description: `PhotoTags ${mode} print`,
            line_items: [
              {
                currency,
                amount,
                name: `PhotoTags ${mode} print`,
                quantity: 1
              }
            ],
            payment_method_types: ['qrph'],
            reference_number: metadata.jobId || undefined,
            success_url: `${siteUrl}/business/payment-success`,
            cancel_url: `${siteUrl}/business/payment-cancelled`,
            metadata: {
              ...metadata,
              device_id: deviceId,
              business_id: device.business_id,
              mode
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('PayMongo checkout create failed', error.payload || error.message);
    sendJson(response, 502, { ok: false, status: 'paymongo_create_failed' });
    return;
  }

  const checkoutData = checkout?.data;
  const attributes = checkoutData?.attributes || {};
  const checkoutUrl = attributes.checkout_url || attributes.checkoutUrl || attributes.url || null;

  const { data: session, error: sessionError } = await supabase
    .from('payment_sessions')
    .insert({
      business_id: device.business_id,
      device_id: deviceId,
      mode,
      amount,
      currency,
      status: 'pending',
      paymongo_payment_id: checkoutData?.id || null,
      paymongo_checkout_url: checkoutUrl,
      payment_payload: {
        paymongo_id: checkoutData?.id || null,
        metadata,
        business_name: device.businesses?.business_name || null
      },
      expires_at: expiresAt
    })
    .select('id, status, paymongo_checkout_url, expires_at')
    .single();

  if (sessionError) {
    sendJson(response, 500, { ok: false, status: 'payment_session_save_failed' });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    paymentSessionId: session.id,
    status: session.status,
    checkoutUrl: session.paymongo_checkout_url,
    expiresAt: session.expires_at
  });
};

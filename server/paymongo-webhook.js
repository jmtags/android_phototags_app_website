const crypto = require('crypto');
const {
  createClientFromEnv,
  decryptSecret,
  sendJson
} = require('./_business-utils');
const { fulfillPaidSession, isCheckoutPaid } = require('./license-payments');
const { reconcilePayment } = require('./_native-qrph');

function verifyWebhook(request, rawBody, secret = process.env.PAYMONGO_WEBHOOK_SECRET) {

  if (!secret) {
    return false;
  }

  const signature = request.headers['paymongo-signature'] || request.headers['x-paymongo-signature'];

  if (typeof signature !== 'string' || !signature) {
    return false;
  }

  const parts = signature.split(',').reduce((values, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) {
      values[key] = rest.join('=');
    }
    return values;
  }, {});
  const timestamp = parts.t || '';
  const providedSignatures = [parts.li, parts.te].filter(Boolean);

  if (!timestamp || !providedSignatures.length) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return providedSignatures.some((provided) => {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    return expectedBuffer.length === providedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  });
}

function mapStatus(eventType, payload) {
  const attributes = payload?.attributes || payload?.data?.attributes || {};
  const rawStatus = String(attributes.status || '').toLowerCase();

  if (String(eventType).includes('paid') || isCheckoutPaid({ data: payload })) return 'paid';
  if (String(eventType).includes('failed') || rawStatus === 'failed') return 'failed';
  if (String(eventType).includes('expired') || rawStatus === 'expired') return 'expired';
  if (String(eventType).includes('cancelled') || rawStatus === 'cancelled' || rawStatus === 'canceled') return 'cancelled';
  return null;
}

function getWebhookEvent(payload) {
  const event = payload?.data || {};
  const legacyAttributes = event?.attributes || {};
  const legacyEventType = legacyAttributes.type;
  const modernEventType = event.type && event.type !== 'event' ? event.type : null;

  return {
    eventId: event.id || payload?.id || null,
    eventType: legacyEventType || modernEventType || payload?.type || null,
    resource: legacyAttributes.data || event.data || payload?.resource || null
  };
}

async function handleBusinessWebhook(supabase, businessId, payload, response) {
  const { eventType, resource } = getWebhookEvent(payload);
  if (!['payment.paid', 'payment.failed', 'qrph.expired'].includes(eventType)) {
    return sendJson(response, 200, { ok: true, status: 'ignored' });
  }
  const intentId = resource?.attributes?.payment_intent_id
    || (resource?.type === 'payment_intent' ? resource.id : null);
  if (!intentId) return sendJson(response, 200, { ok: true, status: 'ignored' });
  const { data: session, error } = await supabase.from('payment_sessions').select('*')
    .eq('business_id', businessId).eq('payment_flow', 'qrph').eq('paymongo_payment_id', intentId).maybeSingle();
  if (error) return sendJson(response, 500, { ok: false, status: 'webhook_lookup_failed' });
  if (!session) return sendJson(response, 200, { ok: true, status: 'ignored' });
  try {
    // Fetch canonical provider status and validate amount/currency; never trust
    // metadata or an event name as proof that this session was paid.
    await reconcilePayment(supabase, session);
    sendJson(response, 200, { ok: true, status: 'updated' });
  } catch {
    sendJson(response, 503, { ok: false, status: 'payment_status_unavailable' });
  }
}

function getCheckoutAttributes(checkoutSession) {
  return checkoutSession?.attributes || {};
}

async function fulfillLicensePayment(supabase, payload, status, checkoutSession) {
  const checkoutAttributes = getCheckoutAttributes(checkoutSession);
  const checkoutId = checkoutSession?.id || null;
  const referenceNumber = checkoutAttributes.reference_number || checkoutAttributes.referenceNumber || null;
  const metadata = checkoutAttributes.metadata || {};
  const paymentSessionId = metadata.payment_session_id || metadata.paymentSessionId || null;

  if (!checkoutId && !referenceNumber && !paymentSessionId) {
    return false;
  }

  let query = supabase
    .from('license_payment_sessions')
    .select('id, device_id, plan, amount, currency, status, paid_at, expires_at, reference_number, customer_email, license_id, payment_payload, updated_at')
    .limit(1);

  if (paymentSessionId && /^[0-9a-f-]{36}$/i.test(paymentSessionId)) {
    query = query.eq('id', paymentSessionId);
  } else if (checkoutId) {
    query = query.eq('paymongo_checkout_session_id', checkoutId);
  } else {
    query = query.eq('reference_number', referenceNumber);
  }

  const { data: rows, error: sessionError } = await query;

  if (sessionError || !rows?.length) {
    return false;
  }

  const session = rows[0];

  if (status !== 'paid') {
    const paymentPayload = session.payment_payload?.plan_snapshot
      ? { ...payload, plan_snapshot: session.payment_payload.plan_snapshot }
      : payload;
    const { error: updateError } = await supabase
      .from('license_payment_sessions')
      .update({ status, payment_payload: paymentPayload })
      .eq('id', session.id);

    if (updateError) {
      throw updateError;
    }
    return true;
  }

  if (session.status === 'paid' && session.license_id) {
    const { error: updateError } = await supabase
      .from('license_payment_sessions')
      .update({ payment_payload: payload })
      .eq('id', session.id);

    if (updateError) {
      throw updateError;
    }
    return true;
  }

  await fulfillPaidSession(supabase, session, payload);
  return true;
}

async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const supabase = createClientFromEnv();
  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  const businessId = request.query?.businessId || new URL(request.url || '/', 'https://phototags.local').searchParams.get('businessId');
  let signingSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (businessId) {
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return sendJson(response, 400, { ok: false, status: 'invalid_business_id' });
    const { data: settings, error } = await supabase.from('business_payment_settings')
      .select('webhook_secret_encrypted, webhook_enabled').eq('business_id', businessId).maybeSingle();
    if (error) return sendJson(response, 503, { ok: false, status: 'settings_unavailable' });
    if (!settings?.webhook_enabled || !settings.webhook_secret_encrypted) {
      return sendJson(response, 401, { ok: false, status: 'webhook_not_configured' });
    }
    try { signingSecret = decryptSecret(settings.webhook_secret_encrypted); }
    catch { return sendJson(response, 500, { ok: false, status: 'webhook_secret_unavailable' }); }
  }
  if (!signingSecret) {
    console.error('PayMongo webhook secret is not configured');
    sendJson(response, 500, { ok: false, status: 'webhook_secret_not_configured' });
    return;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!verifyWebhook(request, rawBody, signingSecret)) {
    sendJson(response, 401, { ok: false, status: 'invalid_signature' });
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  if (businessId) return handleBusinessWebhook(supabase, businessId, payload, response);

  const { eventId, eventType, resource: checkoutSession } = getWebhookEvent(payload);
  const paymongoId = checkoutSession?.id || payload?.data?.id || payload?.id;
  const status = mapStatus(eventType, checkoutSession || payload);

  if (!paymongoId || !status) {
    console.warn('PayMongo webhook ignored', { eventId, eventType, paymongoId: paymongoId || null, status: status || null });
    sendJson(response, 200, { ok: true, status: 'ignored' });
    return;
  }

  try {
    const handledLicensePayment = await fulfillLicensePayment(supabase, payload, status, checkoutSession);
    if (handledLicensePayment) {
      sendJson(response, 200, { ok: true, status: 'license_updated' });
      return;
    }
  } catch (error) {
    console.error('PayMongo license webhook failed', error.message);
    sendJson(response, 500, { ok: false, status: 'license_webhook_failed' });
    return;
  }

  const updates = {
    status,
    payment_payload: payload
  };

  if (status === 'paid') {
    updates.paid_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('payment_sessions')
    .update(updates)
    .eq('payment_flow', 'checkout')
    .neq('status', 'paid')
    .eq('paymongo_payment_id', paymongoId);

  if (error) {
    console.error('PayMongo webhook update failed', error.message);
    sendJson(response, 500, { ok: false, status: 'webhook_update_failed' });
    return;
  }

  console.warn('PayMongo webhook did not match a license payment session', { eventType, paymongoId, status });
  sendJson(response, 200, { ok: true, status: 'updated' });
}

module.exports = handler;
module.exports.getWebhookEvent = getWebhookEvent;
module.exports.mapStatus = mapStatus;
module.exports.verifyWebhook = verifyWebhook;
module.exports.handleBusinessWebhook = handleBusinessWebhook;

const crypto = require('crypto');
const {
  createClientFromEnv,
  readJson,
  sendJson
} = require('./_business-utils');
const { getLicensePlan } = require('./license-plans');

function generateLicenseKey(planId) {
  const prefix = planId === 'lifetime' ? 'PT-LIFE' : planId === 'weekly' ? 'PT-WEEK' : 'PT-MONTH';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function verifyWebhook(request, rawBody) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const signature = request.headers['paymongo-signature'] || request.headers['x-paymongo-signature'];

  if (typeof signature !== 'string' || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signature.includes(expected);
}

function mapStatus(eventType, payload) {
  const rawStatus = payload?.data?.attributes?.status || '';

  if (String(eventType).includes('paid') || rawStatus === 'paid' || rawStatus === 'succeeded') return 'paid';
  if (String(eventType).includes('failed') || rawStatus === 'failed') return 'failed';
  if (String(eventType).includes('expired') || rawStatus === 'expired') return 'expired';
  if (String(eventType).includes('cancelled') || rawStatus === 'cancelled') return 'cancelled';
  return null;
}

function getCheckoutSession(payload) {
  return payload?.data?.attributes?.data || payload?.data || payload;
}

function getCheckoutAttributes(checkoutSession) {
  return checkoutSession?.attributes || {};
}

async function createLicenseWithRetry(supabase, session, plan) {
  const expiresAt = plan.durationDays ? addDays(plan.durationDays) : null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('licenses')
      .insert({
        license_key: generateLicenseKey(plan.id),
        plan: plan.id,
        status: 'active',
        max_devices: plan.maxDevices,
        expires_at: expiresAt,
        customer_email: session.customer_email || null,
        payment_reference: session.reference_number
      })
      .select('id, license_key')
      .single();

    if (!error) {
      return data;
    }

    if (error.code !== '23505') {
      throw error;
    }
  }

  throw new Error('license_key_collision');
}

async function fulfillLicensePayment(supabase, payload, status) {
  const checkoutSession = getCheckoutSession(payload);
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
    .select('id, device_id, plan, amount, currency, status, reference_number, customer_email, license_id')
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
    await supabase
      .from('license_payment_sessions')
      .update({ status, payment_payload: payload })
      .eq('id', session.id);
    return true;
  }

  if (session.status === 'paid' && session.license_id) {
    await supabase
      .from('license_payment_sessions')
      .update({ payment_payload: payload })
      .eq('id', session.id);
    return true;
  }

  const plan = await getLicensePlan(session.plan, supabase);
  if (!plan || plan.amount !== session.amount || plan.currency !== session.currency) {
    await supabase
      .from('license_payment_sessions')
      .update({ status: 'failed', payment_payload: payload })
      .eq('id', session.id);
    throw new Error('license_payment_plan_mismatch');
  }

  await supabase
    .from('devices')
    .upsert({
      device_id: session.device_id,
      platform: 'android',
      status: 'licensed',
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'device_id' });

  const license = await createLicenseWithRetry(supabase, session, plan);

  await supabase
    .from('license_activations')
    .upsert({
      license_id: license.id,
      device_id: session.device_id,
      last_checked_at: new Date().toISOString()
    }, { onConflict: 'license_id,device_id' });

  await supabase
    .from('licenses')
    .update({ activated_at: new Date().toISOString() })
    .eq('id', license.id);

  await supabase
    .from('devices')
    .update({ status: 'licensed', last_seen_at: new Date().toISOString() })
    .eq('device_id', session.device_id);

  await supabase
    .from('license_payment_sessions')
    .update({
      status: 'paid',
      license_id: license.id,
      paid_at: new Date().toISOString(),
      payment_payload: payload
    })
    .eq('id', session.id);

  return true;
}

module.exports = async function handler(request, response) {
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

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!verifyWebhook(request, rawBody)) {
    sendJson(response, 401, { ok: false, status: 'invalid_signature' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    payload = await readJson(request).catch(() => ({}));
  }

  const eventType = payload?.data?.attributes?.type || payload?.type || '';
  const checkoutSession = getCheckoutSession(payload);
  const paymongoId = checkoutSession?.id || payload?.data?.id || payload?.id;
  const status = mapStatus(eventType, checkoutSession || payload);

  if (!paymongoId || !status) {
    sendJson(response, 200, { ok: true, status: 'ignored' });
    return;
  }

  try {
    const handledLicensePayment = await fulfillLicensePayment(supabase, payload, status);
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
    .eq('paymongo_payment_id', paymongoId);

  if (error) {
    console.error('PayMongo webhook update failed', error.message);
    sendJson(response, 500, { ok: false, status: 'webhook_update_failed' });
    return;
  }

  sendJson(response, 200, { ok: true, status: 'updated' });
};

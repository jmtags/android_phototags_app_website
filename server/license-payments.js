const crypto = require('crypto');
const {
  checkRateLimit,
  cleanText,
  createClientFromEnv,
  readJson,
  sendJson,
  validateDeviceId
} = require('./_business-utils');
const { getLicensePlan, getLicensePlans } = require('./license-plans');

function getSiteUrl(request) {
  return (process.env.SITE_URL || `https://${request.headers.host}`).replace(/\/$/, '');
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function paymongoV2Request(secretKey, path, options = {}) {
  const response = await fetch(`https://api.paymongo.com/v2${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error('paymongo_request_failed');
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function paymongoV1Request(secretKey, path, options = {}) {
  const response = await fetch(`https://api.paymongo.com/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error('paymongo_request_failed');
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getPaymongoErrorSummary(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];

  if (!errors.length) {
    return null;
  }

  return errors
    .slice(0, 3)
    .map((error) => ({
      code: cleanText(error.code, 80) || null,
      detail: cleanText(error.detail, 240) || null,
      source: cleanText(error.source?.pointer || error.source?.attribute, 120) || null
    }));
}

function normalizePlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    amount: plan.amount,
    currency: plan.currency,
    durationDays: plan.durationDays,
    maxDevices: plan.maxDevices,
    features: plan.features
  };
}

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

function isCheckoutPaid(checkoutPayload) {
  const attributes = checkoutPayload?.data?.attributes || checkoutPayload?.attributes || {};
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const intent = attributes.payment_intent?.attributes || {};
  const intentPayments = Array.isArray(intent.payments) ? intent.payments : [];

  return intent.status === 'succeeded'
    || payments.some((payment) => payment?.attributes?.status === 'paid')
    || intentPayments.some((payment) => payment?.attributes?.status === 'paid');
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

async function fulfillPaidSession(supabase, session, checkoutPayload) {
  if (session.status === 'paid' && session.license_id) {
    return session;
  }

  const plan = await getLicensePlan(session.plan, supabase);
  if (!plan || plan.amount !== session.amount || plan.currency !== session.currency) {
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

  const { data, error } = await supabase
    .from('license_payment_sessions')
    .update({
      status: 'paid',
      license_id: license.id,
      paid_at: new Date().toISOString(),
      payment_payload: checkoutPayload
    })
    .eq('id', session.id)
    .select('id, device_id, plan, amount, currency, status, paid_at, expires_at, license_id, reference_number, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function isAdmin(request) {
  const expectedPassword = process.env.ADMIN_PASSWORD || 'phototags2026';
  const receivedPassword = request.headers['x-admin-password'];
  return typeof receivedPassword === 'string' && receivedPassword === expectedPassword;
}

async function listPlans(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, PATCH');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const supabase = createClientFromEnv();
  const plans = await getLicensePlans(supabase, { includeInactive: isAdmin(request) });

  sendJson(response, 200, {
    ok: true,
    plans: plans.map(normalizePlan)
  });
}

async function updatePlan(request, response) {
  if (request.method !== 'PATCH') {
    response.setHeader('Allow', 'GET, PATCH');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!isAdmin(request)) {
    sendJson(response, 401, { ok: false, status: 'unauthorized' });
    return;
  }

  const supabase = createClientFromEnv();
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
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

  const planId = cleanText(body.planId || body.plan_id || body.id, 40).toLowerCase();
  const updates = {};

  if (!/^[a-z0-9_-]{3,40}$/.test(planId)) {
    sendJson(response, 400, { ok: false, status: 'invalid_plan' });
    return;
  }

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 100 || amount > 10000000) {
      sendJson(response, 400, { ok: false, status: 'invalid_amount' });
      return;
    }
    updates.amount = amount;
  }

  if (body.durationDays !== undefined || body.duration_days !== undefined) {
    const rawDuration = body.durationDays ?? body.duration_days;
    const durationDays = rawDuration === null || rawDuration === '' ? null : Number(rawDuration);
    if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 36500)) {
      sendJson(response, 400, { ok: false, status: 'invalid_duration' });
      return;
    }
    updates.duration_days = durationDays;
  }

  if (body.maxDevices !== undefined || body.max_devices !== undefined) {
    const maxDevices = Number(body.maxDevices ?? body.max_devices);
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 1000) {
      sendJson(response, 400, { ok: false, status: 'invalid_max_devices' });
      return;
    }
    updates.max_devices = maxDevices;
  }

  if (body.active !== undefined) {
    updates.active = Boolean(body.active);
  }

  if (!Object.keys(updates).length) {
    sendJson(response, 400, { ok: false, status: 'empty_update' });
    return;
  }

  const { data, error } = await supabase
    .from('license_plan_settings')
    .update(updates)
    .eq('id', planId)
    .select('id, name, description, amount, currency, duration_days, max_devices, features, active, sort_order')
    .maybeSingle();

  if (error || !data) {
    sendJson(response, error?.code === '42P01' ? 500 : 404, {
      ok: false,
      status: error?.code === '42P01' ? 'plan_settings_not_deployed' : 'plan_not_found'
    });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'updated',
    plan: normalizePlan(data)
  });
}

async function createCheckout(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'license_checkout_create', 30, 60 * 1000)) {
    sendJson(response, 429, { ok: false, status: 'rate_limited' });
    return;
  }

  const supabase = createClientFromEnv();
  const secretKey = process.env.PAYMONGO_SECRET_KEY;

  if (!supabase || !secretKey) {
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
  const planId = cleanText(body.planId || body.plan_id, 40).toLowerCase();
  const customerEmail = normalizeEmail(body.customerEmail || body.customer_email);
  const plan = await getLicensePlan(planId, supabase);

  if (!validateDeviceId(deviceId)) {
    sendJson(response, 400, { ok: false, status: 'invalid_device_id' });
    return;
  }

  if (!plan) {
    sendJson(response, 400, { ok: false, status: 'invalid_plan' });
    return;
  }

  const referenceNumber = `PT-${plan.id.toUpperCase()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await supabase
    .from('devices')
    .upsert({
      device_id: deviceId,
      platform: 'android',
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'device_id' });

  const { data: session, error: insertError } = await supabase
    .from('license_payment_sessions')
    .insert({
      device_id: deviceId,
      plan: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'pending',
      reference_number: referenceNumber,
      customer_email: customerEmail,
      expires_at: expiresAt
    })
    .select('id, reference_number')
    .single();

  if (insertError) {
    sendJson(response, 500, { ok: false, status: 'payment_session_save_failed' });
    return;
  }

  const siteUrl = getSiteUrl(request);
  let checkout;

  try {
    checkout = await paymongoV2Request(secretKey, '/checkout_sessions', {
      method: 'POST',
      body: {
        data: {
          attributes: {
            line_items: [
              {
                name: `PhotoTags ${plan.name} License`,
                amount: plan.amount,
                currency: plan.currency,
                quantity: 1
              }
            ],
            payment_method_types: ['qrph'],
            success_url: `${siteUrl}/activate?device_id=${encodeURIComponent(deviceId)}&payment_id=${session.id}&result=success`,
            cancel_url: `${siteUrl}/activate?device_id=${encodeURIComponent(deviceId)}&payment_id=${session.id}&result=cancelled`,
            reference_number: session.reference_number,
            metadata: {
              product: 'phototags_license',
              payment_session_id: session.id,
              device_id: deviceId,
              plan: plan.id,
              customer_email: customerEmail || ''
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('PayMongo license checkout create failed', error.payload || error.message);
    await supabase
      .from('license_payment_sessions')
      .update({ status: 'failed', payment_payload: error.payload || { message: error.message } })
      .eq('id', session.id);
    sendJson(response, 502, {
      ok: false,
      status: 'paymongo_create_failed',
      providerStatusCode: error.statusCode || null,
      providerErrors: getPaymongoErrorSummary(error.payload)
    });
    return;
  }

  const checkoutData = checkout?.data;
  const attributes = checkoutData?.attributes || {};
  const checkoutUrl = attributes.checkout_url || attributes.checkoutUrl || attributes.url || null;

  if (!checkoutUrl || !checkoutData?.id) {
    sendJson(response, 502, { ok: false, status: 'paymongo_response_invalid' });
    return;
  }

  const { error: updateError } = await supabase
    .from('license_payment_sessions')
    .update({
      paymongo_checkout_session_id: checkoutData.id,
      paymongo_checkout_url: checkoutUrl,
      payment_payload: {
        paymongo_id: checkoutData.id,
        reference_number: session.reference_number,
        plan: plan.id
      }
    })
    .eq('id', session.id);

  if (updateError) {
    sendJson(response, 500, { ok: false, status: 'payment_session_update_failed' });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    paymentSessionId: session.id,
    referenceNumber: session.reference_number,
    checkoutUrl,
    expiresAt,
    plan: normalizePlan(plan)
  });
}

async function checkStatus(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'license_payment_status', 120, 60 * 1000)) {
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
  const paymentSessionId = cleanText(body.paymentSessionId || body.payment_session_id, 80);

  if (!validateDeviceId(deviceId) || !/^[0-9a-f-]{36}$/i.test(paymentSessionId)) {
    sendJson(response, 400, { ok: false, status: 'invalid_status_request' });
    return;
  }

  const { data: session, error } = await supabase
    .from('license_payment_sessions')
    .select('id, device_id, plan, amount, currency, status, paid_at, expires_at, license_id, reference_number, paymongo_checkout_session_id, customer_email, updated_at')
    .eq('id', paymentSessionId)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error || !session) {
    sendJson(response, 404, { ok: false, status: 'payment_session_not_found' });
    return;
  }

  let currentSession = session;
  let status = currentSession.status;

  if (status === 'pending' && secretKey && currentSession.paymongo_checkout_session_id) {
    try {
      const checkout = await paymongoV1Request(secretKey, `/checkout_sessions/${encodeURIComponent(currentSession.paymongo_checkout_session_id)}`);

      if (isCheckoutPaid(checkout)) {
        currentSession = await fulfillPaidSession(supabase, currentSession, checkout);
        status = currentSession.status;
      }
    } catch (checkoutError) {
      console.error('PayMongo checkout status fallback failed', checkoutError.payload || checkoutError.message);
    }
  }

  if (status === 'pending' && session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    status = 'expired';
    await supabase.from('license_payment_sessions').update({ status }).eq('id', session.id);
  }

  sendJson(response, 200, {
    ok: true,
    status,
    plan: currentSession.plan,
    amount: currentSession.amount,
    currency: currentSession.currency,
    paidAt: currentSession.paid_at,
    expiresAt: currentSession.expires_at,
    licenseId: currentSession.license_id,
    referenceNumber: currentSession.reference_number,
    updatedAt: currentSession.updated_at
  });
}

module.exports = {
  checkStatus,
  createCheckout,
  listPlans,
  updatePlan
};

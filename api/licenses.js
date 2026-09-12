const { randomBytes } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const LICENSE_STATUSES = new Set(['active', 'revoked', 'refunded', 'expired']);
const LICENSE_PLANS = new Set(['pro_lifetime', 'pro_plus', 'business']);

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createClientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function isAdmin(request) {
  const expectedPassword = process.env.ADMIN_PASSWORD || 'phototags2026';
  const receivedPassword = request.headers['x-admin-password'];
  return typeof receivedPassword === 'string' && receivedPassword === expectedPassword;
}

function getText(body, camelName, snakeName = camelName) {
  const value = body[camelName] ?? body[snakeName];
  return typeof value === 'string' ? value.trim() : '';
}

function getNullableDate(body, camelName, snakeName = camelName) {
  const value = Object.prototype.hasOwnProperty.call(body, camelName)
    ? body[camelName]
    : body[snakeName];

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function generateLicenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `PT-PRO-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function normalizeLicense(row, activations = []) {
  return {
    id: row.id,
    licenseKey: row.license_key,
    plan: row.plan,
    status: row.status,
    maxDevices: row.max_devices,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    customerEmail: row.customer_email,
    paymentReference: row.payment_reference,
    activationCount: activations.length,
    seatsAvailable: Math.max(Number(row.max_devices || 0) - activations.length, 0),
    activations
  };
}

function normalizeActivation(row, device) {
  return {
    id: row.id,
    deviceId: row.device_id,
    activatedAt: row.activated_at,
    lastCheckedAt: row.last_checked_at,
    device: device ? {
      firstSeenAt: device.first_seen_at,
      lastSeenAt: device.last_seen_at,
      appVersion: device.app_version,
      platform: device.platform,
      trialStartedAt: device.trial_started_at,
      trialEndsAt: device.trial_ends_at,
      status: device.status
    } : null
  };
}

function buildSummary(licenses, activationCount, deviceCount) {
  const statusCounts = licenses.reduce((counts, license) => {
    counts[license.status] = (counts[license.status] || 0) + 1;
    return counts;
  }, {});

  return {
    licenses: licenses.length,
    active: statusCounts.active || 0,
    revoked: statusCounts.revoked || 0,
    refunded: statusCounts.refunded || 0,
    expired: statusCounts.expired || 0,
    activations: activationCount,
    devices: deviceCount
  };
}

async function listLicenses(supabase, response) {
  const { data: licenses, error: licensesError } = await supabase
    .from('licenses')
    .select('id, license_key, plan, status, max_devices, created_at, activated_at, expires_at, customer_email, payment_reference')
    .order('created_at', { ascending: false })
    .limit(200);

  if (licensesError) {
    sendJson(response, 500, { ok: false, status: 'licenses_failed' });
    return;
  }

  const { data: activations, error: activationsError } = await supabase
    .from('license_activations')
    .select('id, license_id, device_id, activated_at, last_checked_at')
    .order('last_checked_at', { ascending: false })
    .limit(1000);

  if (activationsError) {
    sendJson(response, 500, { ok: false, status: 'activations_failed' });
    return;
  }

  const { count: deviceCount, error: deviceCountError } = await supabase
    .from('devices')
    .select('device_id', { count: 'exact', head: true });

  if (deviceCountError) {
    sendJson(response, 500, { ok: false, status: 'device_count_failed' });
    return;
  }

  const deviceIds = Array.from(new Set((activations || []).map((activation) => activation.device_id)));
  let devices = [];

  if (deviceIds.length) {
    const { data: deviceRows, error: devicesError } = await supabase
      .from('devices')
      .select('device_id, first_seen_at, last_seen_at, app_version, platform, trial_started_at, trial_ends_at, status')
      .in('device_id', deviceIds);

    if (devicesError) {
      sendJson(response, 500, { ok: false, status: 'devices_failed' });
      return;
    }

    devices = deviceRows || [];
  }

  const devicesById = new Map(devices.map((device) => [device.device_id, device]));
  const activationsByLicense = new Map();

  (activations || []).forEach((activation) => {
    const rows = activationsByLicense.get(activation.license_id) || [];
    rows.push(normalizeActivation(activation, devicesById.get(activation.device_id)));
    activationsByLicense.set(activation.license_id, rows);
  });

  const { data: businesses, error: businessesError } = await supabase
    .from('businesses')
    .select('id, business_name, owner_name, email, status, created_at, updated_at, business_payment_settings(paymongo_public_key, paymongo_secret_key_encrypted, qrph_enabled, webhook_enabled)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (businessesError && businessesError.code !== '42P01') {
    sendJson(response, 500, { ok: false, status: 'businesses_failed' });
    return;
  }

  const { data: businessDevices, error: businessDevicesError } = await supabase
    .from('devices')
    .select('device_id, business_id, app_version, platform, status, paired_at, last_seen_at')
    .not('business_id', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(500);

  if (businessDevicesError && businessDevicesError.code !== '42703') {
    sendJson(response, 500, { ok: false, status: 'business_devices_failed' });
    return;
  }

  const { data: paymentSessions, error: paymentSessionsError } = await supabase
    .from('payment_sessions')
    .select('id, business_id, device_id, mode, amount, currency, status, paid_at, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (paymentSessionsError && paymentSessionsError.code !== '42P01') {
    sendJson(response, 500, { ok: false, status: 'payment_sessions_failed' });
    return;
  }

  const devicesByBusiness = new Map();
  (businessDevices || []).forEach((device) => {
    const rows = devicesByBusiness.get(device.business_id) || [];
    rows.push(device);
    devicesByBusiness.set(device.business_id, rows);
  });

  const paymentsByBusiness = new Map();
  (paymentSessions || []).forEach((payment) => {
    const rows = paymentsByBusiness.get(payment.business_id) || [];
    rows.push(payment);
    paymentsByBusiness.set(payment.business_id, rows);
  });

  const normalizedBusinesses = (businesses || []).map((business) => {
    const settings = Array.isArray(business.business_payment_settings)
      ? business.business_payment_settings[0]
      : business.business_payment_settings;

    return {
      id: business.id,
      businessName: business.business_name,
      ownerName: business.owner_name,
      email: business.email,
      status: business.status,
      createdAt: business.created_at,
      updatedAt: business.updated_at,
      paymongoConnected: Boolean(settings?.paymongo_public_key && settings?.paymongo_secret_key_encrypted),
      qrphEnabled: Boolean(settings?.qrph_enabled),
      webhookEnabled: Boolean(settings?.webhook_enabled),
      linkedDevices: devicesByBusiness.get(business.id) || [],
      paymentSessions: paymentsByBusiness.get(business.id) || []
    };
  });

  sendJson(response, 200, {
    ok: true,
    status: 'ready',
    summary: buildSummary(licenses || [], (activations || []).length, deviceCount || 0),
    licenses: (licenses || []).map((license) => normalizeLicense(license, activationsByLicense.get(license.id) || [])),
    businesses: normalizedBusinesses,
    paymentSessions: paymentSessions || []
  });
}

async function createLicense(supabase, request, response) {
  let body;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const licenseKey = getText(body, 'licenseKey', 'license_key') || generateLicenseKey();
  const plan = getText(body, 'plan') || 'pro_lifetime';
  const status = getText(body, 'status') || 'active';
  const customerEmail = getText(body, 'customerEmail', 'customer_email') || null;
  const paymentReference = getText(body, 'paymentReference', 'payment_reference') || null;
  const maxDevices = Number(body.maxDevices ?? body.max_devices ?? 1);
  const expiresAt = getNullableDate(body, 'expiresAt', 'expires_at');

  if (licenseKey.length < 6 || licenseKey.length > 120) {
    sendJson(response, 400, { ok: false, status: 'invalid_license_key' });
    return;
  }

  if (!LICENSE_PLANS.has(plan) || !LICENSE_STATUSES.has(status)) {
    sendJson(response, 400, { ok: false, status: 'invalid_license_fields' });
    return;
  }

  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 1000 || expiresAt === undefined) {
    sendJson(response, 400, { ok: false, status: 'invalid_license_fields' });
    return;
  }

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      license_key: licenseKey,
      plan,
      status,
      max_devices: maxDevices,
      expires_at: expiresAt,
      customer_email: customerEmail,
      payment_reference: paymentReference
    })
    .select('id, license_key, plan, status, max_devices, created_at, activated_at, expires_at, customer_email, payment_reference')
    .single();

  if (error) {
    const statusCode = error.code === '23505' ? 409 : 500;
    sendJson(response, statusCode, { ok: false, status: statusCode === 409 ? 'license_key_exists' : 'create_failed' });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    status: 'created',
    license: normalizeLicense(data)
  });
}

async function updateLicense(supabase, request, response) {
  let body;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const action = getText(body, 'action');

  if (action === 'unbind_device') {
    const activationId = getText(body, 'activationId', 'activation_id');

    if (!/^[0-9a-f-]{36}$/i.test(activationId)) {
      sendJson(response, 400, { ok: false, status: 'invalid_activation_id' });
      return;
    }

    const { error } = await supabase
      .from('license_activations')
      .delete()
      .eq('id', activationId);

    if (error) {
      sendJson(response, 500, { ok: false, status: 'unbind_failed' });
      return;
    }

    sendJson(response, 200, { ok: true, status: 'unbound' });
    return;
  }

  const id = getText(body, 'id');
  const updates = {};
  const status = getText(body, 'status');
  const plan = getText(body, 'plan');
  const customerEmail = body.customerEmail ?? body.customer_email;
  const paymentReference = body.paymentReference ?? body.payment_reference;
  const maxDevicesValue = body.maxDevices ?? body.max_devices;
  const expiresAt = getNullableDate(body, 'expiresAt', 'expires_at');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    sendJson(response, 400, { ok: false, status: 'invalid_license_id' });
    return;
  }

  if (status) {
    if (!LICENSE_STATUSES.has(status)) {
      sendJson(response, 400, { ok: false, status: 'invalid_status' });
      return;
    }
    updates.status = status;
  }

  if (plan) {
    if (!LICENSE_PLANS.has(plan)) {
      sendJson(response, 400, { ok: false, status: 'invalid_plan' });
      return;
    }
    updates.plan = plan;
  }

  if (maxDevicesValue !== undefined) {
    const maxDevices = Number(maxDevicesValue);
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 1000) {
      sendJson(response, 400, { ok: false, status: 'invalid_max_devices' });
      return;
    }
    updates.max_devices = maxDevices;
  }

  if (customerEmail !== undefined) {
    updates.customer_email = typeof customerEmail === 'string' && customerEmail.trim() ? customerEmail.trim() : null;
  }

  if (paymentReference !== undefined) {
    updates.payment_reference = typeof paymentReference === 'string' && paymentReference.trim() ? paymentReference.trim() : null;
  }

  if (expiresAt !== undefined) {
    updates.expires_at = expiresAt;
  }

  if (!Object.keys(updates).length) {
    sendJson(response, 400, { ok: false, status: 'empty_update' });
    return;
  }

  const { data, error } = await supabase
    .from('licenses')
    .update(updates)
    .eq('id', id)
    .select('id, license_key, plan, status, max_devices, created_at, activated_at, expires_at, customer_email, payment_reference')
    .single();

  if (error) {
    sendJson(response, 500, { ok: false, status: 'update_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'updated',
    license: normalizeLicense(data)
  });
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  if (!isAdmin(request)) {
    sendJson(response, 401, { ok: false, status: 'unauthorized' });
    return;
  }

  if (request.method === 'GET') {
    await listLicenses(supabase, response);
    return;
  }

  if (request.method === 'POST') {
    await createLicense(supabase, request, response);
    return;
  }

  if (request.method === 'PATCH') {
    await updateLicense(supabase, request, response);
    return;
  }

  response.setHeader('Allow', 'GET, POST, PATCH');
  sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
};

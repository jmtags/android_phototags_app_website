const { randomBytes } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { hashPassword } = require('../server/_business-utils');

const LICENSE_STATUSES = new Set(['active', 'revoked', 'refunded', 'expired']);
const LICENSE_PLANS = new Set(['weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus']);
const BUSINESS_STATUSES = new Set(['active', 'suspended', 'closed']);
const DEVICE_STATUSES = new Set(['trial', 'trial_expired', 'licensed', 'blocked']);

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

function generateBusinessPassword() {
  return randomBytes(12).toString('base64url');
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

function normalizeBusiness(row) {
  const settings = Array.isArray(row.business_payment_settings)
    ? row.business_payment_settings[0]
    : row.business_payment_settings;

  return {
    id: row.id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paymongoConnected: Boolean(settings?.paymongo_public_key && settings?.paymongo_secret_key_encrypted),
    qrphEnabled: Boolean(settings?.qrph_enabled),
    webhookEnabled: Boolean(settings?.webhook_enabled),
    linkedDevices: [],
    paymentSessions: []
  };
}

function normalizeDevice(row, business, licenses = [], payments = []) {
  return {
    id: row.id,
    deviceId: row.device_id,
    businessId: row.business_id || null,
    appVersion: row.app_version || '',
    platform: row.platform || 'android',
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    pairedAt: row.paired_at || null,
    createdAt: row.created_at || row.first_seen_at,
    updatedAt: row.updated_at || null,
    business: business ? {
      id: business.id,
      businessName: business.business_name,
      ownerName: business.owner_name,
      email: business.email,
      status: business.status
    } : null,
    licenses,
    payments
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

  const { data: allDevices, error: allDevicesError } = await supabase
    .from('devices')
    .select('id, device_id, business_id, app_version, platform, status, first_seen_at, last_seen_at, trial_started_at, trial_ends_at, paired_at, created_at, updated_at')
    .order('last_seen_at', { ascending: false })
    .limit(500);

  if (allDevicesError) {
    sendJson(response, 500, { ok: false, status: 'all_devices_failed' });
    return;
  }

  const devicesByBusiness = new Map();
  (businessDevices || []).forEach((device) => {
    const rows = devicesByBusiness.get(device.business_id) || [];
    rows.push(device);
    devicesByBusiness.set(device.business_id, rows);
  });

  const paymentsByBusiness = new Map();
  const paymentsByDevice = new Map();
  (paymentSessions || []).forEach((payment) => {
    const rows = paymentsByBusiness.get(payment.business_id) || [];
    rows.push(payment);
    paymentsByBusiness.set(payment.business_id, rows);

    const deviceRows = paymentsByDevice.get(payment.device_id) || [];
    deviceRows.push(payment);
    paymentsByDevice.set(payment.device_id, deviceRows);
  });

  const businessesById = new Map((businesses || []).map((business) => [business.id, business]));
  const licensesById = new Map((licenses || []).map((license) => [license.id, license]));
  const licenseRowsByDevice = new Map();
  (activations || []).forEach((activation) => {
    const license = licensesById.get(activation.license_id);
    if (!license) return;
    const rows = licenseRowsByDevice.get(activation.device_id) || [];
    rows.push({
      activationId: activation.id,
      licenseId: license.id,
      licenseKey: license.license_key,
      plan: license.plan,
      status: license.status,
      activatedAt: activation.activated_at,
      lastCheckedAt: activation.last_checked_at,
      expiresAt: license.expires_at
    });
    licenseRowsByDevice.set(activation.device_id, rows);
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
    devices: (allDevices || []).map((device) => normalizeDevice(
      device,
      businessesById.get(device.business_id),
      licenseRowsByDevice.get(device.device_id) || [],
      paymentsByDevice.get(device.device_id) || []
    )),
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

  if (getText(body, 'action') === 'create_business') {
    await createBusiness(supabase, body, response);
    return;
  }

  const licenseKey = getText(body, 'licenseKey', 'license_key') || generateLicenseKey();
  const plan = getText(body, 'plan') || 'monthly';
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

async function createBusiness(supabase, body, response) {
  const businessName = getText(body, 'businessName', 'business_name');
  const ownerName = getText(body, 'ownerName', 'owner_name');
  const email = getText(body, 'email').toLowerCase();
  const status = getText(body, 'status') || 'active';
  const password = getText(body, 'password') || generateBusinessPassword();

  if (businessName.length < 2 || businessName.length > 160 || ownerName.length < 2 || ownerName.length > 160 || email.length < 5 || email.length > 254) {
    sendJson(response, 400, { ok: false, status: 'invalid_business_fields' });
    return;
  }

  if (!BUSINESS_STATUSES.has(status)) {
    sendJson(response, 400, { ok: false, status: 'invalid_business_status' });
    return;
  }

  if (password.length < 8) {
    sendJson(response, 400, { ok: false, status: 'invalid_business_password' });
    return;
  }

  const { data: account, error: accountError } = await supabase
    .from('business_owner_accounts')
    .insert({ email, password_hash: hashPassword(password) })
    .select('id, email')
    .single();

  if (accountError) {
    sendJson(response, accountError.code === '23505' ? 409 : 500, { ok: false, status: accountError.code === '23505' ? 'business_email_exists' : 'business_account_create_failed' });
    return;
  }

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      owner_user_id: account.id,
      business_name: businessName,
      owner_name: ownerName,
      email,
      status
    })
    .select('id, business_name, owner_name, email, status, created_at, updated_at, business_payment_settings(paymongo_public_key, paymongo_secret_key_encrypted, qrph_enabled, webhook_enabled)')
    .single();

  if (error) {
    await supabase
      .from('business_owner_accounts')
      .delete()
      .eq('id', account.id);
    sendJson(response, 500, { ok: false, status: 'business_create_failed' });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    status: 'business_created',
    business: normalizeBusiness(data),
    temporaryPassword: password
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

  if (action === 'update_business') {
    await updateBusiness(supabase, body, response);
    return;
  }

  if (action === 'update_device') {
    await updateDevice(supabase, body, response);
    return;
  }

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

async function updateDevice(supabase, body, response) {
  const deviceId = getText(body, 'deviceId', 'device_id');
  const status = getText(body, 'status');

  if (deviceId.length < 3 || deviceId.length > 200) {
    sendJson(response, 400, { ok: false, status: 'invalid_device_id' });
    return;
  }

  if (!DEVICE_STATUSES.has(status)) {
    sendJson(response, 400, { ok: false, status: 'invalid_device_status' });
    return;
  }

  const { data, error } = await supabase
    .from('devices')
    .update({ status })
    .eq('device_id', deviceId)
    .select('id, device_id, business_id, app_version, platform, status, first_seen_at, last_seen_at, trial_started_at, trial_ends_at, paired_at, created_at, updated_at')
    .single();

  if (error) {
    sendJson(response, 500, { ok: false, status: 'device_update_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'device_updated',
    device: normalizeDevice(data, null)
  });
}

async function updateBusiness(supabase, body, response) {
  const id = getText(body, 'id');
  const updates = {};
  let nextEmail = null;
  const businessName = body.businessName ?? body.business_name;
  const ownerName = body.ownerName ?? body.owner_name;
  const email = body.email;
  const status = getText(body, 'status');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    sendJson(response, 400, { ok: false, status: 'invalid_business_id' });
    return;
  }

  if (businessName !== undefined) {
    const value = typeof businessName === 'string' ? businessName.trim() : '';
    if (value.length < 2 || value.length > 160) {
      sendJson(response, 400, { ok: false, status: 'invalid_business_name' });
      return;
    }
    updates.business_name = value;
  }

  if (ownerName !== undefined) {
    const value = typeof ownerName === 'string' ? ownerName.trim() : '';
    if (value.length < 2 || value.length > 160) {
      sendJson(response, 400, { ok: false, status: 'invalid_owner_name' });
      return;
    }
    updates.owner_name = value;
  }

  if (email !== undefined) {
    const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (value.length < 5 || value.length > 254) {
      sendJson(response, 400, { ok: false, status: 'invalid_business_email' });
      return;
    }
    updates.email = value;
    nextEmail = value;
  }

  if (status) {
    if (!BUSINESS_STATUSES.has(status)) {
      sendJson(response, 400, { ok: false, status: 'invalid_business_status' });
      return;
    }
    updates.status = status;
  }

  if (!Object.keys(updates).length) {
    sendJson(response, 400, { ok: false, status: 'empty_update' });
    return;
  }

  let existingBusiness = null;
  if (nextEmail) {
    const { data: existing, error: existingError } = await supabase
      .from('businesses')
      .select('id, owner_user_id')
      .eq('id', id)
      .single();

    if (existingError) {
      sendJson(response, 500, { ok: false, status: 'business_lookup_failed' });
      return;
    }

    existingBusiness = existing;
    const { error: accountError } = await supabase
      .from('business_owner_accounts')
      .update({ email: nextEmail })
      .eq('id', existingBusiness.owner_user_id);

    if (accountError) {
      sendJson(response, accountError.code === '23505' ? 409 : 500, { ok: false, status: accountError.code === '23505' ? 'business_email_exists' : 'business_account_update_failed' });
      return;
    }
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(updates)
    .eq('id', id)
    .select('id, business_name, owner_name, email, status, created_at, updated_at, business_payment_settings(paymongo_public_key, paymongo_secret_key_encrypted, qrph_enabled, webhook_enabled)')
    .single();

  if (error) {
    sendJson(response, 500, { ok: false, status: 'business_update_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'business_updated',
    business: normalizeBusiness(data)
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

const {
  createClientFromEnv,
  getText,
  readRequestBody,
  sendJson,
  validateDeviceId
} = require('./_license-utils');
const { reconcileDeviceLicensePayments } = require('./license-payments');

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

  const body = await readRequestBody(request, response);
  if (!body) return;

  const deviceId = getText(body, 'deviceId', 'device_id');
  const licenseKey = getText(body, 'licenseKey', 'license_key') || null;
  const appVersion = getText(body, 'appVersion', 'app_version') || null;
  const platform = getText(body, 'platform') || 'android';

  if (!validateDeviceId(deviceId)) {
    sendJson(response, 400, { ok: false, status: 'invalid_device_id' });
    return;
  }

  const checkArguments = {
    p_device_id: deviceId,
    p_license_key: licenseKey,
    p_app_version: appVersion,
    p_platform: platform
  };
  let { data, error } = await supabase.rpc('check_license_for_device', checkArguments);

  if (error) {
    sendJson(response, 500, { ok: false, status: 'check_failed' });
    return;
  }

  let result = Array.isArray(data) ? data[0] : data;
  if (!result?.licensed && result?.status !== 'blocked' && platform === 'android') {
    try {
      if (await reconcileDeviceLicensePayments(supabase, deviceId)) {
        ({ data, error } = await supabase.rpc('check_license_for_device', checkArguments));
        if (error) {
          sendJson(response, 500, { ok: false, status: 'check_failed' });
          return;
        }
        result = Array.isArray(data) ? data[0] : data;
      }
    } catch (recoveryError) {
      // A provider/database outage must never grant access or erase trial state.
      console.error('Device license payment recovery unavailable', recoveryError.code || recoveryError.message);
    }
  }
  sendJson(response, 200, {
    ok: true,
    status: result?.status || 'unlicensed',
    licensed: Boolean(result?.licensed),
    licenseId: result?.license_id || null,
    plan: result?.plan || null,
    expiresAt: result?.expires_at || null,
    trialStartedAt: result?.trial_started_at || null,
    trialEndsAt: result?.trial_ends_at || null,
    serverTime: result?.server_time || new Date().toISOString()
  });
};

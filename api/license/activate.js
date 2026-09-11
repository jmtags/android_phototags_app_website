const {
  createClientFromEnv,
  getText,
  readRequestBody,
  sendJson,
  validateDeviceId
} = require('../_license-utils');

function statusCodeFor(result) {
  if (result?.ok) return 200;
  if (result?.status === 'license_not_found') return 404;
  if (result?.status === 'device_limit_reached') return 409;
  if (result?.status === 'license_expired') return 410;
  return 403;
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

  const body = await readRequestBody(request, response);
  if (!body) return;

  const deviceId = getText(body, 'deviceId', 'device_id');
  const licenseKey = getText(body, 'licenseKey', 'license_key');
  const appVersion = getText(body, 'appVersion', 'app_version') || null;
  const platform = getText(body, 'platform') || 'android';

  if (!validateDeviceId(deviceId)) {
    sendJson(response, 400, { ok: false, status: 'invalid_device_id' });
    return;
  }

  if (licenseKey.length < 6 || licenseKey.length > 120) {
    sendJson(response, 400, { ok: false, status: 'invalid_license_key' });
    return;
  }

  const { data, error } = await supabase.rpc('activate_license_for_device', {
    p_license_key: licenseKey,
    p_device_id: deviceId,
    p_app_version: appVersion,
    p_platform: platform
  });

  if (error) {
    sendJson(response, 500, { ok: false, status: 'activate_failed' });
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  sendJson(response, statusCodeFor(result), {
    ok: Boolean(result?.ok),
    status: result?.status || 'activate_failed',
    licensed: Boolean(result?.ok),
    licenseId: result?.license_id || null,
    plan: result?.plan || null,
    expiresAt: result?.expires_at || null,
    maxDevices: result?.max_devices || null,
    activatedAt: result?.activated_at || null,
    lastCheckedAt: result?.last_checked_at || null
  });
};

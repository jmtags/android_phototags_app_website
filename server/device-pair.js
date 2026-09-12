const {
  checkRateLimit,
  cleanText,
  createClientFromEnv,
  readJson,
  sendJson,
  validateDeviceId
} = require('./_business-utils');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'device_pair', 20, 10 * 60 * 1000)) {
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
  const pairingCode = cleanText(body.pairingCode || body.pairing_code, 12);
  const appVersion = cleanText(body.appVersion || body.app_version, 80) || null;
  const platform = cleanText(body.platform, 40) || 'android';

  if (!validateDeviceId(deviceId) || !/^[0-9]{6,12}$/.test(pairingCode)) {
    sendJson(response, 400, { ok: false, status: 'invalid_pairing_request' });
    return;
  }

  const { data: code, error: codeError } = await supabase
    .from('device_pairing_codes')
    .select('id, business_id, expires_at, used_at, businesses(business_name)')
    .eq('code', pairingCode)
    .maybeSingle();

  if (codeError || !code || code.used_at || new Date(code.expires_at).getTime() <= Date.now()) {
    sendJson(response, 404, { ok: false, status: 'invalid_or_expired_code' });
    return;
  }

  const { error: deviceError } = await supabase
    .from('devices')
    .upsert({
      device_id: deviceId,
      business_id: code.business_id,
      app_version: appVersion,
      platform,
      status: 'licensed',
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'device_id' });

  if (deviceError) {
    sendJson(response, 500, { ok: false, status: 'device_pair_failed' });
    return;
  }

  await supabase.from('device_pairing_codes').update({ used_at: new Date().toISOString() }).eq('id', code.id);

  const { data: settings } = await supabase
    .from('business_payment_settings')
    .select('paymongo_public_key, paymongo_secret_key_encrypted, qrph_enabled')
    .eq('business_id', code.business_id)
    .maybeSingle();

  sendJson(response, 200, {
    ok: true,
    status: 'paired',
    businessId: code.business_id,
    businessName: code.businesses?.business_name || null,
    paymentEnabled: Boolean(settings?.paymongo_public_key && settings?.paymongo_secret_key_encrypted),
    qrphEnabled: Boolean(settings?.qrph_enabled)
  });
};

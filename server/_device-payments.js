const crypto = require('crypto');
const { cleanText, sendJson } = require('./_business-utils');

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function authenticateDevice(supabase, request, response, deviceId) {
  const token = cleanText(String(request.headers.authorization || '').replace(/^Bearer /i, ''), 200);
  if (!token || !deviceId) {
    sendJson(response, 401, { ok: false, status: 'device_auth_required' });
    return null;
  }
  const { data: device, error } = await supabase.from('devices')
    .select('device_id, business_id, payment_token_hash, businesses(business_name, status)')
    .eq('device_id', deviceId).maybeSingle();
  if (error) {
    sendJson(response, 503, { ok: false, status: 'device_lookup_failed' });
    return null;
  }
  const actual = Buffer.from(tokenHash(token));
  const expected = Buffer.from(device?.payment_token_hash || '');
  if (!device?.business_id || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    sendJson(response, 401, { ok: false, status: 'device_auth_required' });
    return null;
  }
  if (device.businesses?.status !== 'active') {
    sendJson(response, 403, { ok: false, status: 'business_inactive' });
    return null;
  }
  return device;
}

function publicSettings(settings) {
  const configured = Boolean(settings?.paymongo_public_key && settings?.paymongo_secret_key_encrypted);
  return {
    paymentEnabled: configured && Boolean(settings?.qrph_enabled),
    paymongoConfigured: configured,
    qrphEnabled: Boolean(settings?.qrph_enabled),
    webhookConfigured: Boolean(settings?.webhook_enabled && settings?.webhook_secret_encrypted),
    keyMode: settings?.paymongo_public_key?.startsWith('pk_live_') ? 'live' : configured ? 'test' : null,
    settingsUpdatedAt: settings?.updated_at || null
  };
}

module.exports = { authenticateDevice, publicSettings, tokenHash };

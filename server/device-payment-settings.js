const { checkRateLimit, cleanText, createClientFromEnv, readJson, sendJson } = require('./_business-utils');
const { authenticateDevice, publicSettings } = require('./_device-payments');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
  if (!checkRateLimit(request, 'device_payment_settings', 120)) return sendJson(response, 429, { ok: false, status: 'rate_limited' });
  const supabase = createClientFromEnv();
  if (!supabase) return sendJson(response, 500, { ok: false, status: 'server_not_configured' });
  let body;
  try { body = await readJson(request); } catch { return sendJson(response, 400, { ok: false, status: 'invalid_json' }); }
  const device = await authenticateDevice(supabase, request, response, cleanText(body.deviceId, 200));
  if (!device) return;
  const { data, error } = await supabase.from('business_payment_settings').select('*').eq('business_id', device.business_id).maybeSingle();
  if (error) return sendJson(response, 503, { ok: false, status: 'settings_unavailable' });
  sendJson(response, 200, { ok: true, status: 'paired', businessId: device.business_id,
    businessName: device.businesses.business_name, ...publicSettings(data) });
};

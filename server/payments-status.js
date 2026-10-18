const { checkRateLimit, cleanText, createClientFromEnv, readJson, sendJson } = require('./_business-utils');
const { authenticateDevice } = require('./_device-payments');
const { paymentResponse, reconcilePayment } = require('./_native-qrph');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
  if (!checkRateLimit(request, 'payment_status', 120)) return sendJson(response, 429, { ok: false, status: 'rate_limited' });
  const supabase = createClientFromEnv();
  if (!supabase) return sendJson(response, 500, { ok: false, status: 'server_not_configured' });
  let body;
  try { body = await readJson(request); } catch { return sendJson(response, 400, { ok: false, status: 'invalid_json' }); }
  const deviceId = cleanText(body.deviceId, 200);
  const sessionId = cleanText(body.paymentSessionId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return sendJson(response, 400, { ok: false, status: 'invalid_status_request' });
  const device = await authenticateDevice(supabase, request, response, deviceId);
  if (!device) return;
  const { data: session, error } = await supabase.from('payment_sessions').select('*')
    .eq('id', sessionId).eq('business_id', device.business_id).eq('device_id', deviceId).maybeSingle();
  if (error) return sendJson(response, 503, { ok: false, status: 'payment_lookup_failed' });
  if (!session) return sendJson(response, 404, { ok: false, status: 'payment_session_not_found' });
  try { sendJson(response, 200, paymentResponse(await reconcilePayment(supabase, session))); }
  catch { sendJson(response, 503, { ok: false, status: 'payment_status_unavailable' }); }
};

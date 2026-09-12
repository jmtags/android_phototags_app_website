const {
  checkRateLimit,
  cleanText,
  createClientFromEnv,
  readJson,
  sendJson,
  validateDeviceId
} = require('../_business-utils');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  if (!checkRateLimit(request, 'payment_status', 120, 60 * 1000)) {
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

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('business_id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (deviceError || !device?.business_id) {
    sendJson(response, 404, { ok: false, status: 'device_not_paired' });
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from('payment_sessions')
    .select('id, business_id, device_id, status, paid_at, expires_at, updated_at')
    .eq('id', paymentSessionId)
    .eq('business_id', device.business_id)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (sessionError || !session) {
    sendJson(response, 404, { ok: false, status: 'payment_session_not_found' });
    return;
  }

  let status = session.status;
  if (status === 'pending' && session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    status = 'expired';
    await supabase.from('payment_sessions').update({ status }).eq('id', session.id);
  }

  sendJson(response, 200, {
    ok: true,
    status,
    paidAt: session.paid_at,
    expiresAt: session.expires_at,
    updatedAt: session.updated_at
  });
};

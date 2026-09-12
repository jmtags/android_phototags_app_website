const crypto = require('crypto');
const {
  createClientFromEnv,
  readJson,
  sendJson
} = require('./_business-utils');

function verifyWebhook(request, rawBody) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const signature = request.headers['paymongo-signature'] || request.headers['x-paymongo-signature'];

  if (typeof signature !== 'string' || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signature.includes(expected);
}

function mapStatus(eventType, payload) {
  const rawStatus = payload?.data?.attributes?.status || '';

  if (String(eventType).includes('paid') || rawStatus === 'paid' || rawStatus === 'succeeded') return 'paid';
  if (String(eventType).includes('failed') || rawStatus === 'failed') return 'failed';
  if (String(eventType).includes('expired') || rawStatus === 'expired') return 'expired';
  if (String(eventType).includes('cancelled') || rawStatus === 'cancelled') return 'cancelled';
  return null;
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

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!verifyWebhook(request, rawBody)) {
    sendJson(response, 401, { ok: false, status: 'invalid_signature' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    payload = await readJson(request).catch(() => ({}));
  }

  const eventType = payload?.data?.attributes?.type || payload?.type || '';
  const paymongoId = payload?.data?.attributes?.data?.id || payload?.data?.id || payload?.id;
  const status = mapStatus(eventType, payload?.data?.attributes?.data || payload);

  if (!paymongoId || !status) {
    sendJson(response, 200, { ok: true, status: 'ignored' });
    return;
  }

  const updates = {
    status,
    payment_payload: payload
  };

  if (status === 'paid') {
    updates.paid_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('payment_sessions')
    .update(updates)
    .eq('paymongo_payment_id', paymongoId);

  if (error) {
    console.error('PayMongo webhook update failed', error.message);
    sendJson(response, 500, { ok: false, status: 'webhook_update_failed' });
    return;
  }

  sendJson(response, 200, { ok: true, status: 'updated' });
};

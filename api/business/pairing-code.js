const {
  createClientFromEnv,
  getBusinessAuth,
  sendJson
} = require('../_business-utils');

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  const auth = await getBusinessAuth(request, supabase);
  if (!auth) {
    sendJson(response, 401, { ok: false, status: 'unauthenticated' });
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let row = null;
  let error = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await supabase
      .from('device_pairing_codes')
      .insert({
        business_id: auth.business.id,
        code: generateCode(),
        expires_at: expiresAt
      })
      .select('code, expires_at, created_at')
      .single();

    row = result.data;
    error = result.error;
    if (!error) break;
  }

  sendJson(response, error ? 500 : 201, error ? { ok: false, status: 'code_create_failed' } : {
    ok: true,
    status: 'created',
    pairingCode: row
  });
};

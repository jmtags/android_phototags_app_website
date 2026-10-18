const {
  cleanText,
  createClientFromEnv,
  encryptSecret,
  getBusinessAuth,
  readJson,
  sendJson
} = require('./_business-utils');

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

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const action = cleanText(body.action, 40);

  if (action === 'remove' || body.paymongoSecretKey || body.paymongo_secret_key) {
    const { data: pending, error } = await supabase.from('payment_sessions').select('id')
      .eq('business_id', auth.business.id).eq('status', 'pending').limit(1);
    if (error) return sendJson(response, 503, { ok: false, status: 'payment_lookup_failed' });
    if (pending?.length) return sendJson(response, 409, { ok: false, status: 'pending_payments_exist' });
  }

  if (action === 'remove') {
    const { error } = await supabase
      .from('business_payment_settings')
      .upsert({
        business_id: auth.business.id,
        paymongo_public_key: null,
        paymongo_secret_key_encrypted: null,
        webhook_secret_encrypted: null,
        qrph_enabled: false,
        webhook_enabled: false
      }, { onConflict: 'business_id' });

    sendJson(response, error ? 500 : 200, error ? { ok: false, status: 'remove_failed' } : { ok: true, status: 'removed' });
    return;
  }

  const publicKey = cleanText(body.paymongoPublicKey || body.paymongo_public_key, 300);
  const secretKey = cleanText(body.paymongoSecretKey || body.paymongo_secret_key, 300);
  const webhookSecret = cleanText(body.webhookSecret, 300);
  const qrphEnabled = Boolean(body.qrphEnabled ?? body.qrph_enabled);
  const webhookEnabled = Boolean(body.webhookEnabled ?? body.webhook_enabled);

  const { data: existing, error: settingsError } = await supabase
    .from('business_payment_settings')
    .select('paymongo_public_key, paymongo_secret_key_encrypted, webhook_secret_encrypted')
    .eq('business_id', auth.business.id)
    .maybeSingle();

  if (settingsError) return sendJson(response, 503, { ok: false, status: 'settings_unavailable' });

  const keyMode = /^pk_(test|live)_\S+$/.exec(publicKey)?.[1];
  const credentialsChanged = Boolean(secretKey || existing?.paymongo_public_key !== publicKey);
  if (!keyMode || (secretKey && !secretKey.startsWith(`sk_${keyMode}_`)) || (!secretKey && (!existing?.paymongo_secret_key_encrypted || existing.paymongo_public_key !== publicKey))) {
    sendJson(response, 400, { ok: false, status: 'invalid_paymongo_keys' });
    return;
  }

  let encryptedSecret = existing?.paymongo_secret_key_encrypted;
  // A webhook secret from an old account must not authenticate a replacement account.
  let encryptedWebhook = credentialsChanged ? null : existing?.webhook_secret_encrypted;
  try {
    encryptedSecret = secretKey ? encryptSecret(secretKey) : encryptedSecret;
    if (webhookSecret) encryptedWebhook = encryptSecret(webhookSecret);
  } catch {
    sendJson(response, 500, { ok: false, status: 'encryption_not_configured' });
    return;
  }
  if (webhookEnabled && !encryptedWebhook) {
    sendJson(response, 400, { ok: false, status: 'webhook_secret_required' });
    return;
  }

  const { error } = await supabase
    .from('business_payment_settings')
    .upsert({
      business_id: auth.business.id,
      paymongo_public_key: publicKey,
      paymongo_secret_key_encrypted: encryptedSecret,
      webhook_secret_encrypted: encryptedWebhook,
      qrph_enabled: qrphEnabled,
      webhook_enabled: webhookEnabled
    }, { onConflict: 'business_id' });

  sendJson(response, error ? 500 : 200, error ? { ok: false, status: 'save_failed' } : {
    ok: true,
    status: 'saved',
    paymentSettings: {
      paymongoConnected: true,
      paymongoPublicKey: publicKey,
      secretKeySaved: true,
      webhookSecretSaved: Boolean(encryptedWebhook),
      qrphEnabled,
      webhookEnabled
    }
  });
};

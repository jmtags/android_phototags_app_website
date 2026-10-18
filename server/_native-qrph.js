const { decryptSecret, paymongoRequest } = require('./_business-utils');

function paymentResponse(session) {
  return {
    ok: true, paymentSessionId: session.id, requestId: session.request_id,
    status: session.status, amount: session.amount, currency: session.currency,
    mode: session.mode, paymentFlow: session.payment_flow,
    keyMode: session.payment_payload?.key_mode || null,
    qrImageUrl: session.status === 'pending' ? session.qr_image_url : null,
    expiresAt: session.expires_at, paidAt: session.paid_at || null
  };
}

function intentState(session, intent) {
  const attrs = intent?.attributes || {};
  if (intent?.id !== session.paymongo_payment_id || attrs.amount !== session.amount || attrs.currency !== session.currency) {
    throw new Error('payment_details_mismatch');
  }
  if (attrs.status === 'succeeded') {
    const paid = attrs.payments?.some(payment => payment.attributes?.status === 'paid'
      && payment.attributes.amount === session.amount && payment.attributes.currency === session.currency);
    if (!paid) throw new Error('payment_details_mismatch');
    return 'paid';
  }
  if (session.status === 'paid') return 'paid';
  if (attrs.status === 'processing') return 'pending';
  if (attrs.status === 'awaiting_payment_method' && attrs.last_payment_error) return 'failed';
  if (new Date(session.expires_at).getTime() <= Date.now()) return 'expired';
  return session.status;
}

async function reconcilePayment(supabase, session) {
  if (session.payment_flow !== 'qrph' || session.status === 'paid') return session;
  if (!session.paymongo_payment_id) {
    if (session.status === 'pending' && new Date(session.expires_at).getTime() <= Date.now()) {
      const { error } = await supabase.from('payment_sessions').update({ status: 'expired' })
        .eq('id', session.id).eq('status', 'pending').is('paymongo_payment_id', null);
      if (error) throw error;
      const { data, error: readError } = await supabase.from('payment_sessions').select('*').eq('id', session.id).single();
      if (readError) throw readError;
      return data;
    }
    return session;
  }
  const { data: settings, error } = await supabase.from('business_payment_settings')
    .select('paymongo_secret_key_encrypted').eq('business_id', session.business_id).maybeSingle();
  if (error || !settings?.paymongo_secret_key_encrypted) throw new Error('payment_credentials_unavailable');
  const intent = (await paymongoRequest(decryptSecret(settings.paymongo_secret_key_encrypted),
    `/payment_intents/${encodeURIComponent(session.paymongo_payment_id)}`)).data;
  const status = intentState(session, intent);
  const updates = { status };
  if (status === 'paid') updates.paid_at = session.paid_at || new Date().toISOString();
  // Recover the QR after a lost create response or a process restart.
  const qr = intent.attributes?.next_action?.code?.image_url;
  if (qr && status === 'pending') updates.qr_image_url = qr;
  const { error: updateError } = await supabase.from('payment_sessions').update(updates)
    .eq('id', session.id).neq('status', 'paid');
  if (updateError) throw updateError;
  // Read again so a simultaneous paid webhook cannot be reported as pending.
  const { data, error: readError } = await supabase.from('payment_sessions').select('*').eq('id', session.id).single();
  if (readError) throw readError;
  return data;
}

module.exports = { paymentResponse, intentState, reconcilePayment };

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const utils = require('../server/_business-utils');
const { tokenHash } = require('../server/_device-payments');

let db;
utils.createClientFromEnv = () => db;
utils.getBusinessAuth = async () => ({ business: { id: BUSINESS } });
const create = require('../server/payments-create');
const status = require('../server/payments-status');
const settings = require('../server/device-payment-settings');
const webhook = require('../server/paymongo-webhook');
const saveKeys = require('../server/business-paymongo');
const { intentState } = require('../server/_native-qrph');
const BUSINESS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'device-private-token';
const QR = 'data:image/png;base64,aGVsbG8=';

// A small database double exercises handler authorization, ownership filters,
// retry reservations and state updates; PayMongo calls still use the real client.
class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
  select() { return this; }
  eq(k, v) { this.filters.push(r => r[k] === v); return this; }
  neq(k, v) { this.filters.push(r => r[k] !== v); return this; }
  is(k, v) { this.filters.push(r => (r[k] ?? null) === v); return this; }
  gt(k, v) { this.filters.push(r => r[k] > v); return this; }
  limit(n) { this.n = n; return this; }
  insert(value) { this.op = 'insert'; this.value = value; return this; }
  upsert(value) { this.op = 'upsert'; this.value = value; return this; }
  update(value) { this.op = 'update'; this.value = value; return this; }
  single() { this.one = true; return this.run(); }
  maybeSingle() { this.one = true; return this.run(); }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  async run() {
    const rows = db.tables[this.table] || [];
    let result = rows.filter(row => this.filters.every(f => f(row))).slice(0, this.n);
    if (this.op === 'insert') {
      if (rows.some(r => r.business_id === this.value.business_id && r.device_id === this.value.device_id && r.request_id === this.value.request_id)) return { error: { code: '23505' } };
      const row = { id: crypto.randomUUID(), ...this.value };
      rows.push(row); result = [row];
    } else if (this.op === 'update') {
      result.forEach(row => Object.assign(row, this.value));
    } else if (this.op === 'upsert') {
      let row = rows.find(r => r.business_id === this.value.business_id);
      if (!row) { row = {}; rows.push(row); }
      Object.assign(row, this.value); result = [row];
    }
    return { data: structuredClone(this.one ? result[0] || null : result), error: null };
  }
}

function setup() {
  process.env.PAYMONGO_KEYS_ENCRYPTION_SECRET = 'test-only-encryption-secret-long-enough';
  db = { tables: {
    devices: [{ device_id: 'device-one', business_id: BUSINESS, payment_token_hash: tokenHash(TOKEN), businesses: { business_name: 'Test Booth', status: 'active' } }],
    business_payment_settings: [{ business_id: BUSINESS, paymongo_public_key: 'pk_test_example',
      paymongo_secret_key_encrypted: utils.encryptSecret('sk_test_example'), qrph_enabled: true,
      webhook_enabled: true, webhook_secret_encrypted: utils.encryptSecret('whsk_business') }],
    payment_sessions: []
  }, from(table) { return new Query(table); } };
  const calls = [];
  let providerStatus = 'awaiting_next_action';
  let providerAmount = 15000;
  let failAttach = false;
  let failRetrieve = false;
  const intent = () => ({ id: 'pi_example', type: 'payment_intent', attributes: {
    amount: providerAmount, currency: 'PHP', status: providerStatus,
    client_key: 'client_key_private', next_action: { code: { image_url: QR } },
    payments: providerStatus === 'succeeded' ? [{ attributes: { status: 'paid', amount: providerAmount, currency: 'PHP' } }] : []
  } });
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/attach') && failAttach) throw new Error('network lost after attach');
    if (url.endsWith('/pi_example') && failRetrieve) throw new Error('provider unavailable');
    return { ok: true, json: async () => ({ data: url.endsWith('/payment_methods') ? { id: 'pm_example' } : intent() }) };
  };
  return { calls, setPaid() { providerStatus = 'succeeded'; }, mismatch() { providerAmount = 99; },
    loseAttach() { failAttach = true; }, failRetrieve() { failRetrieve = true; } };
}

async function call(handler, body, token = TOKEN) {
  const req = { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': crypto.randomUUID() }, body };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler(req, res);
  return { code: res.statusCode, ...res.body };
}
const payment = () => ({ deviceId: 'device-one', requestId: REQUEST, mode: 'receiptbooth', amount: 15000, currency: 'PHP' });

test('native QR creation uses the paired merchant and returns no credentials; retry reuses its intent', async () => {
  const env = setup();
  const result = await call(create, payment());
  assert.equal(result.code, 201);
  assert.equal(result.qrImageUrl, QR);
  assert.equal(result.paymentFlow, 'qrph');
  assert.equal(env.calls.length, 3);
  const sent = JSON.parse(env.calls[0].options.body).data.attributes;
  assert.deepEqual(sent.payment_method_allowed, ['qrph']);
  assert.equal(sent.amount, 15000);
  assert.equal(sent.metadata.business_id, BUSINESS);
  assert.equal(env.calls[0].options.headers.Authorization, `Basic ${Buffer.from('sk_test_example:').toString('base64')}`);
  assert.equal(env.calls[1].options.headers.Authorization, `Basic ${Buffer.from('pk_test_example:').toString('base64')}`);
  assert.doesNotMatch(JSON.stringify(result), /sk_test|pk_test|client_key/);
  const retry = await call(create, payment());
  assert.equal(retry.paymentSessionId, result.paymentSessionId);
  assert.equal(env.calls.filter(c => c.url.endsWith('/payment_intents')).length, 1);
  assert.equal(db.tables.payment_sessions.length, 1);
  assert.equal((await call(create, { ...payment(), amount: 16000 })).code, 409);
});

test('concurrent retries reserve one local payment and create at most one intent', async () => {
  const env = setup();
  const results = await Promise.all([call(create, payment()), call(create, payment())]);
  assert.equal(db.tables.payment_sessions.length, 1);
  assert.equal(env.calls.filter(c => c.url.endsWith('/payment_intents')).length, 1);
  assert.ok(results.some(r => r.code === 201));
});

test('settings refresh exposes safe flags and enforces device token and active business', async () => {
  setup();
  const result = await call(settings, { deviceId: 'device-one' });
  assert.equal(result.paymentEnabled, true);
  assert.equal(result.webhookConfigured, true);
  assert.equal(result.keyMode, 'test');
  assert.doesNotMatch(JSON.stringify(result), /pk_test|sk_test|whsk|encrypted/);
  assert.equal((await call(create, payment(), 'wrong')).code, 401);
  assert.equal((await call(settings, { deviceId: 'device-one' }, '')).code, 401);
  db.tables.business_payment_settings[0].qrph_enabled = false;
  assert.equal((await call(settings, { deviceId: 'device-one' })).paymentEnabled, false);
  assert.equal((await call(create, payment())).status, 'payments_not_configured');
  db.tables.devices[0].businesses.status = 'suspended';
  assert.equal((await call(settings, { deviceId: 'device-one' })).code, 403);
});

test('status reconciles missed webhooks and prevents access from another business/device', async () => {
  const env = setup();
  const created = await call(create, payment());
  env.setPaid();
  const result = await call(status, { deviceId: 'device-one', paymentSessionId: created.paymentSessionId });
  assert.equal(result.status, 'paid');
  assert.equal(result.qrImageUrl, null);
  assert.ok(result.paidAt);
  db.tables.devices.push({ device_id: 'device-two', business_id: OTHER, payment_token_hash: tokenHash(TOKEN), businesses: { status: 'active' } });
  assert.equal((await call(status, { deviceId: 'device-two', paymentSessionId: created.paymentSessionId })).code, 404);
});

test('a lost attach response recovers the same QR on retry', async () => {
  const env = setup(); env.loseAttach();
  const result = await call(create, payment());
  assert.equal(result.status, 'payment_creation_uncertain');
  const recovered = await call(create, payment());
  assert.equal(recovered.qrImageUrl, QR);
  assert.equal(recovered.paymentSessionId, result.paymentSessionId);
  assert.equal(env.calls.filter(c => c.url.endsWith('/payment_intents')).length, 1);
});

test('amount mismatch and provider outage cannot authorize a booth session', async () => {
  const env = setup();
  const created = await call(create, payment());
  env.setPaid(); env.mismatch();
  const body = { deviceId: 'device-one', paymentSessionId: created.paymentSessionId };
  assert.equal((await call(status, body)).status, 'payment_status_unavailable');
  assert.equal(db.tables.payment_sessions[0].status, 'pending');
  env.failRetrieve();
  assert.equal((await call(status, body)).code, 503);
  assert.equal(db.tables.payment_sessions[0].status, 'pending');
});

test('provider success wins over local expiry; a paid session cannot regress', () => {
  const session = { paymongo_payment_id: 'pi_test', amount: 100, currency: 'PHP', status: 'expired', expires_at: '2020-01-01' };
  const intent = { id: 'pi_test', attributes: { amount: 100, currency: 'PHP', status: 'succeeded', payments: [{ attributes: { status: 'paid', amount: 100, currency: 'PHP' } }] } };
  assert.equal(intentState(session, intent), 'paid');
  intent.attributes.status = 'processing';
  assert.equal(intentState(session, intent), 'pending');
  intent.attributes.status = 'awaiting_next_action';
  assert.equal(intentState(session, intent), 'expired');
  session.status = 'paid';
  assert.equal(intentState(session, intent), 'paid');
});

async function deliverWebhook(businessId, secret, resource, eventType = 'payment.paid') {
  const raw = JSON.stringify({ data: { type: 'event', attributes: { type: eventType, data: resource } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const req = Readable.from([Buffer.from(raw)]);
  req.method = 'POST'; req.url = `/api/paymongo/webhook?businessId=${businessId}`;
  req.headers = { 'paymongo-signature': `t=${timestamp},te=${signature}` };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await webhook(req, res);
  return { code: res.statusCode, ...res.body };
}

test('merchant webhook requires its own signature and reconciles only its own intent', async () => {
  const env = setup(); await call(create, payment()); env.setPaid();
  const resource = { id: 'pay_example', type: 'payment', attributes: { payment_intent_id: 'pi_example' } };
  assert.equal((await deliverWebhook(BUSINESS, 'wrong', resource)).code, 401);
  assert.equal(db.tables.payment_sessions[0].status, 'pending');
  db.tables.business_payment_settings.push({ business_id: OTHER, webhook_enabled: true, webhook_secret_encrypted: utils.encryptSecret('whsk_other') });
  assert.equal((await deliverWebhook(OTHER, 'whsk_other', resource)).status, 'ignored');
  assert.equal(db.tables.payment_sessions[0].status, 'pending');
  assert.equal((await deliverWebhook(BUSINESS, 'whsk_business', resource)).status, 'updated');
  assert.equal(db.tables.payment_sessions[0].status, 'paid');
  assert.equal((await deliverWebhook(BUSINESS, 'whsk_business', resource, 'payment.failed')).code, 200);
  assert.equal(db.tables.payment_sessions[0].status, 'paid');
});

test('credential saves require matching modes and webhook secret, preserve encryption and block pending rotation', async () => {
  setup();
  assert.equal((await call(saveKeys, { paymongoPublicKey: 'pk_live_example', paymongoSecretKey: 'sk_test_example' })).status, 'invalid_paymongo_keys');
  assert.equal((await call(saveKeys, { paymongoPublicKey: 'pk_test_example', paymongoSecretKey: 'sk_test_new', webhookEnabled: true })).status, 'webhook_secret_required');
  const result = await call(saveKeys, { paymongoPublicKey: 'pk_test_example', paymongoSecretKey: 'sk_test_new', webhookEnabled: true, webhookSecret: 'whsk_new', qrphEnabled: true });
  assert.equal(result.code, 200);
  assert.equal(utils.decryptSecret(db.tables.business_payment_settings[0].webhook_secret_encrypted), 'whsk_new');
  assert.doesNotMatch(JSON.stringify(result), /whsk_new|sk_test_new/);
  db.tables.payment_sessions.push({ business_id: BUSINESS, status: 'pending' });
  assert.equal((await call(saveKeys, { action: 'remove' })).status, 'pending_payments_exist');
});

test('pairing returns a rotated token, stores only its hash, and consumes the code once', async () => {
  setup();
  db.tables.device_pairing_codes = [{ id: 'code-id', business_id: BUSINESS, code: '123456', used_at: null,
    expires_at: new Date(Date.now() + 60000).toISOString(), businesses: { business_name: 'Test Booth' } }];
  const pair = require('../server/device-pair');
  const result = await call(pair, { deviceId: 'device-one', pairingCode: '123456', appVersion: '0.2.76' });
  assert.equal(result.status, 'paired');
  assert.ok(result.paymentToken.length >= 40);
  assert.notEqual(result.paymentToken, TOKEN);
  assert.equal(db.tables.devices[0].payment_token_hash, tokenHash(result.paymentToken));
  assert.equal(db.tables.devices[0].paymentToken, undefined);
  assert.equal((await call(settings, { deviceId: 'device-one' }, result.paymentToken)).code, 200);
  assert.equal((await call(settings, { deviceId: 'device-one' }, TOKEN)).code, 401);
  assert.equal((await call(pair, { deviceId: 'device-one', pairingCode: '123456' })).status, 'invalid_or_expired_code');
});

test('a definitive provider rejection is failed without leaking provider diagnostics', async () => {
  setup();
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ errors: [{ detail: 'private-provider-diagnostic' }] }) });
  const result = await call(create, payment());
  assert.equal(result.status, 'paymongo_rejected');
  assert.doesNotMatch(JSON.stringify(result), /private-provider/);
  assert.equal(db.tables.payment_sessions[0].status, 'failed');
  assert.equal((await call(create, payment())).status, 'failed');
});

test('a reservation with no saved intent expires without issuing another provider request', async () => {
  setup();
  global.fetch = async () => { throw new Error('network lost'); };
  const result = await call(create, payment());
  assert.equal(result.status, 'payment_creation_uncertain');
  db.tables.payment_sessions[0].expires_at = '2020-01-01T00:00:00Z';
  const recovered = await call(create, payment());
  assert.equal(recovered.status, 'expired');
  assert.equal(recovered.paymentSessionId, result.paymentSessionId);
});

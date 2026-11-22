const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

let db;
const businessUtils = require('../server/_business-utils');
const licenseUtils = require('../server/_license-utils');
businessUtils.createClientFromEnv = () => db;
licenseUtils.createClientFromEnv = () => db;
const payments = require('../server/license-payments');
const checkLicense = require('../server/license-check');
const webhook = require('../server/paymongo-webhook');

const DEVICE = 'android-license-recovery';
const OTHER_DEVICE = 'android-other-customer';
const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const originalFetch = global.fetch;
const originalSecret = process.env.PAYMONGO_SECRET_KEY;
const originalWebhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

// Exercise the actual handlers and fulfillment writes while keeping external
// PayMongo calls and database I/O deterministic. Unique constraints mirror the
// existing licenses and license_activations migration.
class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
  is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  not(key, operator, value) {
    if (operator !== 'is') throw new Error(`Unsupported filter: ${operator}`);
    this.filters.push(row => (row[key] ?? null) !== value); return this;
  }
  order(key, options = {}) { this.sort = { key, ascending: options.ascending !== false }; return this; }
  limit(value) { this.maximum = value; return this; }
  insert(value) { this.op = 'insert'; this.value = value; return this; }
  upsert(value, options = {}) { this.op = 'upsert'; this.value = value; this.conflict = options.onConflict; return this; }
  update(value) { this.op = 'update'; this.value = value; return this; }
  single() { this.one = true; return this.run(); }
  maybeSingle() { this.one = true; return this.run(); }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  async run() {
    db.queries.push({ table: this.table, op: this.op });
    if (db.failLookup && this.table === 'license_payment_sessions' && this.op === 'select') {
      return { data: null, error: { code: '08006', message: 'Database connection interrupted' } };
    }
    if (this.op === 'update' && db.beforeUpdate) await db.beforeUpdate(this);
    const rows = db.tables[this.table] ||= [];
    let result = rows.filter(row => this.filters.every(filter => filter(row)));
    if (this.sort) {
      const { key, ascending } = this.sort;
      result.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
    }
    if (this.maximum !== undefined) result = result.slice(0, this.maximum);
    if (this.op === 'insert') {
      if (this.table === 'licenses' && rows.some(row => row.license_key.toLowerCase() === this.value.license_key.toLowerCase())) {
        return { data: null, error: { code: '23505', message: 'Duplicate license key' } };
      }
      const row = { id: crypto.randomUUID(), ...structuredClone(this.value) };
      rows.push(row); result = [row];
    } else if (this.op === 'upsert') {
      const columns = (this.conflict || 'id').split(',');
      let row = rows.find(candidate => columns.every(column => candidate[column] === this.value[column]));
      if (!row) { row = { id: crypto.randomUUID() }; rows.push(row); }
      Object.assign(row, structuredClone(this.value)); result = [row];
    } else if (this.op === 'update') {
      result.forEach(row => Object.assign(row, structuredClone(this.value)));
    }
    return { data: structuredClone(this.one ? result[0] || null : result), error: null };
  }
}

function session(overrides = {}) {
  return {
    id: PAYMENT_ID, device_id: DEVICE, plan: 'monthly', amount: 30000, currency: 'PHP',
    status: 'pending', paid_at: null, license_id: null, expires_at: null,
    reference_number: 'PT-MONTHLY-RECOVERY', paymongo_checkout_session_id: 'cs_recovery',
    customer_email: 'customer@example.com', created_at: '2026-11-22T01:00:00.000Z',
    updated_at: '2026-11-22T01:00:00.000Z',
    payment_payload: { plan_snapshot: { duration_days: 30, max_devices: 1 } }, ...overrides
  };
}

function checkout(paymentSession = session(), overrides = {}) {
  return {
    id: paymentSession.paymongo_checkout_session_id,
    type: 'checkout_session',
    attributes: {
      reference_number: paymentSession.reference_number,
      metadata: { product: 'phototags_license', payment_session_id: paymentSession.id,
        device_id: paymentSession.device_id, plan: paymentSession.plan },
      payment_intent: { id: 'pi_recovery', attributes: { status: 'succeeded', amount: paymentSession.amount, currency: 'PHP' } },
      payments: [{ id: 'pay_recovery', attributes: { status: 'paid', amount: paymentSession.amount, currency: 'PHP' } }]
    }, ...overrides
  };
}

function pendingCheckout(paymentSession = session()) {
  const resource = checkout(paymentSession);
  resource.attributes.payment_intent.attributes.status = 'awaiting_payment_method';
  resource.attributes.payments = [];
  return resource;
}

function failedCheckout(paymentSession = session()) {
  const resource = pendingCheckout(paymentSession);
  resource.attributes.payments = [{ id: 'pay_failed_attempt', attributes: { status: 'failed', amount: paymentSession.amount, currency: 'PHP' } }];
  return resource;
}

function setup(sessions = [session()]) {
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_license_recovery';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test_license_recovery';
  const requests = [];
  const resources = new Map(sessions.map(value => [value.paymongo_checkout_session_id, checkout(value)]));
  db = {
    queries: [], rpcCalls: [], failLookup: false,
    tables: {
      license_payment_sessions: structuredClone(sessions), devices: [], licenses: [], license_activations: [],
      license_plan_settings: [{ id: 'monthly', name: 'Monthly', description: '', amount: 30000, currency: 'PHP',
        duration_days: 30, max_devices: 1, active: true, sort_order: 1, features: [] }],
      payment_sessions: [], light_payments: [{ id: 'light-unchanged', status: 'pending' }]
    },
    from(table) { return new Query(table); },
    async rpc(name, args) {
      assert.equal(name, 'check_license_for_device');
      this.rpcCalls.push(structuredClone(args));
      const active = this.tables.license_activations
        .filter(row => row.device_id === args.p_device_id)
        .map(row => this.tables.licenses.find(license => license.id === row.license_id))
        .find(license => license?.status === 'active' && (!license.expires_at || Date.parse(license.expires_at) > Date.now()));
      const blocked = this.tables.devices.some(row => row.device_id === args.p_device_id && row.status === 'blocked');
      return { data: [{ status: active ? 'licensed' : blocked ? 'blocked' : 'trial_expired', licensed: Boolean(active),
        license_id: active?.id || null, plan: active?.plan || null, expires_at: active?.expires_at || null }], error: null };
    }
  };
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.match(url, /^https:\/\/api\.paymongo\.com\/v1\/checkout_sessions\//);
    const resource = resources.get(decodeURIComponent(url.split('/').pop()));
    if (resource instanceof Error) throw resource;
    assert.ok(resource, `Unexpected checkout lookup: ${url}`);
    return { ok: true, json: async () => ({ data: structuredClone(resource) }) };
  };
  return { requests, resources };
}

async function call(handler, body) {
  const request = { method: 'POST', headers: { 'x-forwarded-for': crypto.randomUUID() }, body };
  const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler(request, response);
  return { code: response.statusCode, ...response.body };
}

async function signedWebhook(resource, type = 'checkout_session.payment.paid') {
  const raw = JSON.stringify({ data: { id: `evt_${crypto.randomUUID()}`, type: 'event', attributes: { type, data: resource } } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
  const request = Readable.from([Buffer.from(raw)]);
  request.method = 'POST'; request.headers = { 'paymongo-signature': `t=${timestamp},te=${signature},li=` };
  const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await webhook(request, response);
  return { code: response.statusCode, ...response.body };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.PAYMONGO_SECRET_KEY;
  else process.env.PAYMONGO_SECRET_KEY = originalSecret;
  if (originalWebhookSecret === undefined) delete process.env.PAYMONGO_WEBHOOK_SECRET;
  else process.env.PAYMONGO_WEBHOOK_SECRET = originalWebhookSecret;
});

test('APK license check recovers a paid checkout when the webhook and browser return were missed', async () => {
  const provider = setup();
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android', appVersion: 'test' });
  assert.equal(result.code, 200); assert.equal(result.licensed, true);
  assert.equal(result.plan, 'monthly'); assert.equal(provider.requests.length, 1);
  assert.equal(db.rpcCalls.length, 2);
  assert.equal(db.tables.license_payment_sessions[0].status, 'paid');
  assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
  assert.equal(db.tables.license_activations[0].device_id, DEVICE);
  assert.deepEqual(db.tables.light_payments, [{ id: 'light-unchanged', status: 'pending' }]);
  assert.equal(db.queries.some(query => query.table.startsWith('light_') || query.table === 'payment_sessions'), false);
});

test('device recovery cannot fetch or activate another customer checkout', async () => {
  const other = session({ id: SECOND_PAYMENT_ID, device_id: OTHER_DEVICE, paymongo_checkout_session_id: 'cs_other' });
  const provider = setup([other]);
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.licensed, false); assert.equal(provider.requests.length, 0);
  assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_activations.length, 0);
});

for (const purchaseAge of ['older', 'newer']) {
  test(`bounded recovery advances past abandoned and broken sessions to ${purchaseAge} paid purchases`, async () => {
    const sessions = Array.from({ length: 7 }, (_, index) => session({
      id: crypto.randomUUID(), reference_number: `PT-ROTATE-${index}`,
      paymongo_checkout_session_id: `cs_rotate_${index}`,
      created_at: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      updated_at: new Date(Date.UTC(2020, 1, index + 1)).toISOString()
    }));
    const paid = sessions[6];
    paid.created_at = purchaseAge === 'older' ? '2019-01-01T00:00:00.000Z' : '2021-01-01T00:00:00.000Z';
    const provider = setup(sessions);
    sessions.slice(0, 6).forEach(value => provider.resources.set(value.paymongo_checkout_session_id, pendingCheckout(value)));
    provider.resources.set(sessions[0].paymongo_checkout_session_id, new Error('Old checkout lookup unavailable'));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
      assert.equal(result.licensed, false);
      assert.equal(provider.requests.length, (attempt + 1) * 3);
    }
    assert.equal(new Set(provider.requests.map(request => request.url)).size, 6);
    assert.equal(provider.requests.filter(request => request.url.endsWith('/cs_rotate_0')).length, 1);
    const recovered = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
    assert.equal(recovered.licensed, true);
    assert.ok(provider.requests.length <= 9);
    assert.equal(db.tables.licenses.length, 1);
    assert.equal(db.tables.licenses[0].payment_reference, paid.reference_number);
    assert.equal(db.tables.license_payment_sessions.find(value => value.id === paid.id).status, 'paid');
    assert.equal(db.tables.license_payment_sessions[0].status, 'pending');
  });
}

test('blocked device license check does not reconcile a paid provider checkout', async () => {
  const provider = setup();
  db.tables.devices.push({ device_id: DEVICE, status: 'blocked' });
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.code, 200); assert.equal(result.status, 'blocked'); assert.equal(result.licensed, false);
  assert.equal(provider.requests.length, 0); assert.equal(db.tables.licenses.length, 0);
});

test('already licensed device check does not contact the payment provider', async () => {
  const provider = setup();
  await payments.reconcileLicensePayment(db, structuredClone(db.tables.license_payment_sessions[0]));
  provider.requests.length = 0;
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.code, 200); assert.equal(result.licensed, true);
  assert.equal(provider.requests.length, 0); assert.equal(db.tables.licenses.length, 1);
});

for (const state of ['failed', 'cancelled', 'expired', 'paid']) {
  test(`canonical paid checkout recovers an unfulfilled local ${state} session`, async () => {
    setup([session({ status: state })]);
    const result = await payments.reconcileLicensePayment(db, structuredClone(db.tables.license_payment_sessions[0]));
    assert.equal(result.status, 'paid'); assert.ok(result.license_id);
    assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
  });
}

test('duplicate and concurrent fulfillment issue one license and bind the device once', async () => {
  setup();
  const pending = structuredClone(db.tables.license_payment_sessions[0]);
  await Promise.all([payments.reconcileLicensePayment(db, pending), payments.reconcileLicensePayment(db, pending)]);
  await payments.reconcileLicensePayment(db, structuredClone(db.tables.license_payment_sessions[0]));
  assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
  assert.deepEqual(db.tables.license_payment_sessions[0].payment_payload.plan_snapshot, { duration_days: 30, max_devices: 1 });
});

test('paid checkout keeps its purchased terms when the plan is removed from the catalog', async () => {
  setup();
  db.tables.license_plan_settings = [{ id: 'lifetime', name: 'Lifetime', amount: 100000,
    currency: 'PHP', duration_days: null, max_devices: 5, active: true, features: [] }];
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.licensed, true);
  assert.equal(db.tables.licenses.length, 1);
  assert.equal(db.tables.licenses[0].plan, 'monthly');
  assert.equal(db.tables.licenses[0].max_devices, 1);
  const remaining = Date.parse(db.tables.licenses[0].expires_at) - Date.now();
  assert.ok(remaining > 29 * 86400000 && remaining <= 30 * 86400000);
});

test('legacy checkout without saved terms still uses its existing plan', async () => {
  setup([session({ payment_payload: null })]);
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.licensed, true);
  assert.equal(db.tables.licenses[0].plan, 'monthly');
  assert.equal(db.tables.licenses[0].max_devices, 1);
});

for (const snapshot of [{ duration_days: 30 }, { duration_days: -1, max_devices: 1 },
  { duration_days: 30, max_devices: 0 }, { duration_days: null, max_devices: 'unlimited' }]) {
  test(`removed plan cannot be fulfilled from invalid saved terms ${JSON.stringify(snapshot)}`, async () => {
    setup([session({ plan: 'retired', payment_payload: { plan_snapshot: snapshot } })]);
    await assert.rejects(payments.reconcileLicensePayment(db, session({ plan: 'retired', payment_payload: { plan_snapshot: snapshot } })));
    assert.equal(db.tables.licenses.length, 0);
    assert.equal(db.tables.license_activations.length, 0);
  });
}

const invalidPayments = [
  ['wrong amount', resource => { resource.attributes.payments[0].attributes.amount = 29999; }],
  ['wrong currency', resource => { resource.attributes.payments[0].attributes.currency = 'USD'; }],
  ['wrong checkout ID', resource => { resource.id = 'cs_another_checkout'; }],
  ['wrong resource type', resource => { resource.type = 'payment'; }],
  ['wrong product', resource => { resource.attributes.metadata.product = 'phototags_light'; }],
  ['wrong device', resource => { resource.attributes.metadata.device_id = OTHER_DEVICE; }],
  ['wrong reference', resource => { resource.attributes.reference_number = 'PT-OTHER-PAYMENT'; }],
  ['wrong payment session', resource => { resource.attributes.metadata.payment_session_id = SECOND_PAYMENT_ID; }],
  ['wrong plan', resource => { resource.attributes.metadata.plan = 'lifetime'; }]
];

for (const [description, change] of invalidPayments) {
  test(`fulfillment rejects a paid checkout with ${description} before granting access`, async () => {
    setup();
    const pending = structuredClone(db.tables.license_payment_sessions[0]);
    const resource = checkout(pending); change(resource);
    await assert.rejects(payments.fulfillPaidSession(db, pending, { data: resource }));
    assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_activations.length, 0);
    assert.equal(db.tables.license_payment_sessions[0].status, 'pending');
  });
}

test('a pending provider checkout cannot activate the device', async () => {
  const provider = setup();
  const resource = checkout(); resource.attributes.payment_intent.attributes.status = 'awaiting_payment_method';
  resource.attributes.payments = []; provider.resources.set(resource.id, resource);
  const result = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(result.code, 200); assert.equal(result.licensed, false);
  assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_payment_sessions[0].status, 'pending');
  await assert.rejects(payments.fulfillPaidSession(db, session(), { data: resource }));
});

test('PayMongo outage does not unlock or prevent a later successful license check', async () => {
  const provider = setup(); provider.resources.set('cs_recovery', new Error('Provider temporarily unavailable'));
  const first = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(first.code, 200); assert.equal(first.licensed, false);
  assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_payment_sessions[0].status, 'pending');
  provider.resources.set('cs_recovery', checkout());
  const recovered = await call(checkLicense, { deviceId: DEVICE, platform: 'android' });
  assert.equal(recovered.licensed, true); assert.equal(db.tables.licenses.length, 1);
});

test('browser payment status returns a retryable error when provider confirmation is unavailable', async () => {
  const provider = setup(); provider.resources.set('cs_recovery', new Error('Provider temporarily unavailable'));
  const result = await call(payments.checkStatus, { deviceId: DEVICE, paymentSessionId: PAYMENT_ID });
  assert.equal(result.code, 503); assert.equal(result.ok, false); assert.equal(result.status, 'payment_status_unavailable');
  assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_payment_sessions[0].status, 'pending');
});

test('browser payment status recovers a failed local session when its checkout is paid', async () => {
  setup([session({ status: 'failed' })]);
  const result = await call(payments.checkStatus, { deviceId: DEVICE, paymentSessionId: PAYMENT_ID });
  assert.equal(result.code, 200); assert.equal(result.ok, true); assert.equal(result.status, 'paid');
  assert.ok(result.licenseId); assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
});

test('a signed late failure webhook cannot downgrade a fulfilled paid session', async () => {
  setup();
  await payments.reconcileLicensePayment(db, structuredClone(db.tables.license_payment_sessions[0]));
  const resource = failedCheckout();
  assert.equal(webhook.mapStatus('checkout_session.payment.failed', resource), 'failed');
  const response = await signedWebhook(resource, 'checkout_session.payment.failed');
  assert.equal(response.code, 200);
  assert.equal(db.tables.license_payment_sessions[0].status, 'paid');
  assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
});

test('a failure callback racing with paid fulfillment cannot overwrite the completed session', async () => {
  setup();
  db.beforeUpdate = async query => {
    if (query.table !== 'license_payment_sessions' || query.value.status !== 'failed') return;
    db.beforeUpdate = null;
    await payments.reconcileLicensePayment(db, structuredClone(db.tables.license_payment_sessions[0]));
  };
  const response = await signedWebhook(failedCheckout(), 'checkout_session.payment.failed');
  assert.equal(response.code, 200);
  assert.equal(db.tables.license_payment_sessions[0].status, 'paid');
  assert.equal(db.tables.licenses.length, 1); assert.equal(db.tables.license_activations.length, 1);
});

test('a signed paid webhook without payment detail reconciles its canonical checkout', async () => {
  const provider = setup();
  const resource = checkout(); delete resource.attributes.payment_intent; delete resource.attributes.payments;
  const response = await signedWebhook(resource);
  assert.equal(response.code, 200); assert.equal(db.tables.license_payment_sessions[0].status, 'paid');
  assert.equal(db.tables.licenses.length, 1); assert.equal(provider.requests.length, 1);
});

test('a webhook database lookup failure returns a retryable failure without issuing a license', async () => {
  setup(); db.failLookup = true;
  const response = await signedWebhook(checkout());
  assert.ok(response.code >= 500);
  assert.equal(db.tables.licenses.length, 0); assert.equal(db.tables.license_activations.length, 0);
});

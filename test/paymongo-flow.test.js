const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPaidCheckoutDetails,
  isCheckoutPaid,
  paymongoRequest
} = require('../server/license-payments');
const {
  getWebhookEvent,
  mapStatus,
  verifyWebhook
} = require('../server/paymongo-webhook');

const paidCheckout = {
  id: 'cs_test_paid',
  type: 'checkout_session',
  attributes: {
    reference_number: 'PT-MONTHLY-ABC123',
    metadata: {
      payment_session_id: '11111111-1111-4111-8111-111111111111'
    },
    payment_intent: {
      id: 'pi_test_paid',
      attributes: {
        status: 'succeeded'
      }
    },
    payments: [
      {
        id: 'pay_test_paid',
        attributes: { status: 'paid' }
      }
    ]
  }
};

test('recognizes a paid PayMongo checkout response', () => {
  assert.equal(isCheckoutPaid({ data: paidCheckout }), true);
  assert.deepEqual(getPaidCheckoutDetails({ data: paidCheckout }), { amount: null, currency: null });
  assert.equal(isCheckoutPaid({
    data: {
      id: 'cs_pending',
      attributes: {
        status: 'active',
        payment_intent: { attributes: { status: 'awaiting_payment_method' } },
        payments: []
      }
    }
  }), false);
});

test('reads the paid amount and currency used for fulfillment validation', () => {
  const checkout = structuredClone(paidCheckout);
  checkout.attributes.payments[0].attributes.amount = 30000;
  checkout.attributes.payments[0].attributes.currency = 'PHP';

  assert.deepEqual(getPaidCheckoutDetails({ data: checkout }), { amount: 30000, currency: 'PHP' });
});

test('parses the legacy PayMongo webhook envelope', () => {
  const payload = {
    data: {
      id: 'evt_legacy',
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        data: paidCheckout
      }
    }
  };
  const event = getWebhookEvent(payload);

  assert.equal(event.eventId, 'evt_legacy');
  assert.equal(event.eventType, 'checkout_session.payment.paid');
  assert.equal(event.resource.id, 'cs_test_paid');
  assert.equal(mapStatus(event.eventType, event.resource), 'paid');
  assert.equal(isCheckoutPaid(payload), true);
});

test('parses the current Checkout v2 webhook envelope', () => {
  const event = getWebhookEvent({
    event_type: 'send.webhook',
    data: {
      type: 'checkout_session.payment.paid',
      resource: 'checkout_session',
      livemode: true,
      data: paidCheckout
    }
  });

  assert.equal(event.eventType, 'checkout_session.payment.paid');
  assert.equal(event.resource.id, 'cs_test_paid');
  assert.equal(mapStatus(event.eventType, event.resource), 'paid');
});

test('verifies PayMongo timestamped webhook signatures', () => {
  const previousSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const secret = 'whsk_test_phototags';
  const timestamp = '1791853200';
  const rawBody = JSON.stringify({ data: { type: 'checkout_session.payment.paid' } });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  process.env.PAYMONGO_WEBHOOK_SECRET = secret;
  try {
    assert.equal(verifyWebhook({ headers: { 'paymongo-signature': `t=${timestamp},te=${signature},li=` } }, rawBody), true);
    assert.equal(verifyWebhook({ headers: { 'paymongo-signature': `t=${timestamp},te=invalid,li=` } }, rawBody), false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.PAYMONGO_WEBHOOK_SECRET;
    } else {
      process.env.PAYMONGO_WEBHOOK_SECRET = previousSecret;
    }
  }
});

test('uses the documented v1 route when reconciling a checkout', async () => {
  const previousFetch = global.fetch;
  let requestedUrl = '';

  global.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({ data: paidCheckout })
    };
  };

  try {
    await paymongoRequest('sk_test_example', '/checkout_sessions/cs_test_paid', { apiVersion: 'v1' });
    assert.equal(requestedUrl, 'https://api.paymongo.com/v1/checkout_sessions/cs_test_paid');
  } finally {
    global.fetch = previousFetch;
  }
});

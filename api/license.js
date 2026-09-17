const activate = require('../server/license-activate');
const check = require('../server/license-check');
const licensePayments = require('../server/license-payments');

function routeName(request) {
  return request.query?.route || new URL(request.url || '/', 'https://phototags.local').searchParams.get('route');
}

module.exports = async function handler(request, response) {
  const route = routeName(request);

  if (route === 'activate') {
    await activate(request, response);
    return;
  }

  if (route === 'check') {
    await check(request, response);
    return;
  }

  if (route === 'plans') {
    if (request.method === 'PATCH') {
      await licensePayments.updatePlan(request, response);
      return;
    }

    await licensePayments.listPlans(request, response);
    return;
  }

  if (route === 'create-checkout') {
    await licensePayments.createCheckout(request, response);
    return;
  }

  if (route === 'payment-status') {
    await licensePayments.checkStatus(request, response);
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: false, status: 'route_not_found' }));
};

const webhook = require('../server/paymongo-webhook');

function routeName(request) {
  return request.query?.route || new URL(request.url || '/', 'https://phototags.local').searchParams.get('route');
}

module.exports = async function handler(request, response) {
  const route = routeName(request);

  if (route === 'webhook') {
    await webhook(request, response);
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: false, status: 'route_not_found' }));
};

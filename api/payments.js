const create = require('../server/payments-create');
const status = require('../server/payments-status');

function routeName(request) {
  return request.query?.route || new URL(request.url || '/', 'https://phototags.local').searchParams.get('route');
}

module.exports = async function handler(request, response) {
  const route = routeName(request);

  if (route === 'create') {
    await create(request, response);
    return;
  }

  if (route === 'status') {
    await status(request, response);
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: false, status: 'route_not_found' }));
};

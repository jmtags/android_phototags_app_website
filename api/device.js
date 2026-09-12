const pair = require('../server/device-pair');
const register = require('../server/device-register');

function routeName(request) {
  return request.query?.route || new URL(request.url || '/', 'https://phototags.local').searchParams.get('route');
}

module.exports = async function handler(request, response) {
  const route = routeName(request);

  if (route === 'register') {
    await register(request, response);
    return;
  }

  if (route === 'pair') {
    await pair(request, response);
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: false, status: 'route_not_found' }));
};

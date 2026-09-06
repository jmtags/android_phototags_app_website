const { createClient } = require('@supabase/supabase-js');

function createClientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function cleanHeader(value, maxLength) {
  return typeof value === 'string' && value ? value.slice(0, maxLength) : null;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method Not Allowed');
    return;
  }

  const supabase = createClientFromEnv();

  if (supabase) {
    const city = request.headers['x-vercel-ip-city'];

    await supabase
      .from('site_analytics_events')
      .insert({
        event_type: 'apk_download',
        page_path: '/PhotoTags.apk',
        referrer: request.headers.referer || request.headers.referrer || null,
        user_agent: request.headers['user-agent'] || null,
        country: cleanHeader(request.headers['x-vercel-ip-country'], 8),
        region: cleanHeader(request.headers['x-vercel-ip-country-region'], 80),
        city: typeof city === 'string' ? decodeURIComponent(city).slice(0, 120) : null,
        latitude: cleanHeader(request.headers['x-vercel-ip-latitude'], 32),
        longitude: cleanHeader(request.headers['x-vercel-ip-longitude'], 32),
        timezone: cleanHeader(request.headers['x-vercel-ip-timezone'], 80),
        postal_code: cleanHeader(request.headers['x-vercel-ip-postal-code'], 32)
      });
  }

  response.statusCode = 302;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Location', '/PhotoTags.apk');
  response.end();
};

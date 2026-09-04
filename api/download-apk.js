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

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method Not Allowed');
    return;
  }

  const supabase = createClientFromEnv();

  if (supabase) {
    await supabase
      .from('site_analytics_events')
      .insert({
        event_type: 'apk_download',
        page_path: '/PhotoTags.apk',
        referrer: request.headers.referer || request.headers.referrer || null,
        user_agent: request.headers['user-agent'] || null
      });
  }

  response.statusCode = 302;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Location', '/PhotoTags.apk');
  response.end();
};

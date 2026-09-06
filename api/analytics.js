const { createClient } = require('@supabase/supabase-js');

const EVENT_TYPES = new Set(['site_visit', 'apk_download']);

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

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

function getRequestMetadata(request, body = {}) {
  const forwardedHost = request.headers['x-forwarded-host'];
  const forwardedProto = request.headers['x-forwarded-proto'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host || '';
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'https';
  const pagePath = typeof body.pagePath === 'string' ? body.pagePath.slice(0, 300) : null;
  const referrer = request.headers.referer || request.headers.referrer || null;
  const userAgent = request.headers['user-agent'] || null;
  const city = request.headers['x-vercel-ip-city'];

  return {
    page_path: pagePath || `${proto}://${host}${request.url || ''}`.slice(0, 300),
    referrer: typeof referrer === 'string' ? referrer.slice(0, 500) : null,
    user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
    country: cleanHeader(request.headers['x-vercel-ip-country'], 8),
    region: cleanHeader(request.headers['x-vercel-ip-country-region'], 80),
    city: typeof city === 'string' ? decodeURIComponent(city).slice(0, 120) : null,
    latitude: cleanHeader(request.headers['x-vercel-ip-latitude'], 32),
    longitude: cleanHeader(request.headers['x-vercel-ip-longitude'], 32),
    timezone: cleanHeader(request.headers['x-vercel-ip-timezone'], 80),
    postal_code: cleanHeader(request.headers['x-vercel-ip-postal-code'], 32)
  };
}

function cleanHeader(value, maxLength) {
  return typeof value === 'string' && value ? value.slice(0, maxLength) : null;
}

async function getSummary(supabase, response) {
  const { data, error } = await supabase.rpc('get_site_analytics_summary');

  if (error) {
    sendJson(response, 500, { ok: false, status: 'summary_failed' });
    return;
  }

  const summary = Array.isArray(data) ? data[0] : data;
  const { data: eventRows, error: eventsError } = await supabase
    .from('site_analytics_events')
    .select('event_type, country, region, city, timezone')
    .in('event_type', ['site_visit', 'apk_download'])
    .not('country', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (eventsError) {
    sendJson(response, 500, { ok: false, status: 'locations_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'ready',
    visits: Number(summary?.visits || 0),
    downloads: Number(summary?.downloads || 0),
    firstVisitAt: summary?.first_visit_at || null,
    lastVisitAt: summary?.last_visit_at || null,
    lastDownloadAt: summary?.last_download_at || null,
    topVisitLocations: getTopLocations(eventRows || [], 'site_visit'),
    topDownloadLocations: getTopLocations(eventRows || [], 'apk_download')
  });
}

function getTopLocations(rows, eventType) {
  const counts = new Map();

  rows
    .filter((row) => row.event_type === eventType)
    .forEach((row) => {
      const label = [row.city, row.region, row.country].filter(Boolean).join(', ') || 'Unknown';
      const key = `${label}|${row.timezone || ''}`;
      const current = counts.get(key) || {
        label,
        timezone: row.timezone || null,
        count: 0
      };

      current.count += 1;
      counts.set(key, current);
    });

  return Array.from(counts.values())
    .sort((first, second) => second.count - first.count)
    .slice(0, 8);
}

async function recordEvent(supabase, request, response) {
  let body;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const eventType = typeof body.eventType === 'string' ? body.eventType : '';

  if (!EVENT_TYPES.has(eventType)) {
    sendJson(response, 400, { ok: false, status: 'invalid_event_type' });
    return;
  }

  const { error } = await supabase
    .from('site_analytics_events')
    .insert({
      event_type: eventType,
      ...getRequestMetadata(request, body)
    });

  if (error) {
    sendJson(response, 500, { ok: false, status: 'record_failed' });
    return;
  }

  sendJson(response, 201, { ok: true, status: 'recorded' });
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  if (request.method === 'GET') {
    await getSummary(supabase, response);
    return;
  }

  if (request.method === 'POST') {
    await recordEvent(supabase, request, response);
    return;
  }

  response.setHeader('Allow', 'GET, POST');
  sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
};

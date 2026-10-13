const { createClient } = require('@supabase/supabase-js');

const BUCKET_NAME = 'photobooth-downloads';
const SIGNED_URL_MAX_SECONDS = 10 * 60;
const SIGNED_URL_MIN_SECONDS = 30;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function getCode(request) {
  const rawCode = request.query?.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  return typeof code === 'string' ? code.trim() : '';
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

async function handleDownload(request, response, {
  createSupabaseClient = createClientFromEnv,
  getNow = () => Date.now()
} = {}) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const code = getCode(request);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    sendJson(response, 400, { ok: false, status: 'invalid_code' });
    return;
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  const { data: row, error } = await supabase
    .from('photo_downloads')
    .select('code, file_path, gif_file_path, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    sendJson(response, 500, { ok: false, status: 'lookup_failed' });
    return;
  }

  if (!row) {
    sendJson(response, 404, { ok: false, status: 'not_found' });
    return;
  }

  const now = getNow();
  const expiresAtMs = new Date(row.expires_at).getTime();
  const remainingSeconds = Math.floor((expiresAtMs - now) / 1000);

  if (!Number.isFinite(expiresAtMs) || remainingSeconds <= 0) {
    sendJson(response, 410, {
      ok: false,
      status: 'expired',
      expiresAt: row.expires_at
    });
    return;
  }

  const signedUrlSeconds = Math.max(
    SIGNED_URL_MIN_SECONDS,
    Math.min(SIGNED_URL_MAX_SECONDS, remainingSeconds)
  );

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(row.file_path, signedUrlSeconds);

  const { data: downloadUrlData, error: downloadUrlError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(row.file_path, signedUrlSeconds, {
      download: `phototags-${code}.jpg`
    });

  if (
    signedUrlError ||
    downloadUrlError ||
    !signedUrlData?.signedUrl ||
    !downloadUrlData?.signedUrl
  ) {
    sendJson(response, 500, { ok: false, status: 'signed_url_failed' });
    return;
  }

  let gifSignedUrl = null;
  let gifDownloadUrl = null;

  if (row.gif_file_path) {
    const { data: gifSignedUrlData, error: gifSignedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(row.gif_file_path, signedUrlSeconds);

    const { data: gifDownloadUrlData, error: gifDownloadUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(row.gif_file_path, signedUrlSeconds, {
        download: `phototags-${code}.gif`
      });

    if (
      !gifSignedUrlError &&
      !gifDownloadUrlError &&
      gifSignedUrlData?.signedUrl &&
      gifDownloadUrlData?.signedUrl
    ) {
      gifSignedUrl = gifSignedUrlData.signedUrl;
      gifDownloadUrl = gifDownloadUrlData.signedUrl;
    }
  }

  await supabase.rpc('increment_photo_download_metrics', { download_code: code });

  const payload = {
    ok: true,
    status: 'ready',
    code: row.code,
    signedUrl: signedUrlData.signedUrl,
    downloadUrl: downloadUrlData.signedUrl,
    gifAvailable: Boolean(gifSignedUrl && gifDownloadUrl),
    expiresAt: row.expires_at,
    signedUrlExpiresAt: new Date(now + signedUrlSeconds * 1000).toISOString()
  };

  if (gifSignedUrl && gifDownloadUrl) {
    payload.gifSignedUrl = gifSignedUrl;
    payload.gifDownloadUrl = gifDownloadUrl;
  }

  sendJson(response, 200, payload);
}

function createDownloadHandler(dependencies = {}) {
  return (request, response) => handleDownload(request, response, dependencies);
}

module.exports = createDownloadHandler();
module.exports.createDownloadHandler = createDownloadHandler;

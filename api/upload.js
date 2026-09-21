const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET_NAME = 'photobooth-downloads';
const DOWNLOAD_TTL_MINUTES = 30;
const CODE_LENGTH = 10;
const MAX_CODE_ATTEMPTS = 5;
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_MS = 60 * 1000;
const SOFT_BAN_MS = 15 * 60 * 1000;
const uploadBuckets = new Map();

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

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

function createCode() {
  return crypto
    .randomBytes(16)
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, CODE_LENGTH);
}

function getFirstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getClientFingerprint(request) {
  const forwarded = getFirstHeader(request.headers['x-forwarded-for']);
  const realIp = getFirstHeader(request.headers['x-real-ip']);
  const clientIp = String(forwarded || realIp || request.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 120);
  const userAgent = String(getFirstHeader(request.headers['user-agent']) || 'unknown')
    .trim()
    .slice(0, 240);

  return crypto
    .createHash('sha256')
    .update(`${clientIp}|${userAgent}`)
    .digest('base64url');
}

function pruneUploadBuckets(now) {
  for (const [fingerprint, bucket] of uploadBuckets.entries()) {
    const banExpired = bucket.bannedUntil && bucket.bannedUntil <= now;
    const windowExpired = bucket.resetAt <= now;

    if (banExpired && windowExpired) {
      uploadBuckets.delete(fingerprint);
    }
  }
}

function checkUploadRateLimit(request) {
  const now = Date.now();
  const fingerprint = getClientFingerprint(request);
  const bucket = uploadBuckets.get(fingerprint) || {
    count: 0,
    resetAt: now + UPLOAD_WINDOW_MS,
    bannedUntil: 0
  };

  pruneUploadBuckets(now);

  if (bucket.bannedUntil > now) {
    return {
      allowed: false,
      bannedUntil: bucket.bannedUntil,
      retryAfterSeconds: Math.ceil((bucket.bannedUntil - now) / 1000)
    };
  }

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + UPLOAD_WINDOW_MS;
    bucket.bannedUntil = 0;
  }

  bucket.count += 1;

  if (bucket.count > UPLOAD_LIMIT) {
    bucket.bannedUntil = now + SOFT_BAN_MS;
    uploadBuckets.set(fingerprint, bucket);
    return {
      allowed: false,
      bannedUntil: bucket.bannedUntil,
      retryAfterSeconds: Math.ceil(SOFT_BAN_MS / 1000)
    };
  }

  uploadBuckets.set(fingerprint, bucket);
  return {
    allowed: true,
    remaining: Math.max(UPLOAD_LIMIT - bucket.count, 0),
    resetAt: bucket.resetAt
  };
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

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
    return;
  }

  const uploadRate = checkUploadRateLimit(request);
  if (!uploadRate.allowed) {
    response.setHeader('Retry-After', String(uploadRate.retryAfterSeconds));
    sendJson(response, 429, {
      ok: false,
      status: 'upload_soft_banned',
      limit: UPLOAD_LIMIT,
      windowSeconds: Math.ceil(UPLOAD_WINDOW_MS / 1000),
      retryAfterSeconds: uploadRate.retryAfterSeconds,
      bannedUntil: new Date(uploadRate.bannedUntil).toISOString()
    });
    return;
  }

  const supabase = createClientFromEnv();
  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const contentType = typeof body.contentType === 'string'
    ? body.contentType.toLowerCase().split(';')[0].trim()
    : '';
  const extension = ALLOWED_TYPES[contentType];

  if (!extension) {
    sendJson(response, 400, {
      ok: false,
      status: 'unsupported_content_type',
      allowedContentTypes: Object.keys(ALLOWED_TYPES)
    });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + DOWNLOAD_TTL_MINUTES * 60 * 1000);
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '/');

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = createCode();
    const filePath = `captures/${datePrefix}/${code}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath, { upsert: false });

    if (uploadError || !uploadData?.signedUrl || !uploadData?.token) {
      sendJson(response, 500, { ok: false, status: 'signed_upload_failed' });
      return;
    }

    const { error: insertError } = await supabase
      .from('photo_downloads')
      .insert({
        code,
        file_path: filePath,
        expires_at: expiresAt.toISOString()
      });

    if (!insertError) {
      const origin = process.env.SITE_URL || 'https://phototags.vercel.app';

      sendJson(response, 201, {
        ok: true,
        status: 'ready',
        code,
        filePath,
        bucket: BUCKET_NAME,
        contentType,
        expiresAt: expiresAt.toISOString(),
        qrUrl: `${origin.replace(/\/$/, '')}/download/${code}`,
        signedUploadUrl: uploadData.signedUrl,
        uploadToken: uploadData.token
      });
      return;
    }

    if (insertError.code !== '23505') {
      sendJson(response, 500, { ok: false, status: 'record_create_failed' });
      return;
    }
  }

  sendJson(response, 500, { ok: false, status: 'code_generation_failed' });
};

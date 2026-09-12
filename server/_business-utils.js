const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SESSION_COOKIE = 'phototags_business_session';
const SESSION_DAYS = 14;
const rateLimitBuckets = new Map();

function sendJson(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
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

function cleanText(value, maxLength = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, expectedHash] = String(storedHash || '').split('$');
  const iterations = Number(iterationsText);

  if (scheme !== 'pbkdf2_sha256' || !Number.isInteger(iterations) || !salt || !expectedHash) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}

function parseCookies(request) {
  return String(request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex > -1) {
        cookies[part.slice(0, separatorIndex)] = decodeURIComponent(part.slice(separatorIndex + 1));
      }
      return cookies;
    }, {});
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${expiresAt.toUTCString()}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function createBusinessSession(supabase, ownerUserId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await supabase
    .from('business_sessions')
    .insert({
      owner_user_id: ownerUserId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString()
    });

  if (error) {
    throw error;
  }

  return { token, expiresAt };
}

async function getBusinessAuth(request, supabase) {
  const token = parseCookies(request)[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const { data: session, error: sessionError } = await supabase
    .from('business_sessions')
    .select('id, owner_user_id, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (sessionError || !session || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, owner_user_id, business_name, owner_name, email, status, created_at, updated_at')
    .eq('owner_user_id', session.owner_user_id)
    .maybeSingle();

  if (businessError || !business) {
    return null;
  }

  return { session, business };
}

function getEncryptionKey() {
  const configured = process.env.PAYMONGO_KEYS_ENCRYPTION_SECRET || process.env.BUSINESS_ENCRYPTION_KEY;

  if (!configured || configured.length < 24) {
    return null;
  }

  return crypto.createHash('sha256').update(configured).digest();
}

function encryptSecret(value) {
  const key = getEncryptionKey();

  if (!key) {
    throw new Error('encryption_not_configured');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptSecret(value) {
  const key = getEncryptionKey();
  const [version, ivText, tagText, encryptedText] = String(value || '').split(':');

  if (!key || version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('secret_unavailable');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return Array.isArray(forwarded) ? forwarded[0] : String(forwarded || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function checkRateLimit(request, key, limit = 30, windowMs = 60 * 1000) {
  const bucketKey = `${key}:${getClientIp(request)}`;
  const now = Date.now();
  const current = rateLimitBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };

  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }

  current.count += 1;
  rateLimitBuckets.set(bucketKey, current);
  return current.count <= limit;
}

function validateDeviceId(deviceId) {
  return typeof deviceId === 'string' && deviceId.length >= 3 && deviceId.length <= 200;
}

function validatePaymentInput({ amount, currency, mode }) {
  if (!Number.isInteger(amount) || amount < 100 || amount > 10000000) {
    return 'invalid_amount';
  }

  if (currency !== 'PHP') {
    return 'invalid_currency';
  }

  if (!['photobooth', 'photo_id', 'reprint'].includes(mode)) {
    return 'invalid_mode';
  }

  return null;
}

async function paymongoRequest(secretKey, path, options = {}) {
  const response = await fetch(`https://api.paymongo.com/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error('paymongo_request_failed');
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

module.exports = {
  SESSION_COOKIE,
  checkRateLimit,
  cleanText,
  clearSessionCookie,
  createBusinessSession,
  createClientFromEnv,
  createSessionCookie,
  decryptSecret,
  encryptSecret,
  getBusinessAuth,
  hashPassword,
  normalizeEmail,
  paymongoRequest,
  readJson,
  sendJson,
  validateDeviceId,
  validatePaymentInput,
  verifyPassword
};

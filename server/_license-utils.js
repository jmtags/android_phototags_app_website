const { createClient } = require('@supabase/supabase-js');

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

function getText(body, camelName, snakeName = camelName) {
  const value = body[camelName] ?? body[snakeName];
  return typeof value === 'string' ? value.trim() : '';
}

function getTrialDays() {
  const value = Number(process.env.LICENSE_TRIAL_DAYS || 14);
  return Number.isInteger(value) && value >= 0 && value <= 365 ? value : 14;
}

function validateDeviceId(deviceId) {
  return typeof deviceId === 'string' && deviceId.length >= 3 && deviceId.length <= 200;
}

async function readRequestBody(request, response) {
  try {
    return await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return null;
  }
}

module.exports = {
  createClientFromEnv,
  getText,
  getTrialDays,
  readRequestBody,
  sendJson,
  validateDeviceId
};

const { createClient } = require('@supabase/supabase-js');

const STATUSES = new Set(['pending', 'approved', 'rejected']);

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

function isAdmin(request) {
  const expectedPassword = process.env.ADMIN_PASSWORD || 'phototags2026';
  const receivedPassword = request.headers['x-admin-password'];
  return typeof receivedPassword === 'string' && receivedPassword === expectedPassword;
}

function normalizeComment(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    rating: row.rating,
    commentText: row.comment_text,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at
  };
}

async function listComments(supabase, request, response) {
  const wantsAdmin = request.query?.admin === '1';
  const status = typeof request.query?.status === 'string' ? request.query.status : 'approved';

  if (wantsAdmin && !isAdmin(request)) {
    sendJson(response, 401, { ok: false, status: 'unauthorized' });
    return;
  }

  if (!STATUSES.has(status)) {
    sendJson(response, 400, { ok: false, status: 'invalid_status' });
    return;
  }

  const limit = wantsAdmin ? 100 : 6;
  const { data, error } = await supabase
    .from('site_comments')
    .select('id, display_name, rating, comment_text, status, created_at, approved_at')
    .eq('status', wantsAdmin ? status : 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    sendJson(response, 500, { ok: false, status: 'list_failed' });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    status: 'ready',
    comments: (data || []).map(normalizeComment)
  });
}

async function createComment(supabase, request, response) {
  let body;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const commentText = typeof body.commentText === 'string' ? body.commentText.trim() : '';
  const rating = Number(body.rating);

  if (!displayName || displayName.length > 80 || commentText.length < 3 || commentText.length > 1000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    sendJson(response, 400, { ok: false, status: 'invalid_comment' });
    return;
  }

  const { error } = await supabase
    .from('site_comments')
    .insert({
      display_name: displayName,
      rating,
      comment_text: commentText,
      status: 'pending'
    });

  if (error) {
    sendJson(response, 500, { ok: false, status: 'create_failed' });
    return;
  }

  sendJson(response, 201, {
    ok: true,
    status: 'pending_review',
    message: 'Thanks. Your review will appear after approval.'
  });
}

async function updateComment(supabase, request, response) {
  if (!isAdmin(request)) {
    sendJson(response, 401, { ok: false, status: 'unauthorized' });
    return;
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const status = typeof body.status === 'string' ? body.status : '';

  if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.has(status)) {
    sendJson(response, 400, { ok: false, status: 'invalid_update' });
    return;
  }

  const { error } = await supabase
    .from('site_comments')
    .update({
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null
    })
    .eq('id', id);

  if (error) {
    sendJson(response, 500, { ok: false, status: 'update_failed' });
    return;
  }

  sendJson(response, 200, { ok: true, status: 'updated' });
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  if (request.method === 'GET') {
    await listComments(supabase, request, response);
    return;
  }

  if (request.method === 'POST') {
    await createComment(supabase, request, response);
    return;
  }

  if (request.method === 'PATCH') {
    await updateComment(supabase, request, response);
    return;
  }

  response.setHeader('Allow', 'GET, POST, PATCH');
  sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
};

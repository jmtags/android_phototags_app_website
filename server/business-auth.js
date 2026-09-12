const {
  checkRateLimit,
  cleanText,
  clearSessionCookie,
  createBusinessSession,
  createClientFromEnv,
  createSessionCookie,
  getBusinessAuth,
  hashPassword,
  normalizeEmail,
  readJson,
  sendJson,
  verifyPassword
} = require('./_business-utils');

function publicBusiness(business) {
  return {
    id: business.id,
    businessName: business.business_name,
    ownerName: business.owner_name,
    email: business.email,
    status: business.status,
    createdAt: business.created_at,
    updatedAt: business.updated_at
  };
}

async function register(supabase, request, response) {
  if (!checkRateLimit(request, 'business_register', 8, 10 * 60 * 1000)) {
    sendJson(response, 429, { ok: false, status: 'rate_limited' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const businessName = cleanText(body.businessName || body.business_name, 160);
  const ownerName = cleanText(body.ownerName || body.owner_name, 160);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (businessName.length < 2 || ownerName.length < 2 || email.length < 5 || password.length < 8) {
    sendJson(response, 400, { ok: false, status: 'invalid_registration' });
    return;
  }

  const { data: account, error: accountError } = await supabase
    .from('business_owner_accounts')
    .insert({ email, password_hash: hashPassword(password) })
    .select('id, email')
    .single();

  if (accountError) {
    sendJson(response, accountError.code === '23505' ? 409 : 500, { ok: false, status: accountError.code === '23505' ? 'email_exists' : 'register_failed' });
    return;
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .insert({
      owner_user_id: account.id,
      business_name: businessName,
      owner_name: ownerName,
      email
    })
    .select('id, owner_user_id, business_name, owner_name, email, status, created_at, updated_at')
    .single();

  if (businessError) {
    sendJson(response, 500, { ok: false, status: 'business_create_failed' });
    return;
  }

  const session = await createBusinessSession(supabase, account.id);
  sendJson(response, 201, {
    ok: true,
    status: 'registered',
    business: publicBusiness(business)
  }, {
    'Set-Cookie': createSessionCookie(session.token, session.expiresAt)
  });
}

async function login(supabase, request, response) {
  if (!checkRateLimit(request, 'business_login', 15, 10 * 60 * 1000)) {
    sendJson(response, 429, { ok: false, status: 'rate_limited' });
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    sendJson(response, 400, { ok: false, status: 'invalid_json' });
    return;
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  const { data: account, error: accountError } = await supabase
    .from('business_owner_accounts')
    .select('id, email, password_hash')
    .eq('email', email)
    .maybeSingle();

  if (accountError || !account || !verifyPassword(password, account.password_hash)) {
    sendJson(response, 401, { ok: false, status: 'invalid_credentials' });
    return;
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, owner_user_id, business_name, owner_name, email, status, created_at, updated_at')
    .eq('owner_user_id', account.id)
    .maybeSingle();

  if (businessError || !business) {
    sendJson(response, 404, { ok: false, status: 'business_not_found' });
    return;
  }

  const session = await createBusinessSession(supabase, account.id);
  sendJson(response, 200, {
    ok: true,
    status: 'logged_in',
    business: publicBusiness(business)
  }, {
    'Set-Cookie': createSessionCookie(session.token, session.expiresAt)
  });
}

module.exports = async function handler(request, response) {
  const supabase = createClientFromEnv();

  if (!supabase) {
    sendJson(response, 500, { ok: false, status: 'server_not_configured' });
    return;
  }

  if (request.method === 'GET') {
    const auth = await getBusinessAuth(request, supabase);
    sendJson(response, auth ? 200 : 401, auth ? { ok: true, status: 'authenticated', business: publicBusiness(auth.business) } : { ok: false, status: 'unauthenticated' });
    return;
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await readJson(request);
    } catch {
      sendJson(response, 400, { ok: false, status: 'invalid_json' });
      return;
    }

    request.body = body;
    if (body.action === 'register') {
      await register(supabase, request, response);
      return;
    }

    await login(supabase, request, response);
    return;
  }

  if (request.method === 'DELETE') {
    sendJson(response, 200, { ok: true, status: 'logged_out' }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  response.setHeader('Allow', 'GET, POST, DELETE');
  sendJson(response, 405, { ok: false, status: 'method_not_allowed' });
};

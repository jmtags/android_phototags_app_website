const test = require('node:test');
const assert = require('node:assert/strict');

const { createUploadHandler } = require('../api/upload');
const { createDownloadHandler } = require('../api/download');

const NOW = Date.parse('2026-10-13T08:00:00.000Z');
const CODE = 'GIFTEST123';

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = JSON.parse(value);
    }
  };
}

function createUploadSupabase() {
  const uploadPaths = [];
  const insertedRows = [];

  return {
    uploadPaths,
    insertedRows,
    client: {
      storage: {
        from() {
          return {
            async createSignedUploadUrl(path) {
              uploadPaths.push(path);
              return {
                data: {
                  signedUrl: `https://storage.test/upload/${encodeURIComponent(path)}`,
                  token: `token-${uploadPaths.length}`
                },
                error: null
              };
            }
          };
        }
      },
      from() {
        return {
          async insert(row) {
            insertedRows.push(row);
            return { error: null };
          }
        };
      }
    }
  };
}

function createDownloadSupabase(row, { missingGif = false } = {}) {
  const signedPaths = [];
  let metricsCalls = 0;

  const client = {
    storage: {
      from() {
        return {
          async createSignedUrl(path, _seconds, options) {
            signedPaths.push({ path, options });
            if (missingGif && path.endsWith('.gif')) {
              return { data: null, error: { message: 'Object not found' } };
            }

            const kind = options?.download ? 'download' : 'preview';
            return {
              data: { signedUrl: `https://storage.test/${kind}/${encodeURIComponent(path)}` },
              error: null
            };
          }
        };
      }
    },
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: row, error: null };
        }
      };
    },
    async rpc() {
      metricsCalls += 1;
      return { error: null };
    }
  };

  return {
    client,
    signedPaths,
    get metricsCalls() {
      return metricsCalls;
    }
  };
}

function createUpload(body, supabase) {
  const handler = createUploadHandler({
    createSupabaseClient: () => supabase.client,
    createUploadCode: () => CODE,
    getNow: () => new Date(NOW),
    rateLimit: () => ({ allowed: true })
  });
  const response = createResponse();
  return handler({ method: 'POST', body, headers: {} }, response).then(() => response);
}

function createDownload(code, supabase) {
  const handler = createDownloadHandler({
    createSupabaseClient: () => supabase.client,
    getNow: () => NOW
  });
  const response = createResponse();
  return handler({ method: 'GET', query: { code } }, response).then(() => response);
}

test('creates a backward-compatible JPEG-only upload slot', async () => {
  const supabase = createUploadSupabase();
  const response = await createUpload({ contentType: 'image/jpeg' }, supabase);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.signedUploadUrl.includes(`${CODE}.jpg`), true);
  assert.equal('signedGifUploadUrl' in response.body, false);
  assert.deepEqual(supabase.uploadPaths, [`captures/2026/10/13/${CODE}.jpg`]);
  assert.equal(supabase.insertedRows[0].gif_file_path, null);
});

test('creates JPEG and GIF upload slots under one code', async () => {
  const supabase = createUploadSupabase();
  const response = await createUpload({ contentType: 'image/jpeg', includeGif: true }, supabase);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.gifContentType, 'image/gif');
  assert.equal(response.body.gifFilePath, `captures/2026/10/13/${CODE}.gif`);
  assert.equal(response.body.signedGifUploadUrl.includes(`${CODE}.gif`), true);
  assert.deepEqual(supabase.uploadPaths, [
    `captures/2026/10/13/${CODE}.jpg`,
    `captures/2026/10/13/${CODE}.gif`
  ]);
  assert.equal(supabase.insertedRows[0].gif_file_path, `captures/2026/10/13/${CODE}.gif`);
});

test('returns JPEG and GIF signed download URLs when both exist', async () => {
  const supabase = createDownloadSupabase({
    code: CODE,
    file_path: `captures/2026/10/13/${CODE}.jpg`,
    gif_file_path: `captures/2026/10/13/${CODE}.gif`,
    expires_at: '2026-10-13T08:30:00.000Z'
  });
  const response = await createDownload(CODE, supabase);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.gifAvailable, true);
  assert.equal(response.body.gifSignedUrl.includes(`${CODE}.gif`), true);
  assert.equal(response.body.gifDownloadUrl.includes(`${CODE}.gif`), true);
  assert.equal(supabase.signedPaths[3].options.download, `phototags-${CODE}.gif`);
});

test('returns the unchanged JPEG fields for a JPEG-only session', async () => {
  const supabase = createDownloadSupabase({
    code: CODE,
    file_path: `captures/2026/10/13/${CODE}.jpg`,
    gif_file_path: null,
    expires_at: '2026-10-13T08:30:00.000Z'
  });
  const response = await createDownload(CODE, supabase);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.signedUrl.includes(`${CODE}.jpg`), true);
  assert.equal(response.body.downloadUrl.includes(`${CODE}.jpg`), true);
  assert.equal(response.body.gifAvailable, false);
  assert.equal(supabase.signedPaths.length, 2);
});

test('returns JPEG-only when the optional GIF object is missing', async () => {
  const supabase = createDownloadSupabase({
    code: CODE,
    file_path: `captures/2026/10/13/${CODE}.jpg`,
    gif_file_path: `captures/2026/10/13/${CODE}.gif`,
    expires_at: '2026-10-13T08:30:00.000Z'
  }, { missingGif: true });
  const response = await createDownload(CODE, supabase);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.gifAvailable, false);
  assert.equal('gifSignedUrl' in response.body, false);
  assert.equal(response.body.signedUrl.includes(`${CODE}.jpg`), true);
});

test('rejects an expired download before signing either object', async () => {
  const supabase = createDownloadSupabase({
    code: CODE,
    file_path: `captures/2026/10/13/${CODE}.jpg`,
    gif_file_path: `captures/2026/10/13/${CODE}.gif`,
    expires_at: '2026-10-13T07:59:59.000Z'
  });
  const response = await createDownload(CODE, supabase);

  assert.equal(response.statusCode, 410);
  assert.equal(response.body.status, 'expired');
  assert.equal(supabase.signedPaths.length, 0);
});

test('rejects an invalid download code before creating a Supabase client', async () => {
  let clientCreated = false;
  const handler = createDownloadHandler({
    createSupabaseClient: () => {
      clientCreated = true;
      return null;
    },
    getNow: () => NOW
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { code: '../bad' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.status, 'invalid_code');
  assert.equal(clientCreated, false);
});

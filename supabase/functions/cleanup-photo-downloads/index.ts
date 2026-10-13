import { createClient } from 'npm:@supabase/supabase-js@2.114.0';

const BUCKET_NAME = 'photobooth-downloads';
const BATCH_SIZE = 200;
const MAX_BATCHES = 5;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, status: 'method_not_allowed' });
  }

  const cleanupSecret = Deno.env.get('PHOTO_CLEANUP_SECRET') || '';
  const suppliedSecret = request.headers.get('x-cleanup-secret') || '';

  if (!cleanupSecret || suppliedSecret !== cleanupSecret) {
    return jsonResponse(401, { ok: false, status: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, status: 'server_not_configured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let deleted = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const { data: rows, error: selectError } = await supabase
      .from('photo_downloads')
      .select('id, file_path, gif_file_path')
      .lte('cleanup_after', new Date().toISOString())
      .order('cleanup_after', { ascending: true })
      .limit(BATCH_SIZE);

    if (selectError) {
      return jsonResponse(500, {
        ok: false,
        status: 'record_lookup_failed',
        deleted,
        batches
      });
    }

    if (!rows?.length) {
      break;
    }

    const paths = rows.flatMap((row) => [row.file_path, row.gif_file_path]
      .filter((path): path is string => typeof path === 'string' && path.length > 0));
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(paths);

    if (storageError) {
      return jsonResponse(500, {
        ok: false,
        status: 'storage_delete_failed',
        deleted,
        batches
      });
    }

    const ids = rows.map((row) => row.id);
    const { error: deleteError } = await supabase
      .from('photo_downloads')
      .delete()
      .in('id', ids);

    if (deleteError) {
      return jsonResponse(500, {
        ok: false,
        status: 'record_delete_failed',
        deleted,
        batches
      });
    }

    deleted += rows.length;
    batches += 1;

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }

  return jsonResponse(200, {
    ok: true,
    status: 'cleanup_complete',
    deleted,
    batches,
    hasMore: batches === MAX_BATCHES
  });
});

# PhotoTags QR Photo Download Flow

## Supabase Setup

Run `supabase/migrations/202609030001_photo_downloads.sql` manually in the Supabase SQL editor.

The migration creates:

- Private Storage bucket: `photobooth-downloads`
- Table: `public.photo_downloads`
- RLS enabled on `photo_downloads`
- Server-only helper functions for download metrics and cleanup

## Vercel Environment Variables

Set these in the Vercel project settings:

```text
SUPABASE_URL=https://zizzmsaybcqbqgtzzpst.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
SITE_URL=https://phototags.vercel.app
ADMIN_PASSWORD=phototags2026
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist in trusted server environments like Vercel. Do not put it in Android or browser code.
No `VITE_SUPABASE_*` variables are needed for deployment because the browser calls the website API instead of Supabase directly.

## Android Contract

After the decorated photo is finished:

1. Ask the website API to create an upload slot:

```http
POST https://phototags.vercel.app/api/upload
Content-Type: application/json

{
  "contentType": "image/jpeg",
  "includeGif": true
}
```

Allowed `contentType` values are `image/jpeg`, `image/png`, and `image/webp`.
`includeGif` is optional and defaults to `false`, so installed app versions that only send `contentType` remain supported.

2. The API returns the code, private Storage path, QR URL, expiry, and signed Supabase upload URL:

```json
{
  "ok": true,
  "status": "ready",
  "code": "AbC123xy90",
  "filePath": "captures/2026/09/03/AbC123xy90.jpg",
  "bucket": "photobooth-downloads",
  "contentType": "image/jpeg",
  "gifFilePath": "captures/2026/09/03/AbC123xy90.gif",
  "gifContentType": "image/gif",
  "expiresAt": "2026-09-03T09:30:00.000Z",
  "qrUrl": "https://phototags.vercel.app/download/AbC123xy90",
  "signedUploadUrl": "https://zizzmsaybcqbqgtzzpst.supabase.co/storage/v1/object/upload/sign/...",
  "signedGifUploadUrl": "https://zizzmsaybcqbqgtzzpst.supabase.co/storage/v1/object/upload/sign/...",
  "uploadToken": "..."
}
```

3. Upload the JPEG, PNG, or WebP bytes to `signedUploadUrl` using an HTTP `PUT` request.

```text
Content-Type: image/jpeg
cache-control: max-age=3600
```

When `signedGifUploadUrl` is present, upload the animated GIF bytes to it with `Content-Type: image/gif`. The JPEG and GIF share the same download code and expiry. A GIF upload is optional; failure or absence of the GIF does not prevent the JPEG QR download from working.

4. Show a QR code pointing to the returned `qrUrl`:

```text
https://phototags.vercel.app/download/{code}
```

The API creates one database row server-side with a 30-minute expiry and stores both object paths when GIF was requested. Android does not need direct table insert permissions or the Supabase service role key.
Each session is retained for 24 hours for operational recovery, then both objects become eligible for automatic deletion. The private bucket rejects individual files larger than 15 MB.

## Website Behavior

The customer page calls:

```text
GET /api/download?code={code}
```

The API validates the code, rejects expired rows, creates short-lived signed Storage URLs, and returns the preview/download links. Signed URLs last no longer than 10 minutes and never past the row expiry. Existing `signedUrl` and `downloadUrl` fields continue to represent the finished JPEG. When the GIF object exists, the response also includes `gifAvailable: true`, `gifSignedUrl`, and `gifDownloadUrl`. A missing optional GIF object returns `gifAvailable: false` and leaves the JPEG response usable.

## Cleanup

Link the Supabase CLI to the project, then create one strong random secret. Save the same value as an Edge Function secret and in Vault:

```powershell
npx supabase link --project-ref zizzmsaybcqbqgtzzpst
npx supabase secrets set PHOTO_CLEANUP_SECRET=replace-with-a-long-random-secret
```

```sql
select vault.create_secret(
  'https://zizzmsaybcqbqgtzzpst.supabase.co',
  'phototags_project_url'
);

select vault.create_secret(
  'replace-with-the-same-long-random-secret',
  'phototags_photo_cleanup_secret'
);
```

Deploy the function, then apply the database migration that creates the retention column and hourly Cron job:

```powershell
npx supabase functions deploy cleanup-photo-downloads --no-verify-jwt
npx supabase db push
```

The migration creates an hourly Supabase Cron job named `cleanup-phototags-photos-hourly`. It invokes the Edge Function at 17 minutes past each hour. The function processes up to 1,000 expired session rows per run, removes both `file_path` and optional `gif_file_path` through the Storage API, and only then deletes their `photo_downloads` rows. Storage failures retain the rows for the next retry.

Check recent runs in Supabase Dashboard under **Integrations > Cron**, or query:

```sql
select status, start_time, end_time, return_message
from cron.job_run_details
order by start_time desc
limit 20;
```

## Website Analytics

Run `supabase/migrations/202609040001_site_analytics.sql` manually in the Supabase SQL editor to enable real analytics.
Run `supabase/migrations/202609060002_analytics_locations.sql` manually after that to store Vercel request location headers.

The website records:

- `site_visit` when the public home page loads
- `apk_download` when someone downloads through `/api/download-apk`

The admin page reads totals from:

```text
GET /api/analytics
```

APK buttons now link to:

```text
https://phototags.vercel.app/api/download-apk
```

Location analytics come from Vercel request headers such as `x-vercel-ip-country`, `x-vercel-ip-country-region`, and `x-vercel-ip-city`.

## Website Comments

Run `supabase/migrations/202609060001_site_comments.sql` manually in the Supabase SQL editor to enable customer reviews.

The public website:

- Loads only `approved` comments from `GET /api/comments?status=approved`
- Creates new comments as `pending` through `POST /api/comments`

The admin page:

- Loads pending, approved, and rejected comments with `GET /api/comments?admin=1&status={status}`
- Approves or rejects comments with `PATCH /api/comments`
- Uses the `ADMIN_PASSWORD` Vercel environment variable for moderation API calls

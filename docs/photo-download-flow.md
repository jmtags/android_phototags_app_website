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
VITE_SUPABASE_URL=https://zizzmsaybcqbqgtzzpst.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_WE4iqiTRl4mAix7G__LGLQ_W42XqyEA
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
PUBLIC_SITE_URL=https://phototags.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist in trusted server environments like Vercel. Do not put it in Android or browser code.

## Android Contract

After the decorated photo is finished:

1. Ask the website API to create an upload slot:

```http
POST https://phototags.vercel.app/api/upload
Content-Type: application/json

{
  "contentType": "image/jpeg"
}
```

Allowed `contentType` values are `image/jpeg`, `image/png`, and `image/webp`.

2. The API returns the code, private Storage path, QR URL, expiry, and signed Supabase upload URL:

```json
{
  "ok": true,
  "status": "ready",
  "code": "AbC123xy90",
  "filePath": "captures/2026/09/03/AbC123xy90.jpg",
  "bucket": "photobooth-downloads",
  "contentType": "image/jpeg",
  "expiresAt": "2026-09-03T09:30:00.000Z",
  "qrUrl": "https://phototags.vercel.app/download/AbC123xy90",
  "signedUploadUrl": "https://zizzmsaybcqbqgtzzpst.supabase.co/storage/v1/object/upload/sign/...",
  "uploadToken": "..."
}
```

3. Upload the JPEG, PNG, or WebP bytes to `signedUploadUrl` using an HTTP `PUT` request.

```text
Content-Type: image/jpeg
cache-control: max-age=3600
```

4. Show a QR code pointing to the returned `qrUrl`:

```text
https://phototags.vercel.app/download/{code}
```

The API creates the database row server-side with a 30-minute expiry. Android does not need direct table insert permissions or the Supabase service role key.

## Website Behavior

The customer page calls:

```text
GET /api/download/{code}
```

The API validates the code, rejects expired rows, creates short-lived signed Storage URLs, and returns the preview/download links. Signed URLs last no longer than 10 minutes and never past the row expiry.

## Cleanup

Later cleanup code can call `delete_expired_photo_download_rows()` from trusted server code, then delete the returned file paths from the `photobooth-downloads` bucket.

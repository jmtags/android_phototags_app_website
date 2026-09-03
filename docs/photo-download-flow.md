# PhotoTags QR Photo Download Flow

## Supabase Setup

Run `supabase/migrations/202609030001_photo_downloads.sql` manually in the Supabase SQL editor.

The migration creates:

- Private Storage bucket: `photobooth-downloads`
- Table: `public.photo_downloads`
- RLS insert policies for Android anon uploads and row creation
- Server-only helper functions for download metrics and cleanup

## Vercel Environment Variables

Set these in the Vercel project settings:

```text
VITE_SUPABASE_URL=https://zizzmsaybcqbqgtzzpst.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_WE4iqiTRl4mAix7G__LGLQ_W42XqyEA
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist in trusted server environments like Vercel. Do not put it in Android or browser code.

## Android Contract

After the decorated photo is finished:

1. Generate a short random code, for example 8 to 12 characters using `A-Z`, `a-z`, `0-9`, `_`, or `-`.
2. Upload the JPEG, PNG, or WebP into the private bucket using a unique path:

```text
bucket: photobooth-downloads
path: captures/{code}.jpg
```

3. Insert a row into `photo_downloads` using the public anon key:

```json
{
  "code": "AbC123xy",
  "file_path": "captures/AbC123xy.jpg",
  "expires_at": "2026-09-03T09:30:00.000Z"
}
```

Use `now + 30 minutes` for `expires_at`.

4. Show a QR code pointing to:

```text
https://phototags.vercel.app/download/{code}
```

## Website Behavior

The customer page calls:

```text
GET /api/download/{code}
```

The API validates the code, rejects expired rows, creates short-lived signed Storage URLs, and returns the preview/download links. Signed URLs last no longer than 10 minutes and never past the row expiry.

## Cleanup

Later cleanup code can call `delete_expired_photo_download_rows()` from trusted server code, then delete the returned file paths from the `photobooth-downloads` bucket.

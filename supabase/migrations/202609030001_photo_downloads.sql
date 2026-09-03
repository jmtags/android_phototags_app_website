create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photobooth-downloads',
  'photobooth-downloads',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.photo_downloads (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  file_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  download_count integer not null default 0,
  constraint photo_downloads_code_format check (code ~ '^[A-Za-z0-9_-]{4,64}$'),
  constraint photo_downloads_file_path_format check (file_path ~ '^captures/[A-Za-z0-9/_ .-]+$'),
  constraint photo_downloads_download_count_nonnegative check (download_count >= 0),
  constraint photo_downloads_expiry_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '35 minutes'
  )
);

create index if not exists photo_downloads_code_idx on public.photo_downloads (code);
create index if not exists photo_downloads_expires_at_idx on public.photo_downloads (expires_at);

alter table public.photo_downloads enable row level security;

drop policy if exists "Android can create temporary download rows" on public.photo_downloads;
drop policy if exists "Android can upload temporary photobooth images" on storage.objects;

create or replace function public.increment_photo_download_metrics(download_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.photo_downloads
  set
    download_count = download_count + 1,
    downloaded_at = coalesce(downloaded_at, now())
  where code = download_code
    and expires_at > now();
$$;

revoke all on function public.increment_photo_download_metrics(text) from public;
grant execute on function public.increment_photo_download_metrics(text) to service_role;

create or replace function public.delete_expired_photo_download_rows()
returns table(file_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  delete from public.photo_downloads
  where expires_at <= now()
  returning photo_downloads.file_path;
end;
$$;

revoke all on function public.delete_expired_photo_download_rows() from public;
grant execute on function public.delete_expired_photo_download_rows() to service_role;

-- Cleanup note:
-- Run delete_expired_photo_download_rows() from trusted server code, then delete the
-- returned file paths from the private photobooth-downloads Storage bucket.

alter table public.photo_downloads
add column if not exists gif_file_path text;

alter table public.photo_downloads
drop constraint if exists photo_downloads_gif_file_path_format;

alter table public.photo_downloads
add constraint photo_downloads_gif_file_path_format check (
  gif_file_path is null
  or gif_file_path ~ '^captures/[A-Za-z0-9/_ .-]+[.]gif$'
);

update storage.buckets
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'photobooth-downloads';

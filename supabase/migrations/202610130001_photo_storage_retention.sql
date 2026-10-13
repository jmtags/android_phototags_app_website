alter table public.photo_downloads
add column if not exists cleanup_after timestamptz;

update public.photo_downloads
set cleanup_after = created_at + interval '24 hours'
where cleanup_after is null;

alter table public.photo_downloads
alter column cleanup_after set default (now() + interval '24 hours'),
alter column cleanup_after set not null;

create index if not exists photo_downloads_cleanup_after_idx
on public.photo_downloads (cleanup_after);

-- Metadata must only be removed after the Storage API confirms object deletion.
drop function if exists public.delete_expired_photo_download_rows();

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'cleanup-phototags-photos-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'cleanup-phototags-photos-hourly',
  '17 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'phototags_project_url'
      ) || '/functions/v1/cleanup-photo-downloads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'phototags_photo_cleanup_secret'
        )
      ),
      body := jsonb_build_object('scheduledAt', now()),
      timeout_milliseconds := 10000
    );
  $job$
);

create extension if not exists pgcrypto;

create table if not exists public.site_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  page_path text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint site_analytics_events_type check (event_type in ('site_visit', 'apk_download'))
);

create index if not exists site_analytics_events_type_idx
on public.site_analytics_events (event_type);

create index if not exists site_analytics_events_created_at_idx
on public.site_analytics_events (created_at);

alter table public.site_analytics_events enable row level security;

create or replace function public.get_site_analytics_summary()
returns table(
  visits bigint,
  downloads bigint,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  last_download_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where event_type = 'site_visit') as visits,
    count(*) filter (where event_type = 'apk_download') as downloads,
    min(created_at) filter (where event_type = 'site_visit') as first_visit_at,
    max(created_at) filter (where event_type = 'site_visit') as last_visit_at,
    max(created_at) filter (where event_type = 'apk_download') as last_download_at
  from public.site_analytics_events;
$$;

revoke all on function public.get_site_analytics_summary() from public;
grant execute on function public.get_site_analytics_summary() to service_role;

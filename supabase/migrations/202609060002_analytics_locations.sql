alter table public.site_analytics_events
add column if not exists country text,
add column if not exists region text,
add column if not exists city text,
add column if not exists latitude text,
add column if not exists longitude text,
add column if not exists timezone text,
add column if not exists postal_code text;

create index if not exists site_analytics_events_location_idx
on public.site_analytics_events (event_type, country, region, city);

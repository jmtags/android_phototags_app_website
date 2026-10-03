-- PhotoTags Supabase one-time catch-up setup
-- Run this in the Supabase SQL Editor when setting up or repairing a database.
-- Keep this file updated whenever a new file is added under supabase/migrations.
-- Source migrations included in chronological order below.


-- ============================================================
-- Source: supabase/migrations/202609030001_photo_downloads.sql
-- ============================================================

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


-- ============================================================
-- Source: supabase/migrations/202609040001_site_analytics.sql
-- ============================================================

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


-- ============================================================
-- Source: supabase/migrations/202609060001_site_comments.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.site_comments (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  rating integer not null,
  comment_text text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint site_comments_rating_range check (rating between 1 and 5),
  constraint site_comments_status check (status in ('pending', 'approved', 'rejected')),
  constraint site_comments_display_name_length check (char_length(display_name) between 1 and 80),
  constraint site_comments_comment_text_length check (char_length(comment_text) between 3 and 1000)
);

create index if not exists site_comments_status_created_at_idx
on public.site_comments (status, created_at desc);

alter table public.site_comments enable row level security;


-- ============================================================
-- Source: supabase/migrations/202609060002_analytics_locations.sql
-- ============================================================

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


-- ============================================================
-- Source: supabase/migrations/202609110001_apk_licensing.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  app_version text,
  platform text not null default 'android',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '1 day'),
  status text not null default 'trial',
  constraint devices_device_id_length check (char_length(device_id) between 3 and 200),
  constraint devices_status check (status in ('trial', 'trial_expired', 'licensed', 'blocked'))
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  plan text not null default 'pro_lifetime',
  status text not null default 'active',
  max_devices integer not null default 1,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  customer_email text,
  payment_reference text,
  constraint licenses_key_length check (char_length(license_key) between 6 and 120),
  constraint licenses_plan check (plan in ('pro_lifetime', 'pro_plus', 'business')),
  constraint licenses_status check (status in ('active', 'revoked', 'refunded', 'expired')),
  constraint licenses_max_devices_positive check (max_devices > 0)
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  activated_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  constraint license_activations_license_device_unique unique (license_id, device_id)
);

create unique index if not exists licenses_license_key_lower_idx
on public.licenses (lower(license_key));

create index if not exists devices_last_seen_at_idx
on public.devices (last_seen_at desc);

create index if not exists devices_status_idx
on public.devices (status);

create index if not exists licenses_status_idx
on public.licenses (status);

create index if not exists license_activations_device_id_idx
on public.license_activations (device_id);

create index if not exists license_activations_license_id_idx
on public.license_activations (license_id);

alter table public.devices enable row level security;
alter table public.licenses enable row level security;
alter table public.license_activations enable row level security;

create or replace function public.register_device(
  p_device_id text,
  p_app_version text default null,
  p_platform text default 'android',
  p_trial_days integer default 1
)
returns table(
  status text,
  licensed boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_licensed boolean;
begin
  insert into public.devices (
    device_id,
    app_version,
    platform,
    trial_started_at,
    trial_ends_at,
    status
  )
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android'),
    now(),
    now() + make_interval(days => greatest(coalesce(p_trial_days, 1), 0)),
    'trial'
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform)
  returning * into v_device;

  select exists (
    select 1
    from public.license_activations activation
    join public.licenses license on license.id = activation.license_id
    where activation.device_id = v_device.device_id
      and license.status = 'active'
      and (license.expires_at is null or license.expires_at > now())
  )
  into v_licensed;

  if v_licensed then
    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = v_device.device_id
    returning * into v_device;
  elsif v_device.status <> 'blocked' then
    update public.devices
    set status = case when v_device.trial_ends_at <= now() then 'trial_expired' else 'trial' end
    where device_id = v_device.device_id
    returning * into v_device;
  end if;

  return query
  select
    v_device.status,
    v_licensed,
    v_device.trial_started_at,
    v_device.trial_ends_at,
    now();
end;
$$;

create or replace function public.activate_license_for_device(
  p_license_key text,
  p_device_id text,
  p_app_version text default null,
  p_platform text default 'android'
)
returns table(
  ok boolean,
  status text,
  license_id uuid,
  plan text,
  expires_at timestamptz,
  max_devices integer,
  activated_at timestamptz,
  last_checked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_activation public.license_activations%rowtype;
  v_activation_count integer;
begin
  insert into public.devices (device_id, app_version, platform)
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android')
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform);

  select *
  into v_license
  from public.licenses
  where lower(license_key) = lower(trim(p_license_key))
  for update;

  if not found then
    return query select false, 'license_not_found'::text, null::uuid, null::text, null::timestamptz, null::integer, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_license.status <> 'active' then
    return query select false, ('license_' || v_license.status)::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  if v_license.expires_at is not null and v_license.expires_at <= now() then
    update public.licenses set status = 'expired' where id = v_license.id;
    return query select false, 'license_expired'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  select *
  into v_activation
  from public.license_activations
  where public.license_activations.license_id = v_license.id
    and public.license_activations.device_id = trim(p_device_id);

  if found then
    update public.license_activations
    set last_checked_at = now()
    where id = v_activation.id
    returning * into v_activation;

    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = trim(p_device_id);

    return query select true, 'licensed'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_activation.activated_at, v_activation.last_checked_at;
    return;
  end if;

  select count(*)
  into v_activation_count
  from public.license_activations
  where public.license_activations.license_id = v_license.id;

  if v_activation_count >= v_license.max_devices then
    return query select false, 'device_limit_reached'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_license.activated_at, null::timestamptz;
    return;
  end if;

  insert into public.license_activations (license_id, device_id)
  values (v_license.id, trim(p_device_id))
  returning * into v_activation;

  update public.licenses
  set activated_at = coalesce(activated_at, now())
  where id = v_license.id
  returning * into v_license;

  update public.devices
  set status = 'licensed', last_seen_at = now()
  where device_id = trim(p_device_id);

  return query select true, 'activated'::text, v_license.id, v_license.plan, v_license.expires_at, v_license.max_devices, v_activation.activated_at, v_activation.last_checked_at;
end;
$$;

create or replace function public.check_license_for_device(
  p_device_id text,
  p_license_key text default null,
  p_app_version text default null,
  p_platform text default 'android'
)
returns table(
  status text,
  licensed boolean,
  license_id uuid,
  plan text,
  expires_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_license public.licenses%rowtype;
begin
  insert into public.devices (device_id, app_version, platform)
  values (
    trim(p_device_id),
    nullif(trim(coalesce(p_app_version, '')), ''),
    coalesce(nullif(trim(coalesce(p_platform, '')), ''), 'android')
  )
  on conflict (device_id) do update
  set
    last_seen_at = now(),
    app_version = coalesce(nullif(trim(coalesce(p_app_version, '')), ''), public.devices.app_version),
    platform = coalesce(nullif(trim(coalesce(p_platform, '')), ''), public.devices.platform)
  returning * into v_device;

  select license.*
  into v_license
  from public.license_activations activation
  join public.licenses license on license.id = activation.license_id
  where activation.device_id = v_device.device_id
    and (p_license_key is null or lower(license.license_key) = lower(trim(p_license_key)))
    and license.status = 'active'
    and (license.expires_at is null or license.expires_at > now())
  order by activation.last_checked_at desc
  limit 1;

  if found then
    update public.license_activations
    set last_checked_at = now()
    where public.license_activations.license_id = v_license.id
      and public.license_activations.device_id = v_device.device_id;

    update public.devices
    set status = 'licensed', last_seen_at = now()
    where device_id = v_device.device_id
    returning * into v_device;

    return query select 'licensed'::text, true, v_license.id, v_license.plan, v_license.expires_at, v_device.trial_started_at, v_device.trial_ends_at, now();
    return;
  end if;

  if v_device.status <> 'blocked' then
    update public.devices
    set status = case when public.devices.trial_ends_at <= now() then 'trial_expired' else 'trial' end
    where device_id = v_device.device_id
    returning * into v_device;
  end if;

  return query select v_device.status, false, null::uuid, null::text, null::timestamptz, v_device.trial_started_at, v_device.trial_ends_at, now();
end;
$$;

revoke all on function public.register_device(text, text, text, integer) from public;
revoke all on function public.activate_license_for_device(text, text, text, text) from public;
revoke all on function public.check_license_for_device(text, text, text, text) from public;

grant execute on function public.register_device(text, text, text, integer) to service_role;
grant execute on function public.activate_license_for_device(text, text, text, text) to service_role;
grant execute on function public.check_license_for_device(text, text, text, text) to service_role;


-- ============================================================
-- Source: supabase/migrations/202609120001_business_paymongo_payments.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.business_owner_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_owner_accounts_email_length check (char_length(email) between 5 and 254)
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.business_owner_accounts(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_status check (status in ('active', 'suspended', 'closed')),
  constraint businesses_business_name_length check (char_length(business_name) between 2 and 160),
  constraint businesses_owner_name_length check (char_length(owner_name) between 2 and 160),
  constraint businesses_email_length check (char_length(email) between 5 and 254)
);

create table if not exists public.business_payment_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  paymongo_public_key text,
  paymongo_secret_key_encrypted text,
  qrph_enabled boolean not null default false,
  webhook_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devices
add column if not exists business_id uuid references public.businesses(id) on delete set null,
add column if not exists paired_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_code_length check (char_length(code) between 6 and 12)
);

create table if not exists public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  mode text not null,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null default 'pending',
  paymongo_payment_id text,
  paymongo_checkout_url text,
  payment_payload jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sessions_mode check (mode in ('photobooth', 'photo_id', 'reprint')),
  constraint payment_sessions_amount check (amount between 100 and 10000000),
  constraint payment_sessions_currency check (currency in ('PHP')),
  constraint payment_sessions_status check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled'))
);

create table if not exists public.business_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.business_owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists businesses_owner_user_id_idx on public.businesses (owner_user_id);
create index if not exists businesses_status_idx on public.businesses (status);
create index if not exists devices_business_id_idx on public.devices (business_id);
create index if not exists device_pairing_codes_business_id_idx on public.device_pairing_codes (business_id, expires_at desc);
create index if not exists payment_sessions_business_created_idx on public.payment_sessions (business_id, created_at desc);
create index if not exists payment_sessions_device_idx on public.payment_sessions (device_id, created_at desc);
create index if not exists payment_sessions_paymongo_payment_idx on public.payment_sessions (paymongo_payment_id);
create index if not exists business_sessions_owner_idx on public.business_sessions (owner_user_id, expires_at desc);

alter table public.business_owner_accounts enable row level security;
alter table public.businesses enable row level security;
alter table public.business_payment_settings enable row level security;
alter table public.device_pairing_codes enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.business_sessions enable row level security;

drop policy if exists businesses_owner_select on public.businesses;
create policy businesses_owner_select on public.businesses
for select to authenticated
using (owner_user_id = auth.uid());

drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists business_payment_settings_owner_select on public.business_payment_settings;
create policy business_payment_settings_owner_select on public.business_payment_settings
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = business_payment_settings.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists devices_business_owner_select on public.devices;
create policy devices_business_owner_select on public.devices
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = devices.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists device_pairing_codes_business_owner_select on public.device_pairing_codes;
create policy device_pairing_codes_business_owner_select on public.device_pairing_codes
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = device_pairing_codes.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

drop policy if exists payment_sessions_business_owner_select on public.payment_sessions;
create policy payment_sessions_business_owner_select on public.payment_sessions
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = payment_sessions.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_owner_accounts_touch_updated_at on public.business_owner_accounts;
create trigger business_owner_accounts_touch_updated_at
before update on public.business_owner_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists businesses_touch_updated_at on public.businesses;
create trigger businesses_touch_updated_at
before update on public.businesses
for each row execute function public.touch_updated_at();

drop trigger if exists business_payment_settings_touch_updated_at on public.business_payment_settings;
create trigger business_payment_settings_touch_updated_at
before update on public.business_payment_settings
for each row execute function public.touch_updated_at();

drop trigger if exists devices_touch_updated_at on public.devices;
create trigger devices_touch_updated_at
before update on public.devices
for each row execute function public.touch_updated_at();

drop trigger if exists payment_sessions_touch_updated_at on public.payment_sessions;
create trigger payment_sessions_touch_updated_at
before update on public.payment_sessions
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170001_license_paymongo_checkout.sql
-- ============================================================

create extension if not exists pgcrypto;

alter table public.licenses
drop constraint if exists licenses_plan;

alter table public.licenses
add constraint licenses_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'));

create table if not exists public.license_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(device_id) on delete cascade,
  plan text not null,
  amount integer not null,
  currency text not null default 'PHP',
  status text not null default 'pending',
  reference_number text not null unique,
  paymongo_checkout_session_id text unique,
  paymongo_checkout_url text,
  customer_email text,
  license_id uuid references public.licenses(id) on delete set null,
  payment_payload jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_payment_sessions_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business')),
  constraint license_payment_sessions_amount check (amount between 100 and 10000000),
  constraint license_payment_sessions_currency check (currency in ('PHP')),
  constraint license_payment_sessions_status check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled'))
);

create index if not exists license_payment_sessions_device_idx
on public.license_payment_sessions (device_id, created_at desc);

create index if not exists license_payment_sessions_status_idx
on public.license_payment_sessions (status, created_at desc);

create index if not exists license_payment_sessions_paymongo_idx
on public.license_payment_sessions (paymongo_checkout_session_id);

alter table public.license_payment_sessions enable row level security;

drop trigger if exists license_payment_sessions_touch_updated_at on public.license_payment_sessions;
create trigger license_payment_sessions_touch_updated_at
before update on public.license_payment_sessions
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170002_launch_license_pricing.sql
-- ============================================================

create table if not exists public.license_plan_settings (
  id text primary key,
  name text not null,
  description text,
  amount integer not null,
  currency text not null default 'PHP',
  duration_days integer,
  max_devices integer not null default 1,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_plan_settings_amount check (amount between 100 and 10000000),
  constraint license_plan_settings_currency check (currency in ('PHP')),
  constraint license_plan_settings_duration check (duration_days is null or duration_days > 0),
  constraint license_plan_settings_max_devices check (max_devices > 0)
);

insert into public.license_plan_settings (
  id,
  name,
  description,
  amount,
  currency,
  duration_days,
  max_devices,
  features,
  active,
  sort_order
)
values
  (
    'weekly',
    'Weekly',
    'Launch pricing for short event use.',
    15000,
    'PHP',
    7,
    1,
    '["1 Android device", "7 days access", "Photobooth and ID photo modes", "QR download support"]'::jsonb,
    true,
    10
  ),
  (
    'monthly',
    'Monthly',
    'Launch pricing for regular PhotoTags use.',
    30000,
    'PHP',
    30,
    1,
    '["1 Android device", "30 days access", "All current PhotoTags tools", "Templates and branding"]'::jsonb,
    true,
    20
  ),
  (
    'lifetime',
    'Lifetime',
    'Launch pricing for one device with no expiry.',
    100000,
    'PHP',
    null,
    1,
    '["1 Android device", "No expiry", "All current PhotoTags tools", "Future license checks supported"]'::jsonb,
    true,
    30
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  amount = excluded.amount,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  max_devices = excluded.max_devices,
  features = excluded.features,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.licenses
drop constraint if exists licenses_plan;

alter table public.licenses
add constraint licenses_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'));

alter table public.license_payment_sessions
drop constraint if exists license_payment_sessions_plan;

alter table public.license_payment_sessions
add constraint license_payment_sessions_plan check (plan in ('weekly', 'monthly', 'lifetime', 'starter', 'pro', 'business'));

alter table public.license_plan_settings enable row level security;

drop trigger if exists license_plan_settings_touch_updated_at on public.license_plan_settings;
create trigger license_plan_settings_touch_updated_at
before update on public.license_plan_settings
for each row execute function public.touch_updated_at();


-- ============================================================
-- Source: supabase/migrations/202609170003_license_payment_agreement.sql
-- ============================================================

alter table public.license_payment_sessions
add column if not exists agreement_accepted_at timestamptz,
add column if not exists agreement_terms_version text,
add column if not exists agreement_privacy_version text,
add column if not exists agreement_refund_version text,
add column if not exists agreement_ip text,
add column if not exists agreement_user_agent text;

create index if not exists license_payment_sessions_agreement_idx
on public.license_payment_sessions (agreement_accepted_at desc);


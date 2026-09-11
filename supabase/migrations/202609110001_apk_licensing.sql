create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  app_version text,
  platform text not null default 'android',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
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
  p_trial_days integer default 14
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
    now() + make_interval(days => greatest(coalesce(p_trial_days, 14), 0)),
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

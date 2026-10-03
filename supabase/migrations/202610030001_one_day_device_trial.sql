alter table public.devices
alter column trial_ends_at set default (now() + interval '1 day');

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

revoke all on function public.register_device(text, text, text, integer) from public;
grant execute on function public.register_device(text, text, text, integer) to service_role;

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

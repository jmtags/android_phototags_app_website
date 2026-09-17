create extension if not exists pgcrypto;

alter table public.licenses
drop constraint if exists licenses_plan;

alter table public.licenses
add constraint licenses_plan check (plan in ('starter', 'pro', 'business', 'pro_lifetime', 'pro_plus'));

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
  constraint license_payment_sessions_plan check (plan in ('starter', 'pro', 'business')),
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

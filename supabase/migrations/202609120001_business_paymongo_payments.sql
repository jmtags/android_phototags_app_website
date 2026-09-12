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

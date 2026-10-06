create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  transaction_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  mode text not null,
  payment_method text not null,
  status text not null,
  amount_centavos integer not null,
  voucher_code text,
  prints_used integer not null default 0,
  note text,
  raw_payload jsonb,
  constraint transactions_transaction_id_length check (char_length(transaction_id) between 1 and 200),
  constraint transactions_device_transaction_unique unique (device_id, transaction_id),
  constraint transactions_mode check (mode in ('Photobooth', 'ID Photo', 'Receiptbooth')),
  constraint transactions_payment_method check (payment_method in ('coin', 'voucher')),
  constraint transactions_status check (status in ('completed', 'failed')),
  constraint transactions_amount_centavos check (amount_centavos between 0 and 10000000),
  constraint transactions_prints_used check (prints_used between 0 and 10000),
  constraint transactions_voucher_code_length check (voucher_code is null or char_length(voucher_code) <= 120),
  constraint transactions_note_length check (note is null or char_length(note) <= 1000)
);

create index if not exists transactions_business_occurred_idx
on public.transactions (business_id, occurred_at desc);

create index if not exists transactions_device_occurred_idx
on public.transactions (device_id, occurred_at desc);

create index if not exists transactions_business_filters_idx
on public.transactions (business_id, mode, payment_method, status, occurred_at desc);

alter table public.transactions enable row level security;

drop policy if exists transactions_business_owner_select on public.transactions;
create policy transactions_business_owner_select on public.transactions
for select to authenticated
using (
  exists (
    select 1 from public.businesses
    where public.businesses.id = transactions.business_id
      and public.businesses.owner_user_id = auth.uid()
  )
);

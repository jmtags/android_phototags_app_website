alter table public.license_payment_sessions
add column if not exists agreement_accepted_at timestamptz,
add column if not exists agreement_terms_version text,
add column if not exists agreement_privacy_version text,
add column if not exists agreement_refund_version text,
add column if not exists agreement_ip text,
add column if not exists agreement_user_agent text;

create index if not exists license_payment_sessions_agreement_idx
on public.license_payment_sessions (agreement_accepted_at desc);

-- Native QR Ph payments; apply before deploying the API update.
alter table public.devices add column if not exists payment_token_hash text;
alter table public.business_payment_settings
  add column if not exists webhook_secret_encrypted text;
alter table public.payment_sessions
  add column if not exists request_id uuid,
  add column if not exists qr_image_url text,
  add column if not exists payment_flow text not null default 'checkout';
create unique index if not exists payment_sessions_request_idx
  on public.payment_sessions (business_id, device_id, request_id) where request_id is not null;
alter table public.payment_sessions drop constraint if exists payment_sessions_mode;
alter table public.payment_sessions add constraint payment_sessions_mode
  check (mode in ('photobooth', 'photo_id', 'receiptbooth', 'reprint'));

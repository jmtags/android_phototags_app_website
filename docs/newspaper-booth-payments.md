# Newspaper Booth payments (Android 0.2.108 / 119)

Newspaper Booth uses the existing business payment setup, coin credit, voucher
redemption, native QR Ph confirmation, and durable payment journal. Customers
choose their template and 1–4 shots before paying; successful payment starts the
existing capture sequence, followed by decoration, A4 printing, and QR download.

In Android **Admin > Payments**, `Newspaper Booth A4 print` is independent of the
other prices and defaults to **PHP 150.00**. It is saved locally under
`newspaper_print_price_centavos`. One session produces one A4 print regardless of
shot count and consumes one voucher print credit. A zero price or disabled
payment methods follows the existing free-session behavior. Existing licensing
requirements and trial behavior are preserved.

The API/journal mode is `newspaper`; transaction reporting uses `Newspaper Booth`.
QR payment snapshots include the selected template, frame count and price, along
with existing print settings. A changed snapshot, abandoned payment or late
confirmation requires review rather than automatically starting another session.
Cancelling payment returns to the newspaper selector. Coin and voucher sessions
use the existing warning before leaving paid capture or decoration.

## Rollout

1. Apply `supabase/migrations/202611250001_newspaper_booth_payments.sql` to the
   production database before enabling the new API/app. The migration extends
   allowed payment and transaction modes and the business report filter. It also
   accepts newspaper as a reprint source. Existing modes, reporting permissions
   and metadata validation remain available. The migration is repeatable and is
   included verbatim at the end of `supabase/one_time_supabase_setup.sql`.
2. Deploy the website/server changes to enable newspaper QR creation,
   transaction synchronization and the business portal's Newspaper Booth filter.
3. Distribute Android 0.2.108 / 119 and set the desired price/payment methods in
   Admin > Payments. This change does not publish a new website APK automatically.

The migration has been tested locally; it is not automatically applied to a live
database by a source commit or website build.

## Validation

`npm test` covers all 85 website tests, including newspaper QR creation, same-intent
retry, mode conflicts, payment confirmation, transaction normalization for all
three methods, real SQL constraints, repeated migration, business reporting and
duplicate synchronization without duplicate revenue. Provider requests use test
doubles; these tests do not charge a live customer.

Android's `:app:testDebugUnitTest :app:assembleDebug` includes newspaper payment
confirmation for all 1–4 shot counts, single fulfillment, template/frame mismatch
and cancelled-session late payment. Device testing should check a real coin
reader, voucher scanning, QR Ph merchant confirmation and the full capture/print
flow on an installed APK.

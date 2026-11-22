# PhotoTags APK Licensing

The Android app should call the website API. Each endpoint expects JSON and returns JSON.

## Register Device

`POST /api/device/register`

```json
{
  "deviceId": "android-device-id-or-install-id",
  "appVersion": "1.0.0",
  "platform": "android"
}
```

Returns the current trial/license state and starts a trial for new devices.

## Activate License

`POST /api/license/activate`

```json
{
  "deviceId": "android-device-id-or-install-id",
  "licenseKey": "PT-PRO-EXAMPLE",
  "appVersion": "1.0.0",
  "platform": "android"
}
```

Successful activation binds the license to the device. The default rule is one device per license.

## Check License

`POST /api/license/check`

```json
{
  "deviceId": "android-device-id-or-install-id",
  "licenseKey": "PT-PRO-EXAMPLE",
  "appVersion": "1.0.0",
  "platform": "android"
}
```

`licenseKey` is optional. When omitted, the server checks any active license already bound to the device.

## PayMongo QR Ph Activation

The automatic paid flow is:

```text
PhotoTags APK -> /activate page -> PayMongo Checkout -> /api/paymongo/webhook -> license bound to device
```

From Android, open the website activation page in a browser or Custom Tab:

```text
https://your-domain.com/activate?device_id=android-device-id-or-install-id
```

The website handles plan selection and PayMongo Checkout. The Android app does not need the PayMongo secret key and should not call PayMongo directly.

Production requires these Vercel environment variables:

- `PAYMONGO_SECRET_KEY`: the live PayMongo API secret key used only by server functions
- `PAYMONGO_WEBHOOK_SECRET`: the `whsk_...` signing secret for the configured webhook endpoint
- `SITE_URL`: the public site origin, for example `https://phototags.vercel.app`

Configure the PayMongo webhook endpoint as `https://phototags.vercel.app/api/paymongo/webhook` and subscribe it to `checkout_session.payment.paid`. Both the payment-status endpoint and an unlicensed Android device's `/api/license/check` reconcile saved Checkout Sessions directly with PayMongo. A customer who leaves the checkout browser can therefore recover activation through the installed APK's **Check License** button without paying again.

Recovery verifies the saved checkout ID, paid amount and currency, plus reference/product/device/plan metadata when supplied. It can recover a confirmed payment even if an earlier callback marked the local session failed, cancelled or expired. Duplicate fulfillment converges on the same license and device activation; late negative callbacks cannot downgrade a fulfilled payment. Device checks examine at most three unresolved checkouts at a time and rotate by their last check timestamp, so abandoned checkouts cannot permanently hide another paid purchase. Provider requests time out after eight seconds; temporary outages do not grant access or discard trial state. Blocked devices and separate Light/business payment records are excluded from this recovery path.

The activation page retries temporary confirmation errors with bounded backoff and offers **Check payment again** after automatic attempts stop or an earlier failure/expiry is reported. A browser redirect or locally cached success flag is not payment proof.

After the user pays, the app should poll `POST /api/license/check` with the same `deviceId`. When `licensed` is `true`, unlock the app.

Suggested polling after returning from browser:

- poll every 3-5 seconds
- stop after 60-90 seconds
- show a manual "Check License" button if still pending

Available website checkout endpoints:

- `GET /api/license/plans`
- `POST /api/license/create-checkout`
- `POST /api/license/payment-status`

The APK usually only needs `/activate` and `/api/license/check`.

### Activation recovery release checks

This recovery change needs the updated website frontend and server handlers deployed together. It does not require a database migration or an APK update. Keep the existing live `PAYMONGO_SECRET_KEY`, matching webhook signing secret and Supabase service-role configuration in the deployment; local placeholder credentials cannot verify production transactions.

Run `npm test`, `npm run build`, and `node scripts/check-apk-activation.cjs` from the website root. The browser check uses the installed Playwright dependencies from the sibling `PhotoTagsReceipt_Booth_ALL` project (or the path passed as its first argument). These checks use isolated fixtures and mock provider transport, never live payments. After deployment, confirm a PayMongo test-mode purchase activates the same device when the checkout page is closed, and verify the live webhook is enabled for the production endpoint. For an existing affected purchase, use the original device's **Check License**; retain its checkout reference for support if provider confirmation remains unavailable.

Current launch pricing is served by `GET /api/license/plans`:

- Weekly: PHP 150
- Monthly: PHP 300
- Lifetime: PHP 1,000

Backend pricing changes are stored in Supabase table `public.license_plan_settings`. You can edit price, duration, device count, and active status from the admin Licenses page. You can also update `amount` in centavos, `duration_days`, `max_devices`, `features`, or `active` directly in Supabase; the checkout page and admin package cards will read the updated values.

For one-time setup or production catch-up, run `supabase/one_time_supabase_setup.sql` in the Supabase SQL Editor. Whenever a new SQL file is added under `supabase/migrations`, append it to that one-time setup script in chronological order.

Example price update:

```sql
update public.license_plan_settings
set amount = 35000
where id = 'monthly';
```

## Create A License

Run this in Supabase SQL after applying the migration:

```sql
insert into public.licenses (license_key, customer_email, payment_reference)
values ('PT-PRO-CHANGE-ME', 'customer@example.com', 'manual');
```

Defaults:

- `plan`: `monthly`
- `status`: `active`
- `max_devices`: `1`
- `expires_at`: `null`

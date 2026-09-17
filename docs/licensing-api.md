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

## Create A License

Run this in Supabase SQL after applying the migration:

```sql
insert into public.licenses (license_key, customer_email, payment_reference)
values ('PT-PRO-CHANGE-ME', 'customer@example.com', 'manual');
```

Defaults:

- `plan`: `pro_lifetime`
- `status`: `active`
- `max_devices`: `1`
- `expires_at`: `null`

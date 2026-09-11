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

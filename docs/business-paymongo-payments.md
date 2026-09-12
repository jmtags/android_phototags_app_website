# PhotoTags Business PayMongo Payments

Business owners use `/business` to register, log in, save their PayMongo keys, generate device pairing codes, see linked devices, and review payment sessions.

Server-only requirements:

```text
PAYMONGO_KEYS_ENCRYPTION_SECRET=long-random-secret
PAYMONGO_WEBHOOK_SECRET=optional-paymongo-webhook-secret
```

The PayMongo secret key is encrypted before storage and is never returned to the browser or Android app.

## Android Device Pairing

`POST /api/device/pair`

```json
{
  "deviceId": "unique-device-or-install-id",
  "pairingCode": "123456",
  "appVersion": "1.0.0",
  "platform": "android"
}
```

Returns the business and payment setup status.

## Create Payment Before Printing

`POST /api/payments/create`

```json
{
  "deviceId": "unique-device-or-install-id",
  "mode": "photobooth",
  "amount": 15000,
  "currency": "PHP",
  "metadata": {
    "jobId": "local-print-job-id"
  }
}
```

The website backend finds the paired business by `deviceId`, decrypts that business owner's PayMongo secret key server-side, creates a QRPH checkout session, stores a local `payment_sessions` row, and returns safe payment data.

## Check Payment Status

`POST /api/payments/status`

```json
{
  "deviceId": "unique-device-or-install-id",
  "paymentSessionId": "uuid"
}
```

Possible statuses:

- `pending`
- `paid`
- `failed`
- `expired`
- `cancelled`

The Android app should only print after this endpoint returns `paid`.

## PayMongo Webhook

`POST /api/paymongo/webhook`

Configure this webhook URL in PayMongo. Webhook events update local `payment_sessions`; frontend or APK confirmation must not be treated as proof of payment.

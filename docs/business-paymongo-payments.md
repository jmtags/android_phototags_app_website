# Business QR Ph payments

## Deployment and business setup

1. Apply `supabase/migrations/202610180001_native_business_qrph.sql` to the existing database **before** deploying the website/API. Fresh installations also include this migration in `supabase/one_time_supabase_setup.sql`.
2. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PAYMONGO_KEYS_ENCRYPTION_SECRET` (at least 24 characters) on the server. Keep the encryption secret stable. `PAYMONGO_WEBHOOK_SECRET` remains for the platform's existing license checkout; business webhooks use their own encrypted signing secrets.
3. In `/business`, save public and secret keys from the same PayMongo merchant and mode. Enable QRPH. Saved/configured means credentials exist; it does not claim that keys or QR Ph activation have been verified with PayMongo. The first QR request exercises both keys.
4. Optional but recommended: register the exact business webhook URL shown on that page in that merchant's PayMongo dashboard. It is `/api/paymongo/webhook?businessId=<business UUID>` on the deployed website origin. Subscribe to `payment.paid`, `payment.failed`, and `qrph.expired`; paste that webhook's signing secret into the business form and enable Webhook. This is manual merchant setup; checking the checkbox does not register a webhook at PayMongo.
5. Install the Android implementation described in `docs/android-native-qrph-prompt.md`. Pair each device again to obtain its payment token. Older APKs do not store this new token and do not implement native payments.
6. Test with PayMongo test keys, then perform a controlled live payment with the merchant before enabling customer use. Automated tests mock PayMongo and do not move money.

Keys, webhook secrets, and Payment Intent client keys are never returned to the APK. The website displays the saved public key to its authenticated business owner. Neither saved secret is returned to the browser. Changing API credentials clears the prior webhook signing secret unless a replacement is supplied. Removing/replacing API credentials is blocked while payments remain pending; finish/reconcile these with the app first.

Native business payments use Payment Intents; platform license purchases retain hosted Checkout. PayMongo reference: https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api

## Pairing and authentication

`POST /api/device/pair` (existing endpoint):

```json
{"deviceId":"unique-install-id","pairingCode":"123456","appVersion":"0.2.76","platform":"android"}
```

Success includes `ok`, `status: "paired"`, `businessId`, `businessName`, **`paymentToken`**, and the safe settings below. Pairing rotates the token; save the returned token securely before enabling payments. Pairing codes are consumed atomically. If the pair response is lost or an old APK discarded the token, generate a fresh pairing code and pair again.

For all three endpoints below, send:

```text
Content-Type: application/json
Authorization: Bearer <paymentToken>
```

The token is specific to a device; the server stores its SHA-256 hash. Requests bind both the token and `deviceId` to the paired active business. An identifier alone cannot authorize a payment request.

## Refresh admin setup

`POST /api/device/payment-settings`

```json
{"deviceId":"unique-install-id"}
```

Example response:

```json
{
  "ok":true,
  "status":"paired",
  "businessId":"business-uuid",
  "businessName":"Example Booth",
  "paymentEnabled":true,
  "paymongoConfigured":true,
  "qrphEnabled":true,
  "webhookConfigured":true,
  "keyMode":"live",
  "settingsUpdatedAt":"2026-10-18T00:00:00Z"
}
```

`paymentEnabled` means both keys are saved and QRPH is enabled. `keyMode` is `test`, `live`, or `null`. `webhookConfigured` means a signing secret is saved and webhook enabled; it does not prove the merchant registered the webhook. Direct provider reconciliation works without a webhook. Refresh on admin entry, app resume (throttled), and before new payments. A network failure must show an unavailable state rather than stale readiness.

## Create a QR

`POST /api/payments/create`

```json
{
  "deviceId":"unique-install-id",
  "requestId":"33333333-3333-4333-8333-333333333333",
  "mode":"receiptbooth",
  "amount":15000,
  "currency":"PHP"
}
```

`requestId` must be a UUID generated and persisted **before** sending. Reuse the same ID and exact body after timeouts or retries. Amount is an integer in centavos (15000 = PHP 150). Allowed modes: `photobooth`, `photo_id`, `receiptbooth`, `reprint`. Supported range: 100 to 10000000 centavos. Prices currently come from the device's admin settings; there is no server-managed price catalog.

Example success (201 new, 200 existing):

```json
{
  "ok":true,
  "paymentSessionId":"session-uuid",
  "requestId":"33333333-3333-4333-8333-333333333333",
  "status":"pending",
  "amount":15000,
  "currency":"PHP",
  "mode":"receiptbooth",
  "paymentFlow":"qrph",
  "keyMode":"live",
  "qrImageUrl":"data:image/png;base64,...",
  "expiresAt":"2026-10-18T00:30:00Z",
  "paidAt":null
}
```

Render the returned QR image as-is inside the app. It is generally a Base64 data URI; this is the actual payment QR, not a checkout-link QR. No WebView or browser redirect is required. The customer approves payment in a bank/e-wallet app on their own phone. There is no PayMongo API key entry screen in Android.

The unique `(business_id, device_id, request_id)` reservation prevents retries from creating multiple intents. Changing amount/mode/currency for an existing request returns `409 request_id_conflict`. A response lost after attachment can recover its QR from the same provider intent. A crash before attachment cannot safely be retried with another intent automatically: keep the job unresolved and use status/retry until expiry or operator review.

## Confirm payment

`POST /api/payments/status`

```json
{"deviceId":"unique-install-id","paymentSessionId":"session-uuid"}
```

Returns the same safe payment shape. Poll about every 5 seconds while visible, one request at a time. Only server `status: "paid"`, matching job details, and `keyMode: "live"` can start a real paid session. Test payments must never dispense a customer session/print.

The server retrieves the Payment Intent from the merchant account and checks intent ID, amount, currency and paid payment details. Signed business webhooks trigger the same reconciliation. Paid rows cannot be downgraded by delayed callbacks. A confirmed payment can arrive after local expiry; the app must keep it associated with its original job and never apply it to the next customer.

Statuses: `pending`, `paid`, `failed`, `expired`, `cancelled` (last is retained for legacy rows; this implementation has no remote cancellation endpoint). QR image is omitted/null outside `pending`. The server retains pending while the provider reports processing, even past the display countdown. The local 30-minute expiry is conservative and is not proof that funds were never sent.

Errors have `{ "ok": false, "status": "..." }` and may include `paymentSessionId`:

| HTTP / status | App behavior |
| --- | --- |
| 401 `device_auth_required` | Disable QR payments and ask admin to pair again. |
| 403 `business_inactive` | Disable new payments and show business unavailable. |
| 409 `payments_not_configured` | Refresh setup; show website setup instructions. |
| 409 `request_id_conflict` | Stop; reconcile the persisted original job. |
| 409 `payment_initializing` | Keep the same request ID and retry with backoff. |
| 503 `payment_creation_uncertain` | Persist returned session ID, reconcile; never generate another request ID automatically. |
| 502 `paymongo_rejected` | Provider rejected the request; local session is failed. Show admin setup error. |
| 503 `payment_status_unavailable` / lookup/settings errors | Preserve pending job; retry with backoff. No fulfillment. |
| 429 `rate_limited` | Back off (15-30 seconds); do not treat as paid/failed. |
| 404 `payment_session_not_found` | Stop fulfillment; operator review of original job. |

There is no server cancellation/refund or atomic fulfillment-claim endpoint yet. Leaving the QR screen does not cancel the provider payment. Persist active/abandoned jobs and completed payment IDs locally; route late confirmations to admin review. Local exactly-once fulfillment requires a durable journal and careful handling of a crash during camera/print startup. Physical printing and a local database update cannot form a single atomic transaction; ambiguous interrupted fulfillment needs operator review rather than automatic reprinting.

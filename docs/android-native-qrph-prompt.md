# Android implementation prompt: native business QR Ph

Paste the following into the Android PhotoTags coding session.

---

Implement native PayMongo QR Ph business payments in `C:\codes\Android_PHOTOTAGS`. Read the repository's AGENTS.md and applicable skills first. The website/backend contract is implemented in `C:\codes\Android_PHOTOTAGS_WEBSITE\docs\business-paymongo-payments.md`; read that file and follow its exact endpoints and fields. Confirm the migration and API have been deployed before an end-to-end test. Do not change platform license purchase checkout.

Inspect existing `MainActivity.kt` business pairing (`BusinessPairingState`, `pairBusinessDevice`, `requestBusinessPairing`, `businessPairingSummaryText`), Admin payment setup, `CoinPaymentTarget`, coin/voucher selectors, `recordCompletedTransaction`, `completeCoinPayment`, and transaction sync. Extend the existing app architecture and visual style. Keep existing coin and voucher behavior working.

## Admin > Business / Payment Setup

Create a clear `Online payments (QR Ph)` section beside existing payment methods:

- Show business name and pairing state, PayMongo keys Saved/Not configured, QR Ph Enabled/Disabled, Test/Live mode, webhook Configured/Not configured, last successful refresh time, and connection errors.
- Provide `Refresh payment setup`, `Enable QR Ph payments on this device` (persisted local opt-in), and `Test QR display` actions. The local opt-in cannot override server disabling QR Ph or an inactive business. Keep license checks intact.
- Do not collect public/secret API keys or webhook secrets in Android. Explain: "In your PhotoTags business dashboard, save your PayMongo keys and enable QR Ph. Pair this device, then tap Refresh payment setup." Provide an admin-only button to open the existing business dashboard URL. Customer payments remain inside PhotoTags.
- For webhook setup, instruct the owner to use the business-specific URL displayed on the website, select payment.paid/payment.failed/qrph.expired, and save its signing secret on the website. A missing webhook can show "Using payment status checks"; direct provider reconciliation supports payments without it.
- Distinguish saved/configured from verified connectivity. Do not show "PayMongo verified" based only on saved keys or cached flags.
- Require pairing with a fresh code if no payment token is stored. `POST /api/device/pair` now returns `paymentToken`; store it using Android Keystore-backed secure storage, rotate on successful pairing, remove on unpair, never log it or include it in backups. Existing APK pairing flags alone are insufficient.
- The token authorizes the device's payment requests. Use `Authorization: Bearer <paymentToken>` over HTTPS with `deviceId` in JSON. Use the same configured API origin as existing pairing endpoints. Do not create a new hardcoded hostname inconsistent with the app.
- Refresh via `POST /api/device/payment-settings` on entering this admin section, after pairing, app resume (throttled), and before a new QR payment. Use bounded network timeouts on background executors/coroutines. Show offline/unavailable when refresh fails; do not enable new QR payments based on stale status.
- `Test QR display` must require test-mode merchant settings, be clearly marked TEST, and never start a real booth session or print after a simulated payment. Real customer QR payments require `keyMode: "live"`. Hide/disable customer QR payment in test mode while allowing admin testing.

## Customer payment flow

Offer `Pay with QR Ph` next to enabled Coin Slot/Voucher methods only if the device is licensed, paired with a token, locally opted in, and the refreshed server flags allow live QR payments. Include Photobooth, ID Photo, Receiptbooth, and reprints only where those targets already have a payment gate. Preserve the correct target, pricing, quantities and print settings as an immutable job snapshot; map to backend modes `photobooth`, `photo_id`, `receiptbooth`, `reprint`.

1. Create and durably save a local job with UUID `requestId`, device/business IDs, mode, amount in integer centavos, currency PHP, target/print snapshot, and status before making any network request. Lock target and amount while QR payment is active. Do not mix partial coin credit/vouchers and QR for the same job unless explicitly supported; refund/retain coin credit through existing behavior before selecting QR.
2. Call `POST /api/payments/create` with `{deviceId, requestId, mode, amount, currency}` and the bearer token. Retry the identical request after uncertain responses; never auto-generate another requestId to work around a timeout. Persist `paymentSessionId` whenever returned, even on an error response.
3. Validate the returned request ID, amount, currency, mode, flow and key mode against the job. Render `qrImageUrl` directly as an image in a native app screen. Support Base64 data URIs (strip the prefix and decode bytes) and HTTPS image URLs if returned; do not open them in a browser or regenerate a QR from the image URL. Never crop, stretch, or cover the QR quiet zone.
4. Show a large QR, business name, amount, remaining time from server `expiresAt`, "Scan with GCash, Maya, or your bank app", and "Waiting for payment". Keep screen on while paying. Handle loading/retry/expired/error states. No checkout WebView, external browser, or customer-facing payment URL.
5. Poll `POST /api/payments/status` roughly every 5 seconds with one request in flight, pause UI polling when backgrounded, and resume/reconcile saved jobs on return. Use backoff for 429/503/offline. A local countdown reaching zero must trigger reconciliation; it cannot prove failure. The backend may still return pending while processing.
6. Continue only after server `status == paid`, matching the persisted job's amount/mode/currency/ID, and live key mode. Never accept a screenshot, QR generation, user confirmation, browser redirect, or client-supplied paid flag as payment proof.
7. Persist payment success and a durable fulfillment journal keyed by paymentSessionId before triggering the existing session continuation. Consume a successful payment once, record method `qrph` with the session/request IDs, and retain the existing transaction sync path. Repeated status responses, duplicate callbacks, activity recreation, and restarts must not dispense another session. A crash during fulfillment needs an admin "Paid - review interrupted session" state; avoid silently losing money or auto-reprinting uncertain jobs.
8. `Cancel`/Back stops the local flow and hides the QR; it does not cancel or refund the provider payment. Persist the abandoned job. Do not transfer a late paid result to another customer or automatically start cameras after the original customer leaves. Reconcile and flag late payments for admin review. The backend currently has no cancellation/refund endpoint, so do not invent one or label cancellation as a completed refund.
9. Do not silently switch to coin/voucher after an uncertain QR payment. Allow another method only after clearly dealing with the original payment's state and preserving it for late-payment review. Reject QR attempts offline. Keep incomplete jobs when unpairing/re-pairing; warn the admin that changing business can make their old payments require review in the original merchant's dashboard.

## Implementation and validation

Keep API/data handling in focused classes where practical rather than adding all network/state logic to the large activity. Persist jobs in existing durable app storage or a suitable local database; store the device payment token separately and securely. Use lifecycle-aware UI updates and never block the main thread.

Add meaningful tests for settings refresh, missing/invalid token, QR Base64 rendering, network loss during create and poll, identical-request retry, amount mismatch rejection, expired/processing state, test-mode no-fulfillment, late paid after leaving the screen, restart recovery, and duplicate paid responses. Confirm existing coin/voucher gates and transaction sync still work. Do not claim exact-once physical printing across a crash; make ambiguous fulfillment reviewable.

Build the Android app, describe tested behavior and outstanding live merchant checks. If asked to publish an APK, use the PhotoTags APK website release skill and bump the version for a new release. Do not publish without the relevant release instruction.

---

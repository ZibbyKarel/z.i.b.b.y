# Web push

Browser push notifications for Tier-3 operator events (what waits on the operator).

- `WebPushNotifier` subscribes to the activity stream, maps each entry through
  `toOperatorEvent` and pushes **Tier-3 events only** (`approval-waiting`,
  `review-finished`, `run-parked`, `budget-cap`) to every stored subscription. Deduped per
  `kind|target|state` for 24 h. Independent of Slack's `enabled` / autopilot gating.
- Payload: `{ title: "ZIBBY", body, url, tag }`; the body is the operator-channel headline in the
  configured locale. It is sent only to the stored subscription endpoints (Web Push, VAPID,
  aes128gcm via the `web-push` package).
- A subscription the push service reports gone (404 / 410) is dropped.
- Files in `<data>/web-push/` (`WEB_PUSH_DIR` overrides): `vapid.json` (0600, generated on first
  use), `subscriptions.json`, `deliveries.jsonl` (one line per push: `ts, kind, target, sent, failed`).

## Endpoints (`webPushContract`)

| Method | Path                          | Purpose                                      |
| ------ | ----------------------------- | -------------------------------------------- |
| GET    | `/api/web-push/public-key`    | VAPID public key for `pushManager.subscribe` |
| POST   | `/api/web-push/subscriptions` | Store a subscription (operator token)        |
| POST   | `/api/web-push/unsubscribe`   | Drop a subscription (operator token)         |

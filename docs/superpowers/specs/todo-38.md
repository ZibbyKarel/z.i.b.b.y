# TODO 38 — Web push notifications

## Raw item (operator's words)

> Web musí podporovat push notifikace

## Meaning

The ZIBBY web app must support push notifications: the operator's browser (desktop or the
phone over the tailnet) gets a system notification when something genuinely needs them,
even when no ZIBBY tab is open.

## Grounding

- `apps/api/src/operator-channel/operator-events.ts` — `toOperatorEvent` already decides what
  is worth telling the operator and tiers it (Tier-3 = surface and wait: `approval-waiting`,
  `review-finished`, `run-parked`, `budget-cap`). The Slack notifier rides the activity stream
  through it.
- `apps/web/features/notifications` — the in-app bell (unread failed runs, polled).
- `apps/desktop` — Electron; uses native `Notification` only for the updater. Electron has no
  push service, so Web Push does not work inside the desktop shell.

## Design

- Standards path: service worker (`apps/web/public/sw.js`) + Web Push (VAPID), `web-push` npm
  package on the api (VAPID JWT + aes128gcm payload encryption — not hand-rolled crypto).
- VAPID keys generated on first use, stored in `<data>/web-push/vapid.json` (0600); browser
  subscriptions persisted in `<data>/web-push/subscriptions.json`; each send appended to
  `<data>/web-push/deliveries.jsonl` (Law 5).
- `WebPushNotifier` subscribes to the activity stream, maps through `toOperatorEvent`, sends
  **Tier-3 events only**, deduped per `kind|target|state` for 24 h. Expired subscriptions
  (404/410) are dropped.
- Contract `webPush`: `GET /api/web-push/public-key`, `POST /api/web-push/subscriptions`,
  `POST /api/web-push/unsubscribe` (mutations behind the operator token).
- Settings → general: a "Push notifications" toggle (opt-in) that registers the service worker,
  asks permission, subscribes and posts the subscription; off unsubscribes.
- Minimal `app/manifest.ts` so iOS Safari can install the app to the Home Screen (iOS only
  delivers Web Push to installed web apps).

## Rulings

- Push only Tier-3 events (what waits on the operator); Tier-2 news stays in the briefing,
  Slack and the feed. Failed runs stay on the bell; a run that exhausted its retries surfaces
  as `run-parked`, which is pushed.
- Push is independent of Slack's `enabled` / autopilot gating — it is its own opt-in.
- No quiet hours / per-hour cap: Tier-3 breaks through quiet hours in the Slack policy too,
  and dedupe bounds repeats.
- The Notification-API-over-SSE alternative was rejected: it only works with a tab open, which
  is exactly the case push exists for (the phone).
- Payload goes only to the subscribed browser's own push endpoint, encrypted end-to-end by
  the Web Push protocol.
- Electron desktop shell: the toggle reports "unsupported here"; native desktop notifications
  are a follow-up.

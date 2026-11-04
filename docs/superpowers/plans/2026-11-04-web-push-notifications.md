# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operator's browser gets a system push notification for every Tier-3 operator event, opt-in from Settings.

**Architecture:** A `webPush` ts-rest contract; an api `web-push` module (file store for VAPID keys + subscriptions, a notifier riding the activity stream through the existing `toOperatorEvent`, a controller); a web service worker + a settings toggle.

**Tech Stack:** NestJS + ts-rest, `web-push` npm package (api only), Next.js 15 / React 19, next-intl, vitest.

**Spec:** `docs/superpowers/specs/todo-38.md`

## Global Constraints

- Worktree: `/Users/zibar/Workspace/z.i.b.b.y/worktrees/todo-38-web-push-notifications`. `export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PWD/node_modules/.bin:$PATH"` before any pnpm/node command. Never `git stash`. Commit with `PATH="$PWD/node_modules/.bin:$PATH" git commit`; on a self-knowledge drift block run `pnpm self-knowledge:generate && git add .zibby/data/vault/knowledge/self-knowledge.md` and retry. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_011c44zpdMBx5eLVd8V255Sh`.
- Only Tier-3 events are pushed (`event.tier === 3` from `toOperatorEvent`).
- Payload only ever goes to stored subscription endpoints. Tests stub the sender — no network.
- Data dir: `process.env.WEB_PUSH_DIR ?? dataDir("web-push")`; files `vapid.json` (mode 0o600), `subscriptions.json`, `deliveries.jsonl`.
- Mutating routes behind `OperatorTokenGuard`. UI strings in both `cs.json` and `en.json`. No `any`, no inline `style`.

## Review Focus

- The same subscription posted twice (re-enable) → stored once (dedupe by `endpoint`). Test in Task 2.
- A dead subscription (sender rejects with `statusCode` 404 or 410) → removed from the file; other errors keep it. Test in Task 2.
- Same event re-emitted within 24 h → pushed once. Test in Task 2.
- No subscriptions → notifier does nothing, never throws into the stream. Test in Task 2.
- Browser without `serviceWorker`/`PushManager` (Electron, old Safari) → toggle disabled with an "unsupported" hint, no crash. Test in Task 3.

---

### Task 1: Contract

**Files:**

- Create: `libs/contracts/src/web-push/web-push.schema.ts`, `libs/contracts/src/web-push/web-push.contract.ts`
- Modify: `libs/contracts/src/app.contract.ts` (register `webPush: webPushContract`), `libs/contracts/src/index.ts` (export both files)

**Interfaces — Produces:**

- `WebPushSubscriptionSchema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) })`, type `WebPushSubscription`
- `WebPushPublicKeySchema = z.object({ publicKey: z.string() })`
- `WebPushUnsubscribeSchema = z.object({ endpoint: z.string().url() })`
- `webPushContract` (pathPrefix `/api`, strictStatusCodes): `getWebPushPublicKey` GET `/web-push/public-key` → 200 `WebPushPublicKeySchema`; `subscribeWebPush` POST `/web-push/subscriptions` body `WebPushSubscriptionSchema` → 200 `z.object({ ok: z.literal(true) })`; `unsubscribeWebPush` POST `/web-push/unsubscribe` body `WebPushUnsubscribeSchema` → 200 same.

- [ ] Write files, register, run `PATH=... npx tsc -p libs/contracts/tsconfig.json --noEmit` (or the lib's tsconfig) → no errors. Commit `Add webPush contract`.

### Task 2: API module

**Files:**

- `pnpm --filter api add web-push` and `pnpm --filter api add -D @types/web-push`
- Create: `apps/api/src/web-push/web-push.store.ts`, `web-push.notifier.ts`, `web-push.controller.ts`, `web-push.module.ts`, `web-push.notifier.test.ts`
- Modify: `apps/api/src/operator-channel/operator-channel.module.ts` (add `OPERATOR_EVENT_LOOKUPS` to `exports`), `apps/api/src/app.module.ts` (import `WebPushModule`)

**Interfaces:**

- Consumes: `toOperatorEvent`, `OperatorEventLookups`, `OPERATOR_EVENT_LOOKUPS`, `OPERATOR_MESSAGES`, `fill`, `OperatorChannelStore.readSettings().locale`, `ActivityEventsService.stream()`.
- Produces:
  - `WebPushStore(dir)`: `vapid(): Promise<{ publicKey: string; privateKey: string }>` (generate via `webpush.generateVAPIDKeys()` on first call, persist, cache), `list(): Promise<WebPushSubscription[]>`, `add(s)`, `remove(endpoint)`, `appendDelivery(line: object)`.
  - `WEB_PUSH_SENDER` DI token; `type WebPushSender = (sub: WebPushSubscription, payload: string, vapid: { publicKey; privateKey }) => Promise<void>`; default wraps `webpush.sendNotification(sub, payload, { vapidDetails: { subject: "mailto:zibby@localhost", ...vapid }, TTL: 3600 })`.
  - `WebPushNotifier.onActivity(entry): Promise<void>` (subscribe in `onModuleInit`, like `OperatorNotifier`), `now` clock seam. Payload `JSON.stringify({ title: "ZIBBY", body: fill(m.headline[kind], { title }), url: event.path ?? "/", tag: \`${kind}|${target}\` })`. Dedupe map `kind|target|state`24 h. On sender error with`statusCode`404/410 →`store.remove(endpoint)`. Appends `{ ts, kind, target, sent, failed }`. Never throws.

- [ ] **Failing tests** in `web-push.notifier.test.ts` (temp dir store, stub sender `vi.fn()`, stub lookups, stub settings store returning `{ locale: "en" }`):
  - `pushes a Tier-3 approval-waiting to every subscription` — `approval-requested` entry without `approvalId` → sender called once per subscription; payload `body === "Waiting for your decision: <summary>"`, `url === "/governance/approvals"`.
  - `ignores Tier-2 events` — `briefing-generated` → sender not called.
  - `dedupes the same event within 24h`.
  - `drops a subscription the push service reports gone (410)` and keeps it on a 500.
  - `does nothing without subscriptions`.
  - store: `add` twice with same endpoint → `list()` length 1; `vapid()` returns the same keys on a second store instance over the same dir.
- [ ] Run `pnpm exec vitest run apps/api/src/web-push` → FAIL; implement; → PASS.
- [ ] Controller: `@UseGuards(OperatorTokenGuard)`, handlers map to store (`publicKey` from `vapid()`). `npx tsc -p apps/api/tsconfig.json --noEmit` clean. Commit `Push Tier-3 operator events to browser subscriptions`.

### Task 3: Web — service worker, manifest, settings toggle

**Files:**

- Create: `apps/web/public/sw.js` (`push` → `showNotification(title, { body, tag, icon: "/icon.png", data: { url } })`; `notificationclick` → focus a same-origin client and navigate, else `clients.openWindow(url)`)
- Create: `apps/web/app/manifest.ts` (name "ZIBBY", `display: "standalone"`, `start_url: "/"`, icon `/icon.png`)
- Create: `apps/web/features/web-push/mutations/{useSubscribeWebPushMutation,useUnsubscribeWebPushMutation,index}.ts`
- Create: `apps/web/features/settings/components/WebPushSection.tsx` + `.test.tsx`; mount in `features/settings/Screen.tsx` after `OperatorChannelSection`
- Modify: `apps/web/i18n/messages/{cs,en}.json` — `settings.webPush.{title,label,hint,unsupported,denied,error}`

**Interfaces — Consumes:** Task 1 contract via `apiClient.webPush.*`; public key fetched imperatively with `apiClient.webPush.getWebPushPublicKey.query()` on enable.

- WebPushSection: `Panel` + `Toggle` (Appearance pattern). On mount reads `navigator.serviceWorker.getRegistration("/sw.js")?.pushManager.getSubscription()` → checked. Enable: `register("/sw.js")`, `Notification.requestPermission()` (denied → show `denied` hint), `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <base64url→Uint8Array> })`, `subscribe.mutate({ body: sub.toJSON() })`. Disable: `sub.unsubscribe()` + `unsubscribe.mutate({ body: { endpoint } })`. Unsupported (`!("serviceWorker" in navigator) || !("PushManager" in window)`) → Toggle disabled + `unsupported` hint. Errors → `error` hint.
- [ ] **Failing tests** (`--project web-components`): `shows the unsupported hint when the browser has no PushManager` (toggle disabled); `enabling subscribes and posts the subscription` (stub `navigator.serviceWorker`, `window.PushManager`, `Notification.requestPermission → "granted"`, mock the api client; assert the subscribe mutation received `endpoint`).
- [ ] Implement → PASS; prettier/eslint on changed files; `npx tsc -p apps/web/tsconfig.json --noEmit`. Commit `Add opt-in web push toggle and service worker`.

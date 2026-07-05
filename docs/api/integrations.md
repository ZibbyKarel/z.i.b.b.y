# Integrations

Integrations are the configured inbound channels ZIBBY watches — Slack, email,
Jira, GitHub, Google Calendar. Each integration belongs to exactly one project
(one project = one company): configuration and credentials are CRUD over
HTTP, but the connection itself is exercised by the channel adapters
documented in `docs/api/channels.md`, not by this module.

## Pieces

| Piece               | File                                                       | Role                                                                       |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Schema              | `libs/contracts/src/integrations/integration.schema.ts`   | `IntegrationSchema`, the per-kind `*ConfigSchema` discriminated union, `CredentialsInputSchema`, `TestResultSchema` |
| Contract            | `libs/contracts/src/integrations/integrations.contract.ts` | `integrationsContract` — CRUD + credentials sub-resource + connection test |
| Storage             | `apps/api/src/integrations/integrations.storage.service.ts` | `IntegrationsStorageService` — one `<id>.json` per integration            |
| Credentials store   | `apps/api/src/integrations/credentials.store.ts`           | `CredentialsStore` — one gitignored `<id>.json` per integration, write-only over HTTP |
| Credential kind rule | `apps/api/src/integrations/credential-kind.ts`             | `credentialMatchesKind` — which credential shape a kind expects            |
| Connection tester   | `apps/api/src/integrations/connection-tester.ts`           | `ConnectionTester` seam, bound to the channels `AdapterRegistry`           |
| Controller          | `apps/api/src/integrations/integrations.controller.ts`     | Implements the contract                                                    |

## The credential model

Credentials are kept out of the committed integration entity entirely.
`IntegrationsStorageService.serialize()` strips `hasCredentials` /
`status` / `lastSyncAt` / `lastError` before writing — the on-disk entity file
is config-only (`id`/`kind`/`projectId`/`name`/`enabled`/`config`), so a
watcher tick or a credential swap never touches a git-tracked file. Two things
live in a separate, gitignored place instead:

- **Volatile connection health** (`status`/`lastSyncAt`/`lastError`) — stamped
  by the watcher or by a connection test into a sidecar
  (`<stateDir>/<id>.json`) and re-attached at read time.
- **The secret itself** — `CredentialsStore` writes one `<id>.json` per
  integration under a separate gitignored directory. It is write-only over
  HTTP: the API only ever exposes a computed `hasCredentials: boolean` on the
  entity, never the credential value, and the store does no logging at all so
  a token can't leak through a debug line.

`CredentialsInputSchema` is a closed union of exactly two shapes —
`{ token }` or `{ password }` — and `credential-kind.ts` enforces which one an
integration's `kind` expects:

```ts
credentialMatchesKind(kind, creds) // kind === "email" ? "password" in creds : "token" in creds
```

Email authenticates with a `password`; Slack, Jira, GitHub, and Calendar all
carry a `token` (for Jira this is a Basic `email:token` pair; for Calendar it's
the service-account JSON key). `setCredentials` rejects a mismatched shape
with `422` before it ever reaches the store.

`kind` itself is immutable after creation — `config` is a
`z.discriminatedUnion("kind", …)`, so changing kind without a matching config
rewrite would desync the two; `updateIntegration` returns `422` if a patch's
`config.kind` disagrees with the existing `kind`.

## Connection testing

`POST /integrations/:id/test` calls the `ConnectionTester` seam (bound to the
channels `AdapterRegistry`, so the real adapter — or the fake one under
`CHANNEL_FAKE_DIR` in tests — does the actual probe) and stamps the result
onto the sync-state sidecar: `connected` + `lastSyncAt` on success, `error` +
`lastError` on failure. It returns `409` if no credentials are configured yet
— there is nothing to test.

## Project scoping

Every integration carries a `projectId` foreign key and `createIntegration`/
`updateIntegration` both 422 on an unknown project. `listIntegrations` accepts
an optional `?projectId=` filter. There is no standalone `/integrations`
route in the web app — integrations are managed from their owning project's
detail page (see `docs/web/overview.md`'s routing section, the project
`integrations/[integrationId]` detail route); the API itself is otherwise
project-agnostic (you can still `GET /integrations` unfiltered).

## Endpoints (`/api/integrations`)

- `POST /integrations` — create (`409` on duplicate id, `422` if
  `config.kind` doesn't match `kind` or the project doesn't exist).
- `GET /integrations` — list, optionally `?projectId=` scoped.
- `GET /integrations/:id` — get one.
- `PATCH /integrations/:id` — update name/enabled/config/projectId (never
  `kind`; `422` on a kind change or an unknown reassigned project).
- `DELETE /integrations/:id` — delete; cascades the credentials file and the
  sync-state sidecar.
- `PUT /integrations/:id/credentials` — set the secret (write-only; `422` on
  a shape that doesn't match `kind`).
- `DELETE /integrations/:id/credentials` — remove the stored secret.
- `POST /integrations/:id/test` — probe the live connection and stamp status
  (`409` with no credentials configured).

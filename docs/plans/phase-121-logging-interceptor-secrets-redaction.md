# Phase 121 — LoggingInterceptor: redact secrets before logging request/response bodies

> `docs/audit/report-final.md:28` (Critical, potvrzeno) / `docs/audit/batches/api-shared-root.md:3-5`:
> _"Secrets leak do stdout logu. Globální `LoggingInterceptor` loguje syrové request body na všech
> mutačních routách kromě `/logs`. Postihuje `PUT /projects/:id/secrets`,
> `/integrations/:id/credentials`, `/mcp-servers/:id/credentials` + chat prompty. `safeStringify`
> jen zkracuje (1000 znaků), neredaguje. Jediný fix (redakční deny-list + `skipBody` pro
> `/credentials`+`/secrets`) zavře všechny naráz."_

## Recon (verified)

- `apps/api/src/shared/logging/logging.interceptor.ts` — global `NestInterceptor`, registered
  app-wide via `APP_INTERCEPTOR` in `apps/api/src/shared/logging/logging.module.ts:26` (no
  per-route opt-out today).
  - `isNoisyBodyRoute(url)` (l.21-23) only matches `url.includes("/logs")` — the sole existing
    body-skip mechanism, and it exists for payload-size reasons, not secrecy.
  - `intercept()` (l.44-80): for every non-GET/HEAD request it logs at `info` level
    (`this.log[level]`, l.59-63) `params`, `query`, and — unless `skipBody` — `body: preview(req.body)`.
    On completion it likewise logs `result: preview(value)` (l.68-70) unless `skipBody`. Both the
    **request body** and the **response body** are logged verbatim (bounded, not redacted).
  - `preview()` (l.87-89) calls `safeStringify(value, BODY_PREVIEW_MAX)` with `BODY_PREVIEW_MAX = 1000` (l.13).
- `apps/api/src/shared/logging/serialize.ts` — `safeStringify` (l.15-36): handles circular refs,
  stringifies `bigint`, truncates any individual string field over `FIELD_MAX = 500` (l.12), and
  truncates the whole serialized line over the caller's `maxLen` (default `LINE_MAX = 4000`, here
  1000). **It does no key-based redaction** — a `password`/`token` field under 500 chars round-trips
  into the log line unchanged, confirming the audit finding.
- No `skipBody`-style decorator or route-pattern allowlist exists beyond `isNoisyBodyRoute`.
- Confirmed secret-bearing mutating routes, from `libs/contracts/src`:
  - `PUT /api/projects/:id/secrets` — `setProjectSecrets`, body `ProjectSecretsInputSchema`
    (`libs/contracts/src/projects/projects.contract.ts:78-84`).
  - `PUT /api/integrations/:id/credentials` — `setCredentials`, body `CredentialsInputSchema`
    (`libs/contracts/src/integrations/integrations.contract.ts:61-68`).
  - `PUT /api/mcp-servers/:id/credentials` — `setMcpCredentials`, body `McpCredentialsInputSchema`
    (`libs/contracts/src/mcp/mcp.contract.ts:59-66`).
  - `POST /api/chat/messages` (`libs/contracts/src/chat/chat.contract.ts:23-24`) — body can carry a
    pasted secret in the chat prompt; not a "credentials"/"secrets" URL, so URL-pattern skip alone
    won't cover it — needs key-based redaction too.
- No existing test file for the interceptor (`apps/api/src/shared/logging` has no `*.spec.ts` at all
  today) — this phase adds the first one.
- Assumed, not verified in this recon: whether any other current or future route will carry secret
  values under generically-named keys (e.g. a nested `env` map on MCP server config) — the deny-list
  below is written broad enough to catch the known shapes, but isn't exhaustively enumerated against
  every schema in `libs/contracts`.

## Goal

`LoggingInterceptor` never writes a real secret value to stdout: known secret-bearing routes
(`/credentials`, `/secrets`) skip body/result logging entirely, and — as defense in depth for every
other route, including chat — any object value logged through `safeStringify` has deny-listed keys
recursively replaced with `"[redacted]"` before truncation. Existing truncation and non-secret
logging behavior (request line, status, timing, params, query) is unchanged.

## Approach

1. **Add a recursive redaction pass in `serialize.ts`.**
   - Define a deny-list of case-insensitive substrings:
     `["token", "password", "secret", "apikey", "api_key", "env", "headers", "credential", "authorization", "cookie"]`
     (start from the audit's list — token/password/secret/env/headers/credentials — plus
     `apiKey`/`authorization`/`cookie` since those are common secret carriers in this codebase's
     integration/MCP schemas).
   - Add `redact(value: unknown): unknown` that walks plain objects and arrays recursively (guard
     against cycles with the same `WeakSet` pattern already used in `safeStringify`) and, for every
     object key whose lowercased name **contains** any deny-list substring, replaces the value with
     the literal string `"[redacted]"` instead of recursing into it. Non-object/array leaf values
     pass through unchanged. Keep this a pure function, independent of `safeStringify`.
   - Call `redact()` on the value **before** the existing `JSON.stringify` replacer pipeline in
     `safeStringify`, so truncation (`FIELD_MAX`, `LINE_MAX`) still applies after redaction — i.e.
     `safeStringify(value, maxLen)` internally becomes `JSON.stringify(redact(value), replacer)` with
     the same replacer/truncation logic as today. Keep `safeStringify`'s existing signature so all
     other call sites (error logging, etc.) get redaction for free with zero call-site changes.
2. **Add a `skipBody` route check for known secret routes, alongside the existing noisy-route check.**
   - Extend (or add a sibling to) `isNoisyBodyRoute` in `logging.interceptor.ts`: a route matches
     `skipBody` if the URL includes `/credentials` or `/secrets` (covers all three confirmed routes
     above without hardcoding ids). Keep the existing `/logs` check — same mechanism, one combined
     boolean, e.g. `isNoisyBodyRoute(url) || isSecretRoute(url)`.
   - When `skipBody` is true, log a marker instead of nothing so it's visible in the log that a body
     existed but was intentionally withheld, e.g. `body: "[skipped: secret route]"` — matches the
     existing pattern of the request line always being informative. (Optional nicety, not required —
     omitting the field entirely, as today's `skipBody` does for `/logs`, is also acceptable; pick
     whichever keeps the diff smaller. Recommend the marker for auditability.)
   - This is belt-and-suspenders on top of step 1's key-based redaction: the credentials/secrets
     payloads are pure secret blobs (no non-secret fields worth keeping), so skipping the whole body
     is cleaner than redacting field-by-field; the deny-list still protects chat and any other route
     carrying a secret-shaped key under a non-secret path.
3. **Response bodies get the same treatment.** `preview(value)` is used for both request body (l.62)
   and response `result` (l.69) — since both go through the same `safeStringify`, step 1 covers both
   automatically. Step 2's `skipBody` already gates the `result` log too (l.69), so no separate change
   needed there.
4. **No change to `BODY_PREVIEW_MAX` / `FIELD_MAX` / `LINE_MAX` truncation constants** — redaction is
   additive, truncation behavior for non-secret fields is unchanged.

## Testing

- New `apps/api/src/shared/logging/serialize.spec.ts`:
  - `safeStringify` redacts a top-level key matching each deny-list substring (`token`, `password`,
    `secret`, `env`, `headers`, `credential`, `apiKey`, `authorization`, `cookie`), case-insensitively
    (e.g. `Token`, `PASSWORD`).
  - Redacts a **nested** secret key (object inside object, and inside an array of objects).
  - Non-secret keys and values pass through unchanged (no over-redaction of e.g. `tokenCount` — decide
    and document whether substring match is intentionally broad enough to catch `tokenCount` too;
    given this is a security control, prefer over-redaction to under-redaction, so leave substring
    matching as-is and note it in a comment).
  - Truncation (`FIELD_MAX`/`LINE_MAX`) still applies after redaction on a long non-secret string.
  - Circular references still resolve to `[Circular]` (regression guard on existing behavior).
- New `apps/api/src/shared/logging/logging.interceptor.spec.ts`:
  - A request to a URL containing `/credentials` or `/secrets` logs no request body / result body
    (or the `[skipped: secret route]` marker if that option is taken).
  - A request to a normal mutating route (e.g. `/projects`) still logs `body`/`result` as before
    (no regression).
  - A request whose body contains a secret-shaped key on a *non*-secret route (simulating chat) gets
    the key redacted rather than the whole body dropped.
- e2e (optional, if an existing e2e suite already exercises `PUT /integrations/:id/credentials` or
  `PUT /projects/:id/secrets`): assert the captured stdout/log spy for that request never contains the
  literal secret value sent in the test fixture.
- Run in order per project convention: `pnpm check:lint`, `pnpm check:types`, `pnpm test`
  (or scoped: `pnpm exec vitest run apps/api/src/shared/logging`).

## Effort & risk

**S.** Single shared file (`serialize.ts`) plus one call site (`logging.interceptor.ts`) touched;
no contract or controller changes. Risk is low — the change only removes/replaces logged data, it
does not alter request handling, response shape, or control flow. The main risk to watch is
over-redaction breaking log usefulness (e.g. redacting a legitimately-informative field whose name
happens to contain a deny-listed substring); mitigate by keeping the deny-list reviewed in code
review and preferring redaction-safety over log verbosity per the audit's own guidance.

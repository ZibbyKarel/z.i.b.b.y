# Phase 127 — chat MCP endpoint authorization (loopback + shared-secret token)

> `docs/audit/report-final.md:99` (High): _"`chat/chat-mcp.controller.ts:49` | `POST /api/chat/mcp`
> bez autorizace → kdokoli na portu spustí create_task/machine ops | Loopback + shared-secret
> token."_
>
> `docs/audit/batches/api-chat.md`, first High finding: _"Endpoint POST /api/chat/mcp nemá žádnou
> autorizaci (v celém apps/api nejsou guardy) a přijímá JSON-RPC tools/call přímo — cokoli, co
> dosáhne na port, může spustit create_task nebo machine_rename/open_folder/open_maps bez modelu.
> Governor (answer/ask/act) žije jen v systémovém promptu, takže není vynucovací hranice, jen
> instrukce pro model; skutečné bezpečí drží až approval gate ve scheduleru/machine.propose."_

## Recon (verified)

- `apps/api/src/chat/chat-mcp.controller.ts` — `@Controller()` (no prefix), `@Post("api/chat/mcp")`
  `handle()` (l.49-80) builds a fresh `McpServer` + `StreamableHTTPServerTransport` per request and
  hands it straight to `transport.handleRequest` — **no auth check anywhere in the method**. `@Get`
  is a 405 stub (l.82-93); no auth there either.
- Tools registered on that server (`buildServer()`, l.96-202), all reachable by anyone who can POST
  valid JSON-RPC `tools/call` to this route:
  - `create_task` (l.99-127) — dispatches a real task through the scheduler/approval gate.
  - `recall_memory` (l.129-140), `get_status` (l.142-152) — read-only.
  - `machine_rename` (l.154-170), `open_maps` (l.172-184), `open_folder` (l.186-199) — machine ops;
    each is documented as "PROPOSE… Tier-3 approval; only the operator's approve executes it" — i.e.
    they still land behind the approval queue, so this endpoint's real blast radius is *creating
    approval-gated work items and spending the model's create_task path*, not unmediated machine
    control. `create_task` is the sharper edge: it starts a run immediately (Tier-1/2 per the task's
    own kind), no approval needed to *start* it.
  - Confirmed via `apps/api/src/chat/chat-tools.service.ts` (batch finding, not re-verified line-by-
    line here) that these delegate to the same services the rest of the app uses — no separate,
    weaker authorization path inside them. The gate this endpoint is missing is "can you reach the
    tool-call surface at all," not "can the tool itself do damage" (that part already has its own
    Tier-3 gate) — but `create_task` bypasses that mitigation, which is why the audit calls it out.
- **Caller / wiring** (`apps/api/src/chat/chat-session.service.ts`):
  - `mcpBaseUrl(conversationId)` (l.153-156): `${ZIBBY_API_BASE ?? http://localhost:${PORT ?? 3333}}/api/chat/mcp?conversationId=...`.
  - `toolArgs(conversationId)` (l.163-168): builds `{ mcpServers: { zibby: { type: "http", url: this.mcpBaseUrl(conversationId) } } }`
    and returns `["--mcp-config", JSON.stringify(config), "--allowedTools", "mcp__zibby__*"]`.
  - `buildArgs()` (l.110-148) assembles the full CLI invocation; `toolArgs()` output is appended
    at l.146 — **currently inline JSON on argv**, same class of exposure the audit flags separately
    for the runner (`apps/api/src/runner/claude-run-command.service.ts:466`, finding at
    `report-final.md:94`, not this cluster — see Approach step 4 below for the coordination note).
  - `createProcess()` (l.171-175): `spawn(process.env.CLAUDE_BIN ?? "claude", args, { stdio: [...] })`
    — the `claude` CLI process that then makes the loopback HTTP call to `/api/chat/mcp` as its MCP
    transport, per the CLI's own `--mcp-config` handling (not this repo's code).
- **Existing precedent for `headers` on an http MCP server config**: `apps/api/src/runner/claude-run-command.service.ts:582-609` (`buildMcpConfig`) already merges `server.headers`,
  stored credential `headers`, and `authToken` folded into `Authorization: Bearer <token>` for
  runner-attached MCP servers — i.e. the `{ type: "http", url, headers }` shape used here for the
  token is an established pattern in this codebase, not a new one.
- **Bind address**: `apps/api/src/main.ts` calls `await app.listen(port)` (l.119) with **no host
  argument** — Nest/Express defaults to all interfaces, not loopback-only. `CORS_ORIGIN` (l.64) gates
  browser-origin requests only; it does nothing for a same-host or LAN-reachable direct POST. So the
  audit's "kdokoli na portu" claim is accurate: any process that can reach `PORT` (default 3333) —
  same host, or the LAN if the port isn't firewalled — can hit this route today.
- **No guard convention exists in this codebase**: `grep -rn "CanActivate\|UseGuards"` across
  `apps/api/src` returns zero matches. There is no `@Injectable() … implements CanActivate` anywhere
  to mirror; this phase introduces the first one (or an equivalent inline check — see Approach).
- **Sibling with the identical gap, out of this cluster's scope**: `apps/api/src/memory/entity-mcp.controller.ts`
  (`POST /api/memory/mcp`, seeded as the `zibby-entities` MCP server at
  `mcp.storage.service.ts:59-70`, url `http://localhost:${port}/api/memory/mcp`) is built "mirrors
  `ChatMcpController` verbatim" per its own doc comment and has the same missing-auth shape. Not in
  the audit's High row for this phase (only `chat-mcp.controller.ts:49` is named), but the guard
  built here should be written so it is trivially reusable there — flagging as a natural fast-follow,
  not doing it in this phase (keep the diff scoped to the named finding).
- **Token/secret generation precedent in this codebase**: no existing per-process shared-secret
  pattern; the closest analogues are `randomBytes`/`randomUUID` from `node:crypto`, used throughout
  for ids (`apps/api/src/runner/runner-core.ts:449`, `apps/api/src/tasks/attachment-storage.service.ts:14`,
  `apps/api/src/shared/file-storage/file-utils.ts:69-71` via `collisionResistantId`, trace ids in
  `trace.middleware.ts` etc.) — never persisted to a config file, always generated in-process. This
  phase's token should follow the same shape: generated with `randomBytes`/`randomUUID`, held only in
  memory (a service field), never written to `data/system-config.json` or any other on-disk store —
  it only needs to live as long as the api process does, and only the process's own spawned `claude`
  children ever need it.
- Confirmed vs. assumed: the controller/session-service code paths above are read directly and line
  numbers confirmed against the current file contents. Not independently re-verified: the exact
  runtime behavior of the `claude` CLI's `--mcp-config` HTTP transport with a `headers` block (assumed
  to forward arbitrary headers on every request, consistent with the existing runner precedent that
  already relies on this for `Authorization: Bearer`).

## Goal

`POST /api/chat/mcp` accepts a `tools/call` only from the local chat engine: the process binds to
loopback (or the request is asserted to originate from loopback), **and** every request must carry a
per-process shared-secret token that only the api process itself knows and hands to the `claude` CLI
it spawns. A request missing or presenting the wrong token gets `401` before any MCP tool executes.
No behavior change for the legitimate path (the chat engine's own turns keep working exactly as
today, transparently carrying the token).

## Approach

1. **Generate a per-process token at boot.** Add a small in-memory holder — either a field on
   `ChatSessionService` (simplest: it already owns `mcpBaseUrl`/`toolArgs`, the two places that need
   to know the token) or a tiny new `ChatMcpAuthService` shared between `ChatSessionService` (writer)
   and `ChatMcpController` (reader) via DI — generated once via
   `randomBytes(32).toString("hex")` (or `randomUUID()`, matching the codebase's existing id
   convention) in the constructor / a module provider factory. Never persisted to disk, never logged
   (the audit-flagged `LoggingInterceptor` redaction work in `phase-121-logging-interceptor-secrets-redaction.md`
   is a separate, already-planned mitigation for header/body logging generally — this token being
   `Authorization`-shaped means it's covered by that deny-list once phase 100 lands, but don't rely on
   ordering between the two phases; this phase's own code must not `Logger.log` the raw token either).
   - Prefer the dedicated-service shape (`ChatMcpAuthService` in `chat/`) over a field on
     `ChatSessionService` if the guard also needs it independently via DI (NestJS guards resolve
     providers through the module, not through another controller/service's private field) — this
     keeps the token single-sourced and testable in isolation.
2. **Gate `POST /api/chat/mcp` on the token, reject otherwise with 401.** Given no guard convention
   exists yet in this codebase, pick one of two equally-valid shapes and pick based on the reviewer's
   preference — the plan supports either without changing scope:
   - (a) A minimal `CanActivate` guard (`chat-mcp-auth.guard.ts`) reading a header (e.g.
     `x-zibby-mcp-token` — avoid overloading `Authorization`, since that header is also the
     `Bearer` slot the runner precedent uses for *outbound* MCP server auth and mixing concerns here
     would be confusing) and comparing it constant-time-ish (a plain `===` is acceptable here; this
     is a local shared secret, not a public-facing credential, so timing-attack hardening is not
     warranted) against `ChatMcpAuthService.token`. Apply via `@UseGuards(ChatMcpAuthGuard)` on the
     controller class (covers both `@Post` and `@Get`) or just the `@Post` handler.
   - (b) An inline check at the top of `handle()` (and `rejectGet()` for symmetry) reading
     `req.headers["x-zibby-mcp-token"]` directly and writing a `401` + JSON-RPC error body (mirror the
     existing `500`/`405` error-body shape already in the file) before doing anything else — no new
     abstraction, smallest possible diff, consistent with "no guards anywhere in apps/api" as of
     today.
   - Recommend (a) if the entity-mcp.controller.ts fast-follow (see Recon) is likely to happen soon
     (the guard becomes directly reusable there with a different token/service instance); recommend
     (b) if this phase should stay minimal and self-contained. Either way: wrong or missing token →
     `401` with a JSON-RPC-shaped error body (not a bare Nest 401 page, to keep the response
     consistent with the controller's existing error responses), correct token → proceeds exactly as
     today.
3. **Plumb the token into the spawned CLI's MCP config, not argv.** In `chat-session.service.ts`:
   - `mcpBaseUrl()` (l.153-156) stays URL-only (loopback host, unchanged shape).
   - `toolArgs()` (l.163-168) currently builds `{ mcpServers: { zibby: { type: "http", url } } }`
     inline into `--mcp-config`. Add a `headers: { "x-zibby-mcp-token": <token> }` block to the
     `zibby` server entry, mirroring the exact shape already used by
     `claude-run-command.service.ts:601-609` for `Authorization: Bearer`. **Do not** pass the token
     as a separate CLI flag or env var read from argv — the audit's own adjacent finding
     (`claude-run-command.service.ts:466`, `report-final.md:94`) is specifically that inline
     `--mcp-config` JSON on argv is visible via `ps` on this host; that finding covers the *runner's*
     MCP config (different call site, different phase/owner — not verified as already planned under
     a specific phase number in this recon; coordinate before landing rather than assuming a fixed
     cross-reference). This phase's own `--mcp-config` JSON has the same argv-visibility property for
     the *token* specifically (the URL was already argv-visible and is not secret; the new token
     would newly become argv-visible if left inline).
     - Two options, in order of preference:
       1. **Config-file, matching `buildSystemPromptArgs`'s precedent** (`claude-run-command.service.ts:492-499`,
          `--append-system-prompt-file <path>` instead of inline text): write the `--mcp-config` JSON
          (URL + token header) to a short-lived file (e.g. under the same per-turn/session temp area
          the chat engine already has, or a dedicated `data/chat/mcp-config/<turnId>.json`, cleaned up
          after the turn) and pass `--mcp-config <path>` (the CLI accepts a file path for this flag —
          confirm against the CLI's own docs/behavior before implementing; if the CLI's `--mcp-config`
          only accepts inline JSON, not a path, fall back to option 2 below and note the constraint).
       2. If the CLI genuinely requires inline JSON for `--mcp-config` and does not accept a file
          path: keep the URL inline (not secret) but source the token via an environment variable set
          only on the spawned child's `env` (`spawn(..., { env: { ...process.env, ZIBBY_CHAT_MCP_TOKEN: token } })`)
          and have the config's `headers` value reference it indirectly is not possible for a static
          JSON blob — so this fallback instead means: don't put the token in `--mcp-config` headers at
          all; instead have the guard also accept the token via a query param appended to the URL
          (`?conversationId=...&t=<token>`) — this keeps the *secret* out of argv-visible flag text in
          the sense that it's still argv-visible via the URL, which does NOT solve the audit finding.
          **This fallback is therefore not acceptable as a final state** — if the CLI truly can't take
          a `--mcp-config` file path, this phase must instead find another isolation mechanism (e.g. a
          short-lived, single-use token embedded in the URL path segment that the controller rotates
          per turn, accepting that argv-visibility is unavoidable for *some* token shape, but scoping
          its value to one turn so a `ps` sighting is only ever a one-shot credential) rather than
          silently shipping a still-argv-visible long-lived secret. Confirm which case applies as the
          first implementation step before writing the rest of this approach.
4. **Bind to loopback (defense in depth, independent of the token).** In `apps/api/src/main.ts`,
   change `await app.listen(port)` (l.119) to `await app.listen(port, "127.0.0.1")` — the api has no
   legitimate reason to accept `/api/chat/mcp` (or anything else) from outside the host; the web app
   talks to it via `CORS_ORIGIN` from the browser, which still works identically since CORS is a
   browser-side check on top of a TCP connection the browser makes to `127.0.0.1`/`localhost` in dev.
   **Verify before landing**: check whether any deployed/ops configuration (launchd plist, Docker,
   reverse proxy) currently relies on the api listening on `0.0.0.0`/all-interfaces (e.g. a proxy on a
   different host, or `web` running in a separate container reaching the api by non-loopback address)
   — if so, loopback-only breaks that topology and this step needs a flag/env override
   (`API_BIND_HOST`, default `127.0.0.1`) rather than a hardcoded change. This is the one step in this
   plan most likely to need an operator decision; flag it explicitly in the PR description rather than
   silently narrowing the bind address.
5. **Keep `EntityMcpController` in mind but out of scope.** Don't touch
   `apps/api/src/memory/entity-mcp.controller.ts` in this phase — same gap, different finding/owner in
   the audit's row list. Structure the guard/token-service (if using approach 2a) so it's easy to
   stand up a second instance for that controller later without duplicating logic.

## Testing

- `apps/api/src/chat/chat-mcp.controller.test.ts` (new, or extend if a test file already exists by
  the time this lands — confirm current state before writing):
  - `POST /api/chat/mcp` with no token header → `401`, JSON-RPC error body, no tool executes (spy on
    `ChatToolsService`/the registry to assert zero calls).
  - `POST /api/chat/mcp` with a wrong token → `401`, same assertions.
  - `POST /api/chat/mcp` with the correct token (read from the same `ChatMcpAuthService`/holder the
    test instantiates) → proceeds as today (200, tool call round-trips) — regression guard on the
    happy path.
  - If loopback-assertion is implemented as a request check (rather than relying solely on the bind
    change) rather than just the bind, add a case simulating a non-loopback `req.socket.remoteAddress`
    → rejected. If the *only* enforcement is the `app.listen` bind address (no in-handler check), skip
    this case and note in the test file why (bind-level enforcement isn't unit-testable without an
    actual socket).
- `apps/api/src/chat/chat-session.service.test.ts`: extend the existing
  `"wires the zibby MCP tool server (--mcp-config + --allowedTools)..."` test (l.130-137) to also
  assert the token is present in the built config (either the `headers` block, per approach step 3
  option 1/2, or wherever it ends up) — do not assert the *value* against a hardcoded string (the
  token is random per process); assert it's non-empty and matches whatever the token holder currently
  reports (`ChatMcpAuthService.token` or equivalent), OR that a `--mcp-config` file path is passed
  instead of inline JSON if option 1 (config-file) is taken — the test needs to change shape depending
  on which sub-option from step 3 is implemented.
- Manual/e2e (if the CLI-behavior question from step 3 needs live confirmation): a real chat turn
  (`pnpm --filter api ...` or the existing chat e2e/eval harness referenced in
  `chat-dispatch.eval.test.ts`) still successfully calls `create_task` end-to-end after the change —
  confirms the token round-trips through the real `claude` CLI's MCP HTTP transport, not just the
  mocked test.
- Commands, in order: `pnpm check:lint`, `pnpm check:types`, `pnpm test` (or scoped:
  `pnpm exec vitest run apps/api/src/chat apps/api/src/main` if a main.ts test exists — confirm; if
  not, the bind-address change has no direct unit test and relies on the manual/e2e check above).

## Effort & risk

**S**, contained to `apps/api/src/chat/` (controller + session service, plus a small new
guard/auth-holder) and one line in `apps/api/src/main.ts`. Risk is concentrated in two places, both
flagged explicitly above rather than glossed over:

1. **Step 3's CLI-capability question** (does `--mcp-config` accept a file path the way
   `--append-system-prompt-file` does?) is not verified in this recon and gates which sub-approach is
   correct — resolve it first, before writing code, to avoid rework.
2. **Step 4's bind-address change** is the one part of this plan that could regress a deployment
   topology this recon didn't have visibility into (non-loopback proxying) — ship it behind an env
   override default rather than an unconditional hardcode, and call it out for operator sign-off.

Cross-reference: the adjacent argv-secrets finding at `apps/api/src/runner/claude-run-command.service.ts:466`
(`report-final.md:94`) is a related but separately-owned cluster — this phase's own `--mcp-config`
argv exposure (the token, specifically) must be resolved within this phase regardless of that other
cluster's timeline; don't leave it "coordinated" into indefinitely deferred. Also flag
`apps/api/src/memory/entity-mcp.controller.ts` as a same-shape follow-up, not in scope here.

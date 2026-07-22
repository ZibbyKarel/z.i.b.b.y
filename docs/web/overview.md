# Web app — overview

**Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Tailwind v4, next-intl
**Port:** 3000
**Entry point:** `apps/web/app/layout.tsx`

## Routing (App Router)

```
app/
├── layout.tsx              Root server layout
├── page.tsx                Landing → redirect to /overview
├── globals.css             Global CSS (minimal)
└── (dashboard)/            Route group — dashboard shell
    ├── layout.tsx          Dashboard server layout (AppShell)
    ├── loading.tsx         Suspense fallback
    ├── agents/
    │   ├── page.tsx        Agent catalog
    │   └── [id]/page.tsx   Agent detail (edit, rules, used-by; N4c)
    ├── automations/
    │   ├── page.tsx        Automations
    │   └── [id]/page.tsx   Automation detail (edit, run-now, delete; N4f)
    ├── chains/
    │   ├── page.tsx        Chain catalog
    │   └── [id]/page.tsx   Chain detail
    ├── chat/page.tsx       Chat (phase 23 — a routed page, not an overlay;
    │                       see `features/chat/Screen.tsx`)
    ├── commands/
    │   ├── page.tsx        Command catalog
    │   └── [id]/page.tsx   Command detail (edit; N4d — same pattern as skills/[id])
    ├── companies/
    │   ├── page.tsx        Company portfolio
    │   ├── new/page.tsx    Create company
    │   └── [id]/page.tsx   Company detail
    ├── gates/page.tsx      Gate rules
    ├── hooks/[id]/page.tsx Hook detail (edit; N4e — mcp/[id] follows the same pattern)
    ├── mcp/
    │   ├── page.tsx        MCP server catalog
    │   └── [id]/page.tsx   MCP server detail
    ├── memory/page.tsx     Vault browser
    ├── overview/page.tsx   Overview (briefing + activity)
    ├── pipelines/
    │   ├── page.tsx        Pipeline list
    │   └── [id]/page.tsx   Pipeline detail + run history
    ├── projects/
    │   ├── page.tsx        Project portfolio
    │   ├── new/page.tsx    Create project
    │   ├── [id]/page.tsx   Project detail (team, autonomy, integrations + inbox)
    │   └── [id]/integrations/[integrationId]/page.tsx  Integration detail (N4h)
    ├── runs/page.tsx       Run history
    ├── settings/page.tsx  Workspace settings
    └── skills/
        ├── page.tsx        Skill inventory
        └── [id]/page.tsx   Skill detail (edit; N4d)
```

There is no standalone `/approvals`, `/tasks`, or `/limits` route — those concerns
live either on `/overview` (approvals badge, queued tasks) or inline on their
owning domain page.

## Root layout (`app/layout.tsx`)

Server component — loads the locale + messages and mounts:

1. `next/font/google` — Geist (`--font-sans`) + JetBrains Mono (`--font-mono`)
2. `NextIntlClientProvider` — internationalization
3. `<Providers>` — all client-side providers

## Providers (`app/providers.tsx`)

Client component (`"use client"`):

```tsx
<QueryClientProvider client={client}>
  {" "}
  // TanStack Query, with a global MutationCache.onError → toastBus wiring
  <apiClient.ReactQueryProvider>
    {" "}
    // ts-rest client
    <RunEventsProvider>
      {" "}
      // single SSE channel driving run/activity query invalidation
      <DesignSystemProvider theme="dark">
        {" "}
        // dark theme
        <BootSplash>{children}</BootSplash>
        <Toaster /> // renders queued mutation-error toasts
      </DesignSystemProvider>
    </RunEventsProvider>
  </apiClient.ReactQueryProvider>
</QueryClientProvider>
```

`QueryClient` configuration: `staleTime: 30_000`, `refetchOnWindowFocus: false`.
The `MutationCache.onError` hook (`state/toastBus`) surfaces every failed
mutation — network, server, or contract-schema-drift errors — as a toast, so a
failed create/delete/toggle is never silent.

## Dashboard layout (`(dashboard)/layout.tsx`)

Server component — renders `AppShell` with children.

## AppShell (`components/layout/AppShell/`)

Client component (`"use client"`):

- Uses `usePathname()` to derive the active nav item
- Mounts `CatalogProvider` → `NewTaskProvider` → `ChatProvider` (in that
  nesting order; `NewTaskProvider` stays the outer task provider — the
  position the now-removed `VoiceProvider` used to hold — so the chat page can
  reach the task flow). **Phase 108** deleted the Fáze-11/Phase-24 app-wide
  "active project" scope (`ProjectProvider`/`useActiveProject`, persisted in
  the `activeProject` cookie) entirely — every screen now shows every
  project's data at once. The only project control left is `ProjectSelect`,
  mounted inline in `CommandLine` (Phase 102); it scopes just the task being
  launched, never any view.
- Renders `MainLayout` with `navItems`, `railSlot` (`RightRail`), `chatSlot`
  (`ChatButton`), `taskSlot` (`NewTaskButton`), and `walletSlot`
  (`LimitsRings`) slots
- **Phase 27:** on `/chat` (and any `/chat/*` sub-path), `AppShellInner`
  bypasses `MainLayout` entirely and renders `children` fullscreen in a
  `Container` sized to the viewport (`height="100dvh"`) — no nav rail, top bar,
  or right rail. Chat is a coequal, parallel UI to the HUD, not a screen nested
  inside it; the check sits above the nav-item/notification computation so
  those HUD-only hooks don't fire on `/chat`. The provider stack (in
  particular `ChatProvider`) still mounts around it, so the conversation
  persists across HUD ⇄ chat navigation. **Task 6 (Velín-D immersive chrome):**
  `ChatScreen`'s own glass `ChatTopBar` (status pill, ⌘K search, limits gauge,
  language switch, clock) and the right-edge `ChatToolDock` (icon links into
  the HUD's pages) are the chat surface's own chrome; the explicit Close button
  was removed entirely — the tool dock's icons are the way back to the HUD,
  alongside ⌘/Ctrl+J. New-chat (now a trash-icon control) and the voice toggle
  moved down into the composer dock, beside `VoiceStatusStrip`.

The Voice UI (JARVIS-style takeover, speech-to-text input, TTS read-back) was
removed in favor of a chat-first interface (`features/chat`); there is no
`VoiceProvider` and no `features/voice` module anymore.

**Phase 119 — voice mode lives inside chat, not as a separate surface.** A mic
toggle (`VoiceToggleButton`, rendered only when the browser supports
`SpeechRecognition`/`webkitSpeechRecognition`) arms `useSpeechRecognition`
(`features/chat/hooks`); a final transcript calls `ChatScreen`'s `send(text)`
directly, bypassing the composer. `useVoiceMode` holds the
idle → listening → thinking/streaming → speaking → listening turn-taking state
(mic stays disarmed via the recognizer's `suspended` option while a turn is in
flight or a reply is speaking, then re-arms once playback settles); a
recognition error drops voice mode off with a toast. While voice mode is on,
`useAutoSpeak` sentence-chunks each completed reply and plays it sequentially
through the `speakd` TTS proxy (`POST /api/speech/synthesize`, same player
singleton as the phase-120 manual read-aloud button — one speaks at a time).
The voice used for synthesis is a `SystemConfig` knob, `ttsVoice` (settings →
Chat UI section, alongside a compact daemon status line from
`features/speech`'s `useSpeechVoicesQuery`/`useSpeechStatusQuery`), not
per-message UI. STT is entirely client-side (Web Speech API); there is still
no backend STT and no command-grammar bridge — a spoken utterance is just a
chat message.

**Phase 23 — chat is a routed page, not an overlay.** `ChatProvider` only owns
the conversation state (`conversationId`/`messages`, minted lazily and
preserved across navigation) and the `open()`/`close()`/`toggle()` navigation
helpers (`router.push('/chat')` / `router.push('/overview')`) plus the global
⌘/Ctrl+J shortcut — it no longer mounts the chat surface itself. The `/chat`
route (`app/(dashboard)/chat/page.tsx` → `features/chat/Screen.tsx`) renders
`ChatScreen` inside the normal dashboard shell (nav rail + top bar), pulling
the provider's state down as props; landing on `/chat` any way other than
`open()`/⌘J (a direct URL, the sidebar) still needs a conversation, so
`Screen` calls `ensureConversation()` on mount. `ChatButton`
(`chatSlot`) and the `chat` nav item (`state/config.ts`, glyph `butlerSign`)
both navigate to `/chat`.

### RightRail = live log (global)

`RightRail` (`components/layout/RightRail/`) is now **purely a live log of what
the server is currently doing** (`> 10:03  Integration gmail checked for
changes`) — visible on **every** page. Data flows over the same unified SSE
channel described below (an entry is prepended via `prependActivityEntry`) plus
`useActivityFeedInfiniteQuery` ("Load older" pages the history backward). What's
visible / grouped / hidden is controlled by the **Settings → Activity** config
(`useActivityViewQuery`); grouping is a pure function in
`features/overview/activityLog.ts`.

Approvals and parked runs moved **from the rail into the `/overview` content**
(`ApprovalsPanel`, `ParkedRunsPanel`); the `/runs` tab and its nav badge are
unchanged.

## Internationalization (next-intl)

- Locale lives in a cookie (no URL prefix)
- `i18n/request.ts` reads `cookies().get('locale')`
- `NextIntlClientProvider` in the root layout
- Server: `getTranslations()`, client: `useTranslations()`
- Catalogs: `apps/web/i18n/messages/cs.json` + `apps/web/i18n/messages/en.json`
- Default locale: `cs` (Czech)
- Flat keys: `t('AgentName', { sub: 1 })`
- DS is i18n-agnostic — string props with English defaults; the app overrides
  with `t()`

## Fonts

| Variable      | Font                             | Use                  |
| ------------- | -------------------------------- | -------------------- |
| `--font-sans` | Geist                            | UI text              |
| `--font-mono` | JetBrains Mono (400/500/600/700) | Code, logs, terminal |

## API client (`state/api.ts`)

ts-rest client bound to `@zibby/contracts`:

- Type-safe HTTP calls, validated against the contract's Zod schemas at
  runtime (`validateResponse: true`) — a payload that drifts from the contract
  throws and surfaces as a query error
- Provides `ReactQueryProvider` for the query/mutation hooks
- Base URL: `NEXT_PUBLIC_API_URL` (must carry the `NEXT_PUBLIC_` prefix to
  reach the browser); no hardcoded fallback

## Features (domain modules)

```
features/
├── agents/         Agent CRUD, run launch
├── approvals/      Approval queue
├── automations/    Cron/event triggers
├── chat/           Chat-first interface (replaces the old Voice UI), including
│                   phase-119 voice mode (STT hook, mic toggle, auto-speak);
│                   its ambient orb-map backdrop is `SubsystemOrbMap`
│                   (see docs/web/subsystem-orb-map.md)
├── commands/       Slash-command catalog
├── companies/      Company portfolio (client/company records)
├── gates/          Gate rule catalog
├── goals/          Loop engine — goal definitions + runs (maker ⇄ verifier)
├── handoff/        Cross-subsystem handoff rules (inline mad-libs editor in
│                   the subsystem drawer's "Předávání" tab)
├── health/         System health status
├── hooks/          Hook catalog
├── integrations/   Channel adapters (email, Slack), scoped under a project
├── limits/         Budget display
├── mcp/            MCP server catalog
├── memory/         Vault note editor
├── notifications/  In-app notifications
├── overview/       Briefing + activity feed
├── pins/           Quick-launch pins
├── pipelines/      Pipeline editor + history
├── projects/       Project portfolio
├── research/       Research pipeline surfacing
├── runs/           Run history + log viewer, plus the shared SSE hooks
│                   (`runEvents`, `useRunLogStream`)
├── settings/       Workspace settings
├── skills/         Skill inventory
├── speech/         `speakd` voices/status queries (settings voice picker);
│                   the synthesize mutation itself stays in `features/chat`
├── system/         Runtime system-config surface
└── tasks/          New task dialog (tabs: Standard task / Loop) + scheduler
```

Each feature module follows:

```
features/<domain>/
  queries/      ← hooks (useXxxQuery.ts), re-exported from queries/index.ts
  mutations/    ← hooks (useXxxMutation.ts), re-exported from mutations/index.ts
  components/   ← domain composites (never DS primitives)
```

## Imports and module boundaries

**A feature's public surface is its barrel.** Every feature consumed by other
features exposes `features/<domain>/index.ts`, which re-exports its **data
layer** (`queries` + `mutations`; `runs` additionally re-exports the SSE/log
hooks from `runEvents`/`useRunLogStream`). Cross-feature imports go through the
barrel:

```ts
// ✅ via the public surface
import { useAgentsQuery } from "../agents";
// ❌ reaching into another feature's internals
import { useAgentsQuery } from "../agents/queries/useAgentsQuery";
```

The barrel **never** re-exports `Screen` — that would pull the entire view
graph into every consumer and reintroduce cycles (exactly like the DS
`CodeBlock ↔ index` case).

**Intentional narrow deep imports are kept:** dependency-free files holding
cache keys (`agents`/`pipelines`/`runs` `queries/keys.ts`) and the SSE fan-out
in `runs/runEvents.tsx`. They exist specifically to stay cycle-safe, so they're
imported directly rather than through the barrel.

**Path alias `@/*` → `apps/web/*`** (defined in `tsconfig.base.json`, mirrored
as a Vite alias in both vitest configs and in Storybook, since Vite doesn't
read tsconfig `paths`). New imports outside a feature's own tree should use
`@/…`; existing relative `../../…` imports are left alone until touched.

**Cycle guard:** `pnpm check:cycles` (madge over `apps/web`, ignoring
type-only imports and `libs/`, see `.madgerc`) plus the CI `cycles` job. The
`apps/web` graph is acyclic and must stay that way. (`eslint-plugin-import-x`'s
`no-cycle` silently doesn't work in this ESLint 9 flat-config setup — hence
madge.)

### Feature vs. service

"Feature" is an overloaded term — not every one has its own route:

- **Route features** (have a `Screen.tsx` + a segment under `(dashboard)/`):
  agents, automations, commands, companies, gates, hooks, mcp, memory,
  overview, pipelines, projects, runs, settings, skills (`gates` is
  route-only, with no nav item).
- **Shared services** (no `Screen`, consumed by other features / mounted in
  chrome): approvals, chat, goals, health, integrations, limits, notifications,
  pins, research, speech, system, tasks.

### Open follow-up cleanups

- **Boundary enforcement** (`no-restricted-paths` / `eslint-plugin-boundaries`)
  doesn't exist yet — the migration to barrel-only imports is intentionally
  incomplete (part of the tree is mid-migration, plus the narrow key imports).
  Introduce once the tree settles.
- **Feature-local hook placement** is inconsistent: a `hooks/` subdir (chat,
  skills) vs. flat files in the feature root (runs, automations, projects,
  notifications). Pick one direction.
- `state/forms.ts` still carries `// TODO: split this file into correct module`.
- `@/*` lives in `tsconfig.base.json` (shared) → `libs/` would also resolve
  `@/` to `apps/web`; the cleaner home is `apps/web/tsconfig.json` (at the cost
  of duplicating `@zibby/*` paths). Minor, not a blocker.

## Testing

Vitest project: `web`
Environment: jsdom
Harness: `renderWithProviders` (from `apps/web/test-utils/`)
Primary selector: `getByTestId` (per DS component testId enums)

Run with: `pnpm web:test`

Note: `apps/web` is **not** part of the root vitest workspace — run it via
`pnpm web:test`, not `pnpm test` (the root workspace would skip it).

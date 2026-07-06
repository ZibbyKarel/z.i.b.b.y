# Entity avatars — design spec

**Date:** 2026-07-06
**Branch:** `feat/audit-fixes` (or a fresh `feat/entity-avatars`)
**Status:** approved design, pre-implementation

## Goal

Agents and pipelines gain an **avatar** — an image that replaces the glyph
representation everywhere the entity is shown (catalog cards, pipeline phase
nodes, phase chips, chat dispatch identity, overview quick-launch), and a
profile-style **detail/edit view** where the avatar fills a hero band with the
name and description overlaid. Ship six default avatars for the delivery-loop
identities.

The mechanism already exists for **projects** (`Project.logo` data URI →
`IconTile src` with glyph fallback → `ProjectCard` / `ProjectBasicsPanel`). This
work extends the same pattern to agents and pipelines, and adds the richer
`EntityHero` header the design calls for.

## Decisions (locked)

1. **Detail view scope** — add the design's `EntityHero` profile hero to the
   agent detail page and pipeline detail panel, plus an editable
   upload/drag-drop/remove control in the edit surfaces. The rest of those
   views stay as they are. (Not a full rebuild; not minimal.)
2. **Default avatar storage** — ship the six PNGs as static assets in
   `apps/web/public/avatars/*.png`; seed the default entity `.md` frontmatter
   with a short path (`avatar: /avatars/architect.png`). Keeps `.md` files
   human-readable/diffable. User uploads are stored as `data:image/…` URIs in
   the same field (same tradeoff projects already make for custom logos).

Because defaults are paths and uploads are data URIs, the `avatar` field accepts
**either** a `data:image/…` URI **or** a `/`-rooted path — and nothing else,
which also blocks arbitrary external URLs (consistent with Law 4: inbound
content is data, never a fetch instruction).

## Avatar → entity mapping (live catalog `.zibby/data`)

| Design PNG          | Live agent id (`.zibby/data/agents`) |
| ------------------- | ------------------------------------ |
| `architect.png`     | `architect`                          |
| `coder.png`         | `fullstack-developer`                |
| `reviewer.png`      | `code-reviewer`                      |
| `tester.png`        | `test-automator`                     |
| `documentator.png`  | `documentation-engineer`             |
| `orchestrator.png`  | Delivery pipeline (`delivery.pipeline.md`) |

Source: `claude.ai/design` project **Z.I.B.B.Y**, files `zibby/avatars/*.png`.

## Change surface

### 1. Contract (`libs/contracts`)

- `libs/contracts/src/agents/agent.schema.ts` — add to `AgentSchema` (next to
  `glyph`):
  ```ts
  avatar: z
    .string()
    .refine((v) => v.startsWith("data:image/") || v.startsWith("/"), {
      message: "avatar must be a data URI or a root-relative path",
    })
    .max(280_000)
    .optional(),
  ```
  `CreateAgentSchema` (full) and `UpdateAgentSchema` (partial) derive it.
- `libs/contracts/src/pipelines/pipeline.schema.ts` — add the same `avatar`
  field to `PipelineObject`; confirm create/update derivations pick it up.
- `libs/contracts/src/tasks/task.schema.ts` — add `avatar` to the shared
  display base (line ~27, next to `glyph`) so agent/pipeline dispatch targets
  carry it into chat.

### 2. API storage

- `apps/api/src/agents/agents.storage.service.ts` — thread `avatar` through the
  read mapper (~line 114, next to `glyph`) and the write mapper (~line 147),
  mirroring `glyph` exactly.
- Pipeline storage service (locate `apps/api/src/pipelines/*.storage.service.ts`)
  — same read/write threading for `avatar`.
- Add a storage round-trip test asserting `avatar` survives write→read for both
  a path value and a data-URI value.

### 3. Default assets + seed data (files are source of truth)

- Download the six PNGs from the design project into
  `apps/web/public/avatars/{architect,coder,tester,reviewer,documentator,orchestrator}.png`.
  (Fetch via a subagent so the base64 stays out of the main context.)
- Add `avatar: /avatars/<name>.png` frontmatter to the five live agent files
  and `avatar: /avatars/orchestrator.png` to `delivery.pipeline.md`.
- Test fixtures (`apps/api/data-test`) are **not** seeded with avatars unless a
  test needs it — keep e2e determinism; the storage round-trip test covers the
  field.

### 4. Design system — new `EntityHero`

`libs/design-system/src/components/EntityHero/`:
- `EntityHero.tsx` — presentational hero:
  - Props: `image?`, `glyph` (fallback), `accent`, `name`, `tag?`, `meta?`,
    `desc?`, `height?`, `fit?` (`cover` | `contain`), `editable?`,
    `onUpload(dataUri)`, `onRemove()`, plus i18n-agnostic string props for
    control tooltips/placeholder (English defaults).
  - Behaviour: image fills the band (or glyph placeholder when absent); a
    bottom gradient dissolves the image into the panel background; name/meta/desc
    overlaid at the bottom. When `editable`: hover-revealed upload + remove
    buttons, click-to-upload, drag-and-drop; `FileReader` → data URI → `onUpload`.
    Image `onError` falls back to the glyph.
  - `EntityHeroTestId` enum wiring `data-testid` onto root, image, upload button,
    remove button, file input; tests select via `getByTestId`, assert roles/names.
  - No inline `style={{}}` on raw DOM in `apps/web`; DS component may use its own
    styling. Dynamic values (accent-interpolated gradients, computed height) go
    through the DS component's own `style`/CSS-var handling.
- `EntityHero.stories.tsx` — with image, without image (glyph fallback),
  editable, `contain` vs `cover`.
- Export from `libs/design-system/src/index.ts`.
- The size cap lives app-side: `onUpload` receives the data URI, the app rejects
  + toasts when it exceeds the cap (mirrors `ProjectBasicsPanel`).

Small avatars elsewhere **reuse `IconTile src`** (already image-with-glyph-
fallback). No separate `Avatar` primitive.

### 5. Web wiring

- **Cards**
  - `apps/web/features/agents/components/AgentCard.tsx` — pass
    `logoSrc={agent.avatar}` (HudCard already supports it).
  - `apps/web/features/pipelines/components/PipelineCard/PipelineCard.tsx` — add
    an `IconTile src={p.avatar}` header icon with `glyph="flow"` fallback.
- **Agent detail / edit**
  - `apps/web/features/agents/DetailScreen.tsx` — render `EntityHero` at the top
    (editable in edit mode, wired to the update mutation / form).
  - `apps/web/features/agents/components/AgentEditBasics.tsx` — the glyph picker
    stays as the **fallback-icon** picker; avatar editing happens via the hero.
  - `agentEditValues.ts`, `agentDraft.ts`, `NewAgentDialog.tsx` — carry `avatar`
    through the form ↔ entity mapping and the create draft (optional).
- **Pipeline detail / edit**
  - `apps/web/features/pipelines/Screen.tsx` — render `EntityHero` in the detail
    panel; editable → `useUpdatePipelineMutation`. Graph editor unchanged.
  - `apps/web/domain.ts` — add `avatar?: string` to the client `Pipeline`
    interface and include it when mapping from the contract.
- **Chat**
  - `apps/web/features/chat/components/TargetIdentity.tsx` and
    `ChatRunCard.tsx` — pass `src={target.avatar}` to `IconTile`.
- **Overview quick-launch**
  - `QuickLaunchPanel` `ResolvedPin` carries `avatar`; the pin `IconTile` passes
    `src`.

### 6. Verification

- `pnpm lint && pnpm typecheck && pnpm test` (fix all before done).
- Storage round-trip test (section 2).
- Drive the running app (`/verify` or `/run`): confirm avatars render on agent
  and pipeline cards, the detail heroes, and a chat dispatch identity; confirm
  glyph fallback still works for an entity without an avatar.
- `graphify update .` after code changes.

## Non-goals

- Pipelines do **not** gain a `glyph` field — the hard-coded `"flow"` stays as
  the fallback glyph.
- No changes to run modals / graph editor beyond showing the avatar.
- Test fixtures not seeded with avatars (round-trip test covers the field).

## Risks / watch-outs

- Adding an optional field to fixtures/contracts is additive, but check e2e/unit
  tests that assert exact agent/pipeline shapes.
- The pipeline UI consumes a **client-side `Pipeline` interface** in `domain.ts`
  distinct from the contract type — `avatar` must be added in both places.
- Data-URI size cap enforced app-side on upload; the `.max(280_000)` on the
  contract is the backstop.

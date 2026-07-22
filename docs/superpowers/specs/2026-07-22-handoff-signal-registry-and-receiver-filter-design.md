# Handoff signal registry + receiver-scoped target — design

**Date:** 2026-07-22
**Branch:** `feat/subsystem-handoff-ui` (continues the parked handoff-UI arc; NOT pushed, parked at PR gate)
**Predecessor:** `docs/superpowers/specs/2026-07-22-handoff-rule-inline-editor-design.md` (Phase 2b, the inline mad-libs editor)
**Workflow:** sonnet subagents implement per slice; Opus reviews the diff + commits verified-clean work with **raw `git`** (RTK masks pre-commit hook failures).

---

## Problem

Two operator notes on the shipped handoff-rule editor, both about the _model_, not cosmetics:

1. **Signal picker should be per-subsystem and extensible.** The per-subsystem scoping already exists (`signalKindsFor` in `apps/web/features/handoff/signalKinds.ts`), but the catalog is a hardcoded web-only list of 7 built-in kinds and offers no way to add a new signal. The operator wants to define new signals through a guided flow.
2. **Target should be only a subsystem that can actually _receive_ a handoff.** Today the target dropdown offers all 11 subsystems; targeting one that owns no pipeline/agent **hard-fails at dispatch** (`SubsystemEmptyRosterError`), not a no-op. The operator also floated multi-hop chaining (Loom audit → Sentinel security → Forge fix).

### Grounded reality (from codebase investigation)

- **`signalKind` is free-form `z.string().min(1)`** on both `HandoffSignalSchema` and `HandoffRuleSchema` (`libs/contracts/src/handoff/handoff.schema.ts`). The matcher is a literal compare (`rule.signalKind === "*" || rule.signalKind === signal.kind`, `handoff.service.ts`). **There is no server-side signal-kind registry** — kinds exist only implicitly in 4 producer services + the web catalog. A UI-invented signal string is inert until a producer service emits it.
- **Producers (hardcoded, 4):** sentinel→`cve`/`secret`, maestro→`post-merge-red`, loom→`god-node`/`community`/`cycle`, scout→`research-artifact`. The other 7 subsystems emit nothing.
- **Receiver mechanism is subsystem-agnostic:** a fired rule builds a generic task and hands it to `TaskSchedulerService.createTask(..., target)`. `resolveSubsystemTarget` requires the target subsystem to own ≥1 pipeline **or** ≥1 active agent, else it throws `SubsystemEmptyRosterError`. **Forge is the only seed receiver** (owns the delivery pipeline). All 4 seed rules target `forge`.
- **Multi-hop is not supported today:** a handoff terminates at first dispatch; a dispatched run does not re-enter `evaluate()` except the single Scout artifact-delivery path. True chaining needs (a) runnable receiver pipelines on those subsystems and (b) a re-emission hook on dispatched-run completion. **Out of scope** for this arc — noted as a separate future feature-arc.

---

## Locked decisions (operator, via AskUserQuestion)

1. **Target picker → filter to real receivers.** Multi-hop chaining deferred to a separate arc.
2. **Build a guided signal creator** — ZIBBY-native: collect the signal definition, register it as `pending`, and create a build task for Forge to write the emitting code. (Not a doc-only guide, not a bare registry row.)
3. **Signals live on a dedicated `/signals` segment** (not inline in the drawer). Standalone route with the standard grammar (list → detail → new). The drawer's signal picker links out to `/signals/new`.
4. **Auto-activation on:** `HandoffService.evaluate` marks a kind seen → `pending → active` on first real emission.

---

## Slot A — Receiver-scoped target (note 2) · web-only, small

In `HandoffRuleEditor`, restrict the **subsystem** target options to subsystems that own ≥1 pipeline **or** ≥1 agent — mirroring the server's `resolveSubsystemTarget`. Pipeline options are unaffected (a `{kind:"pipeline"}` target dispatches directly and is always valid).

- **Data (no new endpoint):** `HandoffRulesSection` already calls `useSubsystemsQuery()` + `usePipelinesQuery()`; add `useAgentsQuery()` (exists, returns `Agent[]` with `ownerSubsystem`). Compute `receiverIds = new Set([...pipelines, ...agents].map(x => x.ownerSubsystem).filter(Boolean))`. Pass either the filtered subsystem list or `receiverIds` to the editor.
- **Preserve-current guard:** when editing an existing rule whose target subsystem is not in `receiverIds` (stale rule, or roster changed since authoring), keep that option present + selected so the editor never silently drops the operator's stored target. Only _new_ selections are constrained to receivers.
- **Empty case:** if no subsystem qualifies and no pipeline exists, the target dropdown may be empty; `canSave` already gates on `target !== ""`. In practice Forge always owns the delivery pipeline.

No contract/api change. Purely `apps/web/features/handoff/`.

---

## Slot B — Guided signal creator + registry (note 1)

### B1 — Signal registry (contract + api store)

**Contract** (`libs/contracts/src/handoff/`): new `HandoffSignalKindSchema`

```ts
HandoffSignalKindSchema = z.object({
  id: z.string().min(1), // the slug matched in rules, e.g. "dependency-outdated"
  from: SubsystemIdSchema, // the PRODUCER subsystem that will emit it
  label: z.string().min(1), // human label (built-ins carry canonical English; web prefers i18n)
  description: z.string().min(1), // what it means / when it fires
  severityBearing: z.boolean(), // does this kind carry a severity?
  status: z.enum(["builtin", "pending", "active"]),
  system: z.boolean().optional(), // built-ins: true (view-only, non-deletable)
  buildTaskId: z.string().optional(), // link to the Forge build task that implements the emit
});
HandoffSignalKindInputSchema = HandoffSignalKindSchema.omit({ id, status, system, buildTaskId });
```

Server mints `id` from a slugified label (collision-resistant if taken), forces `status:"pending"`, `system:false`. `severityBearing` drives whether the rule editor's severity pill is meaningful for that kind (a non-severity signal shows "Jakákoli" fixed).

**Contract endpoints** — extend `handoffContract` (or a sibling `signalKindsContract` mounted alongside):

- `GET /api/handoff-signal-kinds` → `HandoffSignalKind[]` (built-ins merged with operator entries)
- `POST /api/handoff-signal-kinds` → 201 `{ signalKind, buildTaskId }` (create + spawn build task, see B3)
- `PATCH /api/handoff-signal-kinds/:id` → update operator entry (label/description/severityBearing/from); 403 on a `system` row
- `DELETE /api/handoff-signal-kinds/:id` → 403 on a `system` row (`SystemSignalKindError`), 404 unknown

**Store** (`apps/api/src/handoff/handoff-signal-kind.store.ts`) — mirror `HandoffRuleStore` exactly:

- Single JSON file via DI token `HANDOFF_SIGNAL_KINDS_FILE`, default `dataDir("handoff", "signal-kinds.json")` (runtime data dir, not committed).
- `SYSTEM_SIGNAL_KINDS` seed = the 7 built-ins (sentinel `cve`/`secret`, maestro `post-merge-red`, loom `god-node`/`community`/`cycle`, scout `research-artifact`), each `status:"builtin"`, `system:true`, `severityBearing` set correctly (`cve`/`secret`/`post-merge-red` = true; graph/research kinds = false — confirm against producer severity usage). **This becomes the server-side source of truth for the built-in set.**
- `onModuleInit → seedSystem` (fail-open: corrupt/missing file → rewrite defaults; valid file untouched). `list()` returns built-ins + operator entries (dedupe by id, built-ins win). CRUD with the same `system`-flag governance as rules (`create` forces system false; `update` preserves stored flag; `delete`/`update` of a system row → 403). Errors in `handoff-signal-kind.errors.ts`. Wire as a module-internal provider; export via `HandoffService` or a thin `SignalKindService`.

### B2 — Web reads the registry

- New `useSignalKindsQuery()` (`apps/web/features/handoff/queries/`) → `HandoffSignalKind[]`, `select: selectApiResponseBody`, `getSignalKindsQueryKey()`.
- `HandoffRuleEditor` signal picker: scope to `sk.from === fromSubsystemId`, plus the `*` (any) option. Show a **"čeká na producenta"** badge on `status:"pending"` options.
- **Label localization:** built-in kinds (`status:"builtin"` / `isKnownSignalKind(id)`) render via `t(\`signalKind.${id}\`)` + `t(\`signalKindDesc.${id}\`)`(keep existing cs/en keys); operator kinds render their stored`label`/`description` verbatim (operator writes one language — no forced bilingual input).
- `signalKinds.ts` shrinks to the i18n/type helpers: keep `SignalKind` union + `isKnownSignalKind` (built-in discriminator for label lookup). Per-subsystem scoping now comes from the query's `from` field, so `SUBSYSTEM_SIGNAL_KINDS`/`signalKindsFor` are removed (their scoping role moves to the registry; the server seed holds the from-mapping).
- `HandoffRuleRow` friendly-label lookup unchanged in shape (built-in → `t()`, else the row already shows the raw/stored label).

### B3 — `/signals` dashboard segment (guided creator)

A new dashboard segment mirroring the `gates`/`agents` grammar (edit is top-right, card-click → detail, dialogs only for confirm):

- **`/signals`** — list of all signal kinds grouped by producer subsystem; each row/card shows label, kind slug, status badge (builtin / pending / active), and producer. "Nový signál" affordance top-right → `/signals/new`. Card-click → `/signals/[id]`.
- **`/signals/new`** — the guided creator form (standalone page, so no drawer clipping and the producer is operator-chosen):
  - Fields: **producent** (subsystem select — all subsystems, since the point is extending who emits), **label**, **slug** (auto-derived from label, editable), **„kdy se spustí"** (trigger), **popis**, **„nese závažnost"** toggle.
  - Submit → `POST /api/handoff-signal-kinds`. The endpoint (or the web mutation via a follow-up call) also creates the **build task** (B3 task, below). On success: toast "Signál zaregistrován, build task #id založen", navigate to `/signals` (or the new detail).
- **`/signals/[id]`** — detail: the signal, its status, linked build task (link to the run/task), and the rules referencing it. Operator entries are editable (edit top-right, `PATCH`) and deletable; built-in entries are view-only (system).
- **Nav:** add a `signals` entry to `NAV_ITEMS`/`DOCK_IDS` alongside gates/hooks/commands, and route wiring in `AppShell` active-nav derivation.
- **Drawer link-out:** the `HandoffRuleEditor` signal picker gains a "+ nový signál" affordance that navigates to `/signals/new?from=<drawerSubsystemId>` (pre-fills the producer). After creating, the operator returns to the drawer; the picker re-reads the registry and the new kind is available.

**Build task generation (the ZIBBY-native step):** on signal create, spawn a normal task targeting Forge:

```ts
createTask({
  body: {
    title: `Implementuj producenta signálu "${slug}"`,
    text:
      `Subsystém **${producent}** má nově emitovat handoff signál \`${slug}\`.\n` +
      `Podmínka (kdy): ${trigger}\n` +
      `Popis: ${description}\n\n` +
      `Implementuj to tak, že v producentské službě subsystému ${producent} po detekci zavoláš ` +
      `\`HandoffService.evaluate({ from: "${producent}", kind: "${slug}"` +
      (severityBearing ? `, severity: <low|moderate|high|critical> ` : ``) +
      `, ... })\`. ` +
      `Signál je zaregistrovaný jako "pending" a sám se přepne na "active", jakmile emit poprvé proběhne.`,
    target: { kind: "subsystem", id: "forge" },
  },
});
```

(No `projectId` — `CreateTaskInput` doesn't accept it; attribution is server-derived per Law 4.) The returned task id is stored as `buildTaskId` on the signal. Creating this task is operator-initiated (the operator explicitly asked to build) and surfaced via the toast + the detail-page link.

### B4 — Auto-activation

`HandoffService.evaluate(signal)` calls `signalKindStore.markSeen(signal.kind)` (best-effort, fail-open): if a `pending` operator kind matches `signal.kind`, flip it to `active` and persist. This is the truthful signal-of-life — the "čeká na producenta" badge disappears on its own once Forge's build task lands and the producer starts emitting. Built-in kinds are already `builtin` and unaffected. No-op for unknown/`*`.

---

## Out of scope (explicit)

- **Multi-hop chaining** (Loom → Sentinel → Forge). Needs runnable receiver pipelines on scanner subsystems + a re-emission hook on dispatched-run completion. Separate future arc; noted so it isn't silently assumed here.
- **First-class producer/receiver capability metadata on the subsystem registry.** This arc infers capability from `ownerSubsystem` tags (Slot A) and the signal `from` field (Slot B); a declarative capability field is a possible later cleanup.

---

## Testing

- **contracts:** `HandoffSignalKindSchema`/input parse tests (id-omit on input, status/system stripped).
- **api store:** seed-on-missing/corrupt, `list()` merges built-ins + operator, `create` mints pending+system:false, `update` preserves system, `delete`/`update` of system row → 403, `markSeen` flips pending→active and is a no-op otherwise.
- **api e2e:** GET returns built-ins + created; POST returns `{signalKind, buildTaskId}` and the build task exists targeting forge; `health.e2e` (full AppModule boot) stays green (DI-cycle oracle).
- **web:** `useSignalKindsQuery`; editor picker filters by `from` + shows pending badge + `*`; **target filter** (non-receiver subsystem absent, receiver present, pipelines present, stale current-target preserved); `/signals` list groups by producer + status badges; `/signals/new` submit calls create + shows toast + navigates; built-in view-only vs operator editable.
- **i18n:** cs+en parity for new keys (`signals.*`, badge labels, form fields, nav item). Data modules hold keys; `apps/web` not in the vitest workspace (parity test under `--project web`).
- **self-knowledge:** adding web components/routes drifts the graph → `graphify update .` FIRST, then `pnpm self-knowledge:generate`, then `pnpm check:self-knowledge` before committing (own chore commit if the tracked note changes).

---

## Implementation slices (dependency order, each commit compiles)

1. **A — receiver-scoped target** (web-only; independent, ship first).
2. **B1 — contract + store + endpoints** (server; built-ins seeded server-side).
3. **B2 — web query + editor picker reads registry** (depends on B1; trims `signalKinds.ts`).
4. **B3 — `/signals` segment + creator + build-task wiring + drawer link-out** (depends on B1/B2).
5. **B4 — `markSeen` auto-activation** (small; depends on B1).

Docs: update `docs/web/overview.md` (new segment) + `docs/api/subsystems.md`/handoff docs + docs-sync manifest if a new module/dir is added.

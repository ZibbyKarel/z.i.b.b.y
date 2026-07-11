# Phase 118 — CommandLine: split the generic composer from its task-launch container

> Operator ask (2026-07-11): `CommandLine`'s `sendMode` prop is an antipattern. A composer
> should receive an `onSubmit` and not care what happens after it. Extract **one generic
> `CommandLine`** (owns only the draft — text, `@`-mention target, attachments, highlights) and
> push the task-launch behaviour into a **container** (`TaskCommandLine`). Consumers that only
> "send" a composed prompt (chat, automations) use the generic component directly.
>
> Web-only (`apps/web`). No contract/API change.

---

## The problem (verified)

`CommandLine` decides its *entire behaviour* from **which host** mounts it:

- `const sendMode = onSubmit !== undefined` (L450) — the mode is derived from a callback's
  presence, then branches the trailing control (plain **Send** vs the schedule split-button) and
  the dispatch strategy.
- `dispatch()` (L669–692) is forked: `if (onSubmit) { … reset self … }` **else** `{ buildAck; handleSubmit }` — two unrelated responsibilities in one function.

Same-shaped leaks of caller concerns into the primitive (all to be relocated to the container):

1. **`useTaskSubmit` + scheduling + `ScheduledConfirmation` + `useLimitsQuery` + `now` + `paths` + `composedText`** — the whole "no-onSubmit" default path *is* a task container baked into the primitive.
2. **Loop** — `isLoop`/`loop`/`canSubmitLoop`; the three-way `canRun` (L631–633).
3. **Ack** — `showAck` + `buildAck` + `AckInfo` + `ack` state + the ack row (L1231–1250); reaches into `target`/`isLoop`/`title`/`loop`.
4. **Scheduling split-button** — `DropDownButton`/`menuItems`/`run(preset)`/`scheduledWhen`.
5. **`showAttach` capability toggle** — the doc comment claims "chat passes `false`", but `ChatScreen` now passes `showAttach` (true): the boolean already drifted.
6. **`submitLabel`** patches over two divergent modes ("Label only — action still whatever the mode dictates").
7. **Project selector** — `ProjectSelect` + `taskProjectId` + `initialProjectId` + `onProjectChange`; feeds `paths` → `useTaskSubmit` (task concern), yet renders unconditionally, so chat/automations show a picker that does nothing.
8. **Inverted state ownership** — `NewTaskDialog`'s own comment: "text/target/taskProjectId below are **MIRRORS** of CommandLine's own internal … submitted inside CommandLine via useTaskSubmit." The dialog mirrors internal state back up (`onTextChange`/`onTargetChange`/`onProjectChange`) only for its preview. This is why there are 8 "mirror-up" callbacks.
9. **Nexus symptoms** — ~30 props; the `@deprecated TargetChip` testid kept alive purely so out-of-scope consumers keep compiling (L69–80).

---

## Verified consumer map

| Consumer | Mode today | Props of note | Target |
|---|---|---|---|
| `features/overview/Screen.tsx` L129 | task-launch | `chrome showAck suggestions` | **→ `TaskCommandLine`** |
| `features/tasks/components/NewTaskDialog.tsx` L173 | task-launch | `isLoop loop output toolGrants context initialTarget initialText rows onClose` + mirror callbacks | **→ `TaskCommandLine`** |
| `features/chat/components/ChatScreen.tsx` L595 | send-delegation | `onSubmit={send}` `showAttach` `chrome={false}` `label` `placeholder` `onDraftChange` | **generic `CommandLine`** (unchanged call, cleaner component) |
| `features/automations/components/AutomationFormDialog.tsx` L88 + `automations/DetailScreen.tsx` L168 | send-delegation | `onSubmit={save}` `submitLabel="Naplánovat"` `chrome={false}` seeded `initialText`/`initialTarget` | **generic `CommandLine`** |

`send` (ChatScreen L200) and the automations `save` already match the target `onSubmit(text, target?, attachments?)` signature — so send-delegation consumers need **no wrapper**; the generic composer + `onSubmit` *is* their command line. Only task-launch earns a dedicated container.

---

## Target architecture

```
CommandLine                 ← GENERIC composer. Owns ONLY the draft:
  (features/tasks/            text, @-mention picker (+ injectedTarget), attachments (opt),
   components/CommandLine/)    highlights, suggestions, chrome. Fires onSubmit(text,target?,attachments?).
                              Exposes slots: leadingActions?, renderTrailing?({canSubmit,submit}).
   │
   └─ TaskCommandLine        ← CONTAINER (new, beside CommandLine). Owns everything task-launch:
      (…/CommandLine/           useTaskSubmit, schedule split-button (via renderTrailing),
       TaskCommandLine.tsx)     ProjectSelect (via leadingActions), ack row, ScheduledConfirmation,
                                loop, context/output/toolGrants/title, onLaunched/onClose.
                                Renders <CommandLine …/> and wraps it with the ack/confirmation.

chat & automations           ← use <CommandLine onSubmit=… submitLabel=… /> directly.
```

### Generic `CommandLine` — final contract

**Kept props (generic):** `rows`, `maxRows`, `placeholder`, `label`, `initialText`, `initialTarget`,
`disabled`, `chrome`, `suggestions`, `showAttach`, `submitLabel`, `injectedTarget`,
`onInjectedTargetConsumed`, `onTextChange`, `onTargetChange`, `onAttachmentsChange`, `onDraftChange`.

**New props:**
- `onSubmit(text: string, target?: TaskTarget, attachments?: TaskAttachmentSet): void` — **required** after the strip (118d). Fired by Enter (no Shift) or the trailing control's `submit()`. `text` is the composed text (context already folded when the caller passed a `context`-less generic — chat/automations read the args directly). After it returns the composer resets its own draft unless `resetOnSubmit={false}`.
- `resetOnSubmit?: boolean` (default `true`) — clears text/target/attachments after `onSubmit`. Chat/automations keep the default (today's send-mode reset); `TaskCommandLine` passes `false` (task navigates/confirms, and its ack needs the just-submitted text to survive).
- `leadingActions?: ReactNode` — extra controls rendered beside the attach `+` (bottom-left row). `TaskCommandLine` injects `<ProjectSelect>` here **from 118d** (until then it uses the generic's still-present built-in selector via `initialProjectId`/`onProjectChange`).
- `renderTrailing?(api: { canSubmit: boolean; submit: () => void }): ReactNode` — overrides the default bottom-right control. `submit()` runs the generic's own submit path (fires `onSubmit`, then reset). Default (when omitted) = the existing **Send** `Button` (`CommandLineTestId.Send`, label = `submitLabel ?? t("commandLine.send")`). `TaskCommandLine`'s split-button ignores `submit`/`canSubmit` and instead calls its **own** render-configured `handleSubmit(scheduledAt)` directly (see below), so scheduling and empty-text loops work without the generic knowing about either.

**Removed props (→ `TaskCommandLine`):** `title`, `output`, `toolGrants`, `context`, `isLoop`,
`loop`, `showAck`, `onLaunched`, `onClose`, `initialProjectId`, `onProjectChange`. Also removed:
the derived `sendMode`, `buildAck`/`AckInfo`/`ack`, the `DropDownButton` schedule menu/`run`/
`scheduledWhen`/`ScheduledConfirmation`, `useTaskSubmit`/`useLimitsQuery`/`useProjectsQuery`/`now`/
`paths`/`composedText`, and the `@deprecated TargetChip` enum member (if no live consumer remains).

**`useTaskSubmit` stays render-configured and UNCHANGED.** Instead of restructuring the hook, the
container treats the generic `CommandLine` as a rich input that (a) *emits* its draft via the
existing `onTextChange`/`onTargetChange`/`onAttachmentsChange`/`onProjectChange` callbacks and (b)
*signals* a submit via `onSubmit`. `TaskCommandLine` mirrors that emitted draft into its own state,
feeds it to `useTaskSubmit` at render (exactly as today's `CommandLine`), and dispatches from that
mirror — so scheduling, empty-text loops, and context-folding all work with zero hook change.

### `TaskCommandLine` — responsibilities

A faithful relocation of today's task half of `CommandLine`:
- **Mirrors the draft**: local `draftText`/`draftTarget`/`draftAttachments`/`taskProjectId`, each set
  in a wrapped `onXChange` that *also* forwards to the same-named prop (so `NewTaskDialog`'s classify
  preview keeps receiving `onTextChange`/`onTargetChange`/`onProjectChange` — unchanged).
- Owns `useProjectsQuery`, `selectedProject`, `composedText` (folds `context`), `paths`
  (`extractPaths(draftText)` + `selectedProject?.path`), `useLimitsQuery`/`resetsAt`/`now`,
  `scheduledWhen`, and `useTaskSubmit({ …, composedText, paths, chosenTarget: draftTarget, text: draftText, attachmentSetId, isLoop, loop, title, output, toolGrants, onLaunched, onClose, setScheduledWhen })`.
- Renders `<CommandLine … onSubmit={() => handleSubmit(null)} resetOnSubmit={false} renderTrailing={splitButton} initialProjectId onProjectChange={wrapped} />`.
  - `onSubmit` is the **Enter/default trigger** → immediate `handleSubmit(null)`; its args are ignored
    (the mirror is the source of truth). `resetOnSubmit={false}` keeps the input intact.
  - `renderTrailing` = the schedule split-button (single task) or "Run loop" split-button (loop); each
    primary click / menu item calls `handleSubmit(null)` / `handleSubmit(resolveScheduledAt(…))`
    **directly**. The button's `disabled` is computed here from the mirror
    (`isLoop ? !canSubmitLoop(loop) : draftText.trim().length <= 2`) + `busy`.
- Renders the **ack row** (its own `showAck` prop; built from the mirror captured at dispatch time)
  and short-circuits to `<ScheduledConfirmation>` when `scheduledWhen !== null`.
- **Project selector**: through 118c uses the generic's still-present built-in `<ProjectSelect>` via
  `initialProjectId`/`onProjectChange`; in 118d (generic loses it) renders `<ProjectSelect>` in
  `leadingActions` and owns `taskProjectId` outright.

---

## Decisions (locked)

1. **No thin `ChatCommandLine`/`AutomationCommandLine` wrappers.** They would be zero-logic
   pass-throughs; chat/automations call the generic component directly. (The task container is the
   only one carrying real behaviour.)
2. **Generic component stays at `features/tasks/components/CommandLine/CommandLine.tsx`** to avoid
   cross-feature import churn. A later move to a neutral `apps/web/components/` home is out of scope.
3. **Project selector becomes task-only** — it leaves chat & automations (where it did nothing).
   This is an intended UX change; tests must assert it is **absent** in chat/automations mounts.
4. **`TaskCommandLine` lives beside `CommandLine`** (`…/CommandLine/TaskCommandLine.tsx`), re-exported
   from `features/tasks/index.ts`.
5. **Test-ids:** send-delegation keeps the default `CommandLineTestId.Send`. The task schedule
   control keeps whatever id the overview/NewTaskDialog tests currently select (preserve, don't rename).

---

## Sub-phases (each compiles + tests green on its own)

- **118a — Generic seam (additive).** Add `leadingActions` + `renderTrailing` slots and route
  Enter/click through a single internal `submit()` that calls `onSubmit`. Keep the existing
  task path working (no removals yet). No consumer changes. Existing tests stay green. *(wave 1)*
- **118b — Create `TaskCommandLine` (not yet wired).** Add the `resetOnSubmit` prop to the generic
  (additive), then build the container reproducing task-launch on top of the 118a slots (+ its own
  unit test). Not imported by any screen yet. *(after 118a)*
- **118c — Swap task consumers.** Point `overview/Screen.tsx` + `NewTaskDialog.tsx` at
  `TaskCommandLine`; update their tests. *(after 118b)*
- **118d — Strip the primitive.** Delete all task-launch code + `sendMode` from `CommandLine`; make
  `onSubmit` required; drop the dead props and the `TargetChip` enum member (if unreferenced). Trim
  `CommandLine.test.tsx` to composer-only assertions. This is where the antipattern dies. *(after 118c)*
- **118e — Final sweep.** i18n parity (`cs`/`en`), docs, `graphify update .` + self-knowledge
  refresh, `pnpm check:lint && pnpm check:types && pnpm test` green repo-wide. *(last)*

Each phase: a **sonnet** subagent implements the sub-phase → I advise + code-review (return for
rework if needed) → commit → mark done here.

## Verification per phase

`pnpm check:lint && pnpm check:types && pnpm test` green for the touched projects before a phase is
done. Manual smoke after 118c: `/overview` command bar launches + shows ack; `/chat` sends; the
automations create/edit dialog schedules.

## Test touch points

`CommandLine.test.tsx` (split composer vs task assertions — task ones move to a new
`TaskCommandLine.test.tsx`), `NewTaskDialog.test.tsx`, `overview/Screen.test.tsx`,
`ChatScreen.test.tsx`, `automations/Screen.test.tsx`, `automations/DetailScreen.test.tsx`. New:
`TaskCommandLine.test.tsx`. Assert project selector **absent** in chat/automations.

## Sequencing & commits

Branch `refactor/commandline-composer-split` off `main`. One commit per sub-phase:
`refactor(tasks): <sub-phase summary>`. Tick the status table each time.

## Status

| Phase | Status | Commit |
|---|---|---|
| plan | done | (this file) |
| 118a | done | (seam: `leadingActions` + `renderTrailing` slots, additive) |
| 118b | done | (`TaskCommandLine` container + `resetOnSubmit`; not yet wired) |
| 118c | done | (overview + NewTaskDialog → `TaskCommandLine`; 151+211 tests green) |
| 118d | done | (`sendMode` + task-launch stripped from generic; props 30→21, ids 17→13; 346 tests green) |
| 118e | pending | |

---

## Appendix — system-wide antipattern sweep prompt

Paste this to a fresh agent to catalogue the *same class* of smell elsewhere. It only reports; it
changes nothing.

```
Audit apps/web + libs/design-system for the "component knows about its callers" antipattern —
the class we just fixed in CommandLine (a `sendMode = onSubmit !== undefined` that forked a
component's whole behaviour by which host mounted it).

MANDATORY: graphify-out/graph.json exists — run `graphify query "<question>"` to orient before
grepping/reading source. Only read raw files after graphify has scoped you.

Flag each occurrence of these smells (report only — do NOT edit code):
1. A rendering behaviour or dispatch strategy derived from the *presence* of a prop/callback
   (`const xMode = someProp !== undefined`, `if (onFoo) {…} else {…}` doing unrelated things).
2. A boolean "capability toggle" prop that silently disables a built-in feature depending on the
   host (e.g. `showX` whose doc comment names a specific caller).
3. Props passed straight through, unused for rendering, purely to forward into a domain hook
   (payload leakage — the component is secretly a container).
4. "Mirror-up" callback clusters (`onXChange` for internal state the parent re-derives) — a sign of
   inverted state ownership: the parent should own that state and pass it down.
5. A single prop documented as patching over two divergent modes ("label only — action still
   whatever the mode dictates").
6. `@deprecated` enum members / props kept alive only so out-of-scope consumers keep compiling.
7. God-components: >20 props, or one component imported by 3+ unrelated features while owning
   domain logic (data hooks, mutations) rather than delegating via callbacks.

For each finding record: file:line, which smell (1–7), a one-line why, the blast radius (who
consumes it), and a one-line suggested seam (extract generic + container / lift state / add slot).
Rank by blast radius × entanglement.

Write the report to docs/audits/component-antipatterns-<date>.md (create docs/audits/ if needed),
grouped by smell, most severe first, with a short summary table at the top. Do not modify any
source file. End with a shortlist of the top 5 worth a dedicated refactor phase.
```

# ZibbyCorp — roadmap (night-run executable)

> **REVISED 2026-09-24 (night-run kickoff): D-012 … D-015 override this file.** They are at
> the end of `DECISIONS.md`.
>
> - **One branch:** `feat/zibbycorp`.
> - **Real data is migrated.**
> - **New Part E (Employees)** comes right after Part 0.
> - **Order:** Part 0 → Part E → Part A → Part B (without chains) → Part C (ZB-04a,
>   ZB-05a, ZB-05b — chains + parent tasks).
> - **Status of truth:** `PROGRESS.md`.


**Goal:** rebuild ZIBBY so that its function reads as a company.

- The operator is the **CEO**.
- ZIBBY's root is the **COO**.
- 11 **departments** own **employees** (agents) and **pipelines**.
- Work crosses departments via **chains** and moves within a department via **pipelines**.
- The whole UI is re-skinned to the ZibbyCorp design system and composed **only** from DS
  components.

**Read first, in order:**
1. `PROGRESS.md` — where we are.
2. `DECISIONS.md` — binding.
3. `OPEN-QUESTIONS.md` — defaults.
4. `ROUTE-MAP.md`
5. The part file for the current part: `PART-0.md` / `PART-A.md` / `PART-B.md`.

Recon lives in `recon/`; read `recon/README.md` for the overrides.

**Design source:** `design/ZibbyCorp/`. To serve it for design-match:

```bash
cd design/ZibbyCorp && python3 -m http.server 8765
```

Canon: `ZibbyCorp Design System.md` (tokens, type, motion, component anatomy) and
`zc-data.js` (mock model).

---

## Parts and execution order

| Part | Branch (D-006) | Phases | "Hned" (can be rewritten now) | Depends on open questions |
|---|---|---|---|---|
| **0 — Departments** | `feat/zc-0-departments` | ZC-00 … ZC-06 | Everything. The rename and migration are fully specified by D-004 and D-008. | none |
| **A — Design system and visuals** | `feat/zc-a-design-system` | ZA-01 … ZA-08 | Everything. The tokens, primitives, new components, shell components and lint wall are all specified by the design doc. | O-01 (default applied), O-04 (pure fn) |
| **B — IA, pages, logic, settings, chains** | `feat/zc-b-ia` | ZB-01 … ZB-14 | The route skeleton, shell, ORG, People, WORK re-homes, Activity, Policy, Knowledge, System registries, chains backend (D-005), cleanup. | O-05, O-06, O-09, O-13, O-14, O-17, O-20, O-23, O-27 (defaults applied, 🟨/🟥 flagged in the report) |

**Nights:** night 1 = Part 0, night 2 = Part A, nights 3–4 = Part B. Part B is ~14 phases,
so it may take two nights; resume from `PROGRESS.md`.

### Wave plan

Phases in the same wave touch **disjoint file sets** and may run as parallel subagents.
Phases in different waves run sequentially.

```
PART 0   W0: ZC-00 (bootstrap)
         W1: ZC-01 (contracts)                          ← everything depends on it
         W2: ZC-02 (api)  ∥  ZC-03 (migration script + fixture)
         W3: ZC-04 (web rename)
         W4: ZC-05 (docs, self-knowledge, grep gate)
         W5: ZC-06 (full validation → park)

PART A   W1: ZA-01 (tokens, fonts, theme provider)
         W2: ZA-02 (primitive restyle)  ∥  ZA-03 (AgentGlyph + state vocabulary)
         W3: ZA-04 (data components)  ∥  ZA-05 (overlay/nav components)
         W4: ZA-06 (shell components + Splash)
         W5: ZA-07 (lint wall + migrate 20 className files)
         W6: ZA-08 (full validation, Storybook visual pass → park)

PART B   W1: ZB-01 (route group, shell, redirects, light default)
         W2: ZB-02 (ORG map)  ∥  ZB-04a (tasks backend: parent/source/department stamp)
         W3: ZB-03 (department detail + People)  ∥  ZB-05a (chains backend)
         W4: ZB-04b (Tasks UI)  ∥  ZB-06 (Goals/Companies/Teams/Projects)  ∥  ZB-07 (Activity)
         W5: ZB-05b (Chains UI)  ∥  ZB-08 (Policy)  ∥  ZB-09 (Knowledge)
         W6: ZB-10 (Ledger)  ∥  ZB-11 (System settings + registries)
         W7: ZB-12 (⌘K palette + COO dock + voice)
         W8: ZB-13 (delete immersive/HUD/old routes, knip, orphan i18n)
         W9: ZB-14 (full validation, live-browser + design-match sweep → park)
```

---

## The night-run loop (per phase)

This is the repo's proven process (recon/04). Deviating from it has cost past arcs.

1. The **orchestrator** is Opus. It reads the phase section and writes a subagent brief
   containing:
   - exact paths;
   - invariants;
   - the Definition of Done;
   - "do NOT commit".
2. The **implementer** is a Sonnet subagent.
   - It works only on the phase's listed paths.
   - It runs incremental validation per file (`pnpm exec prettier --write`,
     `pnpm exec eslint --fix`, and the related vitest file).
3. The orchestrator **reviews** the diff against the phase DoD and invariants.
   - If it finds a problem, it sends a fix-up to the same subagent (SendMessage).
   - It allows at most 3 review rounds, then parks the phase.
4. The orchestrator **validates**:
   - `tsc -p` for the touched projects, reading `$?` and not rtk's text;
   - the related tests;
   - for UI phases, a live browser check at 1440 px and 390 px in both themes, plus a
     design-match against the listed mockup (≤5 rounds; park on thrash).
5. The orchestrator **commits** one conventional commit per (sub)phase, staging only that
   phase's paths. The message ends with the session attribution lines.
6. It **updates `PROGRESS.md` immediately**: status, commit sha, defaults applied, and
   follow-ups found.
7. **Park rule:** if a phase cannot go green in 3 rounds:
   - revert its working-tree changes (`git restore` on its paths only);
   - mark it ⛔ in PROGRESS with the failure text;
   - continue with the next phase that does not depend on it.
   - Never weaken a test, gate, lint rule or law to go green.

**Pre-commit gates** (from `.githooks/pre-commit`):
- lint-staged;
- incremental tsc;
- `pnpm check:self-knowledge`;
- `pnpm check:docs-sync`.

When a phase adds or renames an API module, it must update `tools/docs-sync/manifest.mjs`
and `docs/api/*` in the same commit. After any code move, run `graphify update .` and then
regenerate self-knowledge. The HTML-viz step of `graphify update .` fails at this repo's
size, but the AST step completes, and that is enough.

**Known pre-existing reds** (do not chase them; compare against the ZC-00 baseline):
- `pipelines.e2e` ×2;
- `runner-core.test.ts`;
- the Playwright memory-graph and pipeline-run specs.

---

## Hard invariants (every phase)

- **I-1 Laws.** Never touch or weaken:
  - `POLICY.md`, the approval floor, `HIGH_RISK_TYPES`;
  - the PR-is-the-gate rule, the no-auto-merge rule, the inbound-is-data rule.
- **I-2 DS-first.** `apps/web` contains no `className`, no `style` (except the sanctioned
  SVG escape), no Tailwind utility string, no `clsx`/`cva`/`tailwind-merge`, and no new
  `.css`. When a UI need has no DS component, **add it to the DS** in the same part.
  - In Part B, a missing DS component is added in a separate commit
    (`feat(ds): …`) that comes before the screen commit.
- **I-3 DS conventions** (`.claude/skills/design-system/SKILL.md`):
  - sealed sizing props (no raw px);
  - no `className` prop;
  - CVA inside the DS only;
  - a `<Component>TestId` enum, with tests via `getByTestId`;
  - stories are exactly Overview + Playground;
  - React 19 ref-as-prop, never `forwardRef`;
  - no `any`.
- **I-4 Contract-first.** Any API change goes into `libs/contracts` first, via ts-rest and
  Zod, with no codegen. Additive fields are `.optional()`.
  - Mind the Zod 4 trap: `.partial()` does not cancel `.default()`.
- **I-5 One interaction grammar.**
  - Edit is top-right.
  - A card click navigates to a detail page.
  - Dialogs are only for create and confirm; the approval *sheet* is a side sheet, not a
    dialog.
  - Nothing interactive is unlabeled.
- **I-6 Names.** After Part 0, this command must print nothing:

  ```bash
  git grep -nIiE '\b(forge|puls|sentinel|maestro|beacon|scout|herald|loom|codex|hearth)\b|subsystem' -- apps libs tools ':!tools/migrate/**' ':!libs/contracts/src/departments/legacy.ts'
  ```

  "ledger" is excluded because it is also a generic word (`budget-ledger`). Instead,
  `ZC-05` checks `'ledger'` as a *department id* in contracts and web.
- **I-7 Data safety.** D-008. Never mutate `apps/api/data-test` except via the ZC-03
  migration commit. Every test that creates an agent, pipeline or integration supplies a
  `department`.
- **I-8 i18n.** Every user-visible string goes through next-intl, in both `cs` and `en`. The
  DS takes English defaults via props.
- **I-9 Queries.** One hook per file under `features/<domain>/{queries,mutations}`.
  - Queries use `select: selectApiResponseBody` and export `getXxxQueryKey`.
  - Mutations are returned directly.
  - SSE is used for streams; only health and limits poll.
- **I-10 Scope.** A phase does not touch files outside its list. If it must, it records why
  in PROGRESS.

## Definition of Done for the whole arc

- The three branches are parked at the PR gate with green CI-equivalent local runs:
  - `pnpm check:lint`, `pnpm check:types`, `pnpm test`, `pnpm e2e`;
  - `pnpm check:deps`, `pnpm check:docs-sync`, `pnpm check:self-knowledge`;
  - the only reds are the known pre-existing ones.
- The I-6 grep is empty.
- `git grep -n 'className=' apps/web` is empty.
- Every route in `ROUTE-MAP.md` § 1 renders, and every redirect in § 2 resolves.
- Each screen passes a design-match (or is parked with a screenshot diff and a reason).
- `migration-dry-run.md` exists for the operator's real data.
- `PROGRESS.md` ends with a butler's briefing:
  - what landed;
  - which defaults were applied (🟥/🟨 first);
  - what needs the operator: the three PRs, the migration `--apply`, and the open
    questions.

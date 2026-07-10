# Phase 116f — Settings per-system-automation descriptions

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`.

## Goal
On Settings → Automations, each system-automation row shows a one-line description of what that
automation actually does, so the operator understands the seeded set without reading code.

## Approach
Key the description by `target.type` (each system automation has a distinct target type). Render it
inside `SystemAutomationRow` (below the name/schedule line, above the divider), muted/secondary.

## Changes

### 1. i18n — `apps/web/i18n/messages/{en,cs}.json`
Add under `settings.automations`:
```jsonc
"desc": {
  "briefing":        "…",
  "memory-distill":  "…",
  "pattern-extract": "…",
  "gap-detect":      "…",
  "agent-factory":   "…"
}
```
Copy (final):

| key | CS | EN |
|---|---|---|
| `briefing` | Sestaví ranní briefing z aktivit, běhů a paměti a doručí ho do sekce Tasky. | Assembles the morning briefing from activity, runs and memory, delivered to Tasks. |
| `memory-distill` | Noční průchod dokončenými běhy — levný model vydestiluje trvalé poznatky do vaultu. | Nightly pass over finished runs; a cheap model distils durable learnings into the vault. |
| `pattern-extract` | Prohledá 30 dní schvalovacích rozhodnutí a navrhne pravidla do vaultu pro briefing. | Scans 30 days of approval decisions and drafts rule proposals into the vault for the briefing. |
| `gap-detect` | Sleduje opakovaně vytvářené ruční tasky a navrhuje, co by šlo automatizovat. | Watches repeatedly created manual tasks and suggests what could be automated. |
| `agent-factory` | Sleduje opakované orchestrator-fallback běhy a navrhne chybějícího specialistu (čeká na schválení). | Watches repeated orchestrator-fallback runs and proposes a missing specialist agent (pending approval). |

### 2. `apps/web/features/settings/components/SystemAutomationRow.tsx`
- Add a `description?: string` prop (the resolved copy). Render it as a `Typography` (secondary,
  `size="caption"`/`2xs`, `leading="snug"`) between the header row and the `Divider`. Only render
  when present. Add a testid `Description = "system-automation-row-desc"` to the enum.

### 3. `apps/web/features/settings/components/AutomationsSection.tsx`
- Build the description from `t("automations.desc.<target.type>")` guarded so an unknown target
  type renders no description (use `t.has(...)` or a known-key allowlist — do NOT let next-intl
  throw on a missing key). Pass it into `SystemAutomationRow`.

### 4. Tests
- Update `AutomationsSection.test.tsx` / `SystemAutomationRow.test.tsx`: assert the description text
  renders for a seeded automation (select via the new testid).

## Verify
`pnpm check:types && pnpm web:test` (settings suites green).

## Notes
Independent of the backend seeding — the description map is keyed by target type, so it renders for
whatever system automations are present. Safe to run in parallel with 116a/116c.

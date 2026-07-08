# Phase 88 — Drawer tab: Artefakty (what it produces, who it hands off to)

> Design doc: "Artefakty — what this subsystem produces and who it hands off to." The doc
> scoped but did not mock this tab (deferred visuals) — keep it structural and honest, no
> speculative chrome. The N2 artifact registry exists; pipeline `outputs[]`
> (pr | file→project/vault) already encode the handoff sinks.

## 1 — Two sections, both derived (no new entity)

`.../SubsystemDrawer/ArtefaktyTab.tsx` (+ test):

- **Produkuje (static promise)**: derived from the owned pipelines' `outputs[]` — e.g. Loom/
  code-audit → "report → vault note"; Forge/delivery → "PR na review". Render one line per
  output sink with its type (PR / soubor → projekt / poznámka → vault) and, where the phase-N2
  chain wiring names a consumer, the receiving side ("předává: Forge"). If chain wiring is the
  only place a handoff target exists, derive from chains whose steps consume this subsystem's
  pipeline artifact; if no consumer is derivable, show "→ operátor" (the honest default).
- **Vyrobené artefakty (history)**: recent artifacts from the N2 artifact registry filtered to
  runs of owned pipelines (same run→pipeline→owner mapping as phase 86; reuse, don't
  re-derive — if phase 86 added an endpoint filter, extend the artifacts list endpoint the
  same way, else filter client-side). Each row: artifact kind, name/link (PR URL opens GitHub;
  vault/file artifacts link to their existing detail surface), run link, timestamp. Cap ~20.

## Tests

- Static section: fixture pipeline with `pr` + `file(vault)` outputs renders both lines with
  correct sink labels; no outputs → honest empty state.
- History: mixed-owner artifact fixture filters to owned only; PR artifact renders external
  link with `rel="noreferrer"`.
- Empty subsystem (no pipelines): single combined empty state, translated.

## Verification (paste real output)

- `npx tsc -p` (touched) — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems` (+ api artifacts tests if endpoint touched)
  — green.
- Visual: screenshot for Loom (real code-audit outputs) + an empty one.

## Constraints

- Derived-only: no new "artifact ownership" store; everything computes from existing stores
  at read time.
- External links follow the existing PR-link idiom (PrOutputCard) — no raw styled anchors if a
  DS link exists.
- i18n cs + en.

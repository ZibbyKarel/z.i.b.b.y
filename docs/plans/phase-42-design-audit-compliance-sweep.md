# Phase 42 — Design-audit compliance sweep (line 19)

> TODO (line 19): _"sladit desing podle auditu. Stále nám nesedí desing jazyk který máme
> naimplementovaný a který je v claude design (…soubor ZIBBY Design Audit.html)."_

## Framing

Tokens already match the audit (verified in Phase 29 recon: `libs/design-system` themes +
`globals.css` implement the audit §03 token set). The high-traffic surfaces were aligned in
earlier phases — /runs + pipeline phase log (29, 36), chat + orbit + message bg (33, 35),
CommandLine per velin-b in dialog/overview/chat (31a, 38, 40). What remains is an
app-wide pass on the audit's **concrete, checkable rules** — NOT a subjective per-screen
redesign (the operator is actively co-designing the screens themselves, e.g. velin-b /
SummaryWidget). Deliver the objective compliance; report the rest.

## The audit's checkable rules (from `design/Z.I.B.B.Y/ZIBBY Design Audit.html` — READ it)

Confirm the exact list against the file, but per the Phase-29 recon summary the load-bearing
rules are:
1. **Light = life only.** Glow / pulse / the "live" corner-brackets are reserved for what is
   actually alive — a running run, a waiting approval. Everything else is matte (done/error
   dots, idle panels, static badges). Sweep the app for stray glow/pulse on non-live things.
2. **Remove scanlines + grid overlays (P2).** Find and remove decorative scanline / grid
   overlay layers on HUD surfaces (e.g. a `linear-gradient(... 1px, transparent 1px)` grid,
   scanline masks) that the audit says to drop — EXCEPT where a canvas/scene deliberately
   owns its backdrop (the chat CosmicScene is a real scene, not a decorative overlay — leave
   it).
3. **Color = state, shape = category.** State by the 4 state colors (ok/run/wait/bad), with
   `run` (#7aa5f8) distinct from `accent` (#5b8def); categories/models/tools drop color →
   glyph + text. Reuse the single shared state map (`features/runs/run.ts` runStateTone) —
   don't fork tones. Flag any place a state is conveyed by shape-only or a wrong tone.
4. **focus-visible: a 2px accent ring, always.** Ensure interactive elements have a visible
   focus ring (DS primitives should already; find raw controls that lack it).
5. **Radius 6/10, spacing on the 4px grid, ≤2 letter-spacing values.** Mostly token-driven;
   flag/fix any raw-px radius/spacing or ad-hoc tracking that slipped in.

## Approach (bounded, low-risk)

1. READ `ZIBBY Design Audit.html` and pin the exact rule list (correct the above if needed).
2. Grep the app for concrete violations and fix the LOW-RISK ones:
   - stray `pulse`/glow/animate on non-live elements → gate on live/running state (reuse the
     canonical HIGH-RISK/`runStateTone`/live predicates already in the code);
   - decorative scanline/grid overlay layers → remove (leave the chat scene);
   - raw-px radius/spacing / inline-style colors on DOM → route through DS tokens/props;
   - missing focus-visible ring on raw interactive elements → add via the DS pattern.
3. Do NOT rewrite screen layouts to match mockups pixel-for-pixel (that's the operator's
   subjective co-design). If a screen clearly diverges structurally from its velin mockup,
   LIST it in the report as a follow-up rather than redesigning it here.
4. Keep every change token-driven and reversible; small, reviewable diffs per rule.

## Files
- Wherever violations are found — likely a handful across `apps/web/features/*` and
  `apps/web/components/*`, plus possibly a DS primitive if a focus-ring/token gap is central.
- Do NOT touch operator WIP: `SummaryWidget.tsx`, `apps/api/src/machine/*`,
  `libs/contracts/src/machine/*`, `design/*`.

## Verification
- `pnpm typecheck`, scoped lint (per touched dir — NEVER bare `pnpm lint`, it reformats the
  design mockups), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`).
- Manual spot-check: done/error elements are matte; only running/waiting glow; no scanline/
  grid overlays remain (except the chat scene); focus rings visible.
- Report: the concrete violations fixed (by rule), and a LIST of remaining subjective/
  structural per-screen gaps for the operator to drive.

## Note
This closes line 19 on the objective audit rules. Subjective per-screen visual fidelity is
co-owned with the operator's own design edits and is explicitly out of scope for an
autonomous sweep.

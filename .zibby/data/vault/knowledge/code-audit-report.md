# Code Audit Report — `feat/subsystem-federation`

**Run:** `code-audit_1783554113161`
**Branch:** `feat/subsystem-federation` → base `main`
**Scope:** the subsystem-federation arc (phases 80–92) — 82 committed files (+5,896/−27), plus 4 files of uncommitted WIP (the particle/handoff layer: `SubsystemWeb.tsx`, `particle-mapping.ts`, `runEvents.tsx`/`runEvents.test.tsx`, `ChatScreen.tsx`).
**Phases run:** Quality → Security → Accessibility → Performance.

---

## Overall verdict: **CONDITIONAL PASS — one blocking fix required before merge**

| Phase | Gate | Critical | High/Serious | Medium/Moderate | Low/Minor |
|---|---|---|---|---|---|
| Quality | PASS with fixes | 0 | 1 (theme) | 6 | 13 (+6 test-quality) |
| Security | PASS | 0 | 0 | 0 | 3 |
| Accessibility | **BLOCK** (on A1 only) | 1 | 2 | 4 | 2 |
| Performance | CONDITIONAL | 0 | 2 | 4 | 2 |

**One finding blocks merge: A1 — `SubsystemWeb`'s interactive nodes have no visible keyboard focus indicator.** It sits on the feature's only navigation surface and is a small, well-scoped fix (reuse the existing `selected`-ring pattern). Every other finding across all four phases is fixable in the same PR or trackable as a fast-follow without blocking.

The branch is architecturally sound: contract-first discipline held, the gate/approval trust boundary was verified intact (the headline security risk for a feature that touches gate rules), no `any`, deterministic rendering, and genuinely edge-case-tested pure modules (geometry, particle-mapping, aggregation precedence). The gaps are concentrated in the thin layer of UI code sitting directly on top of that otherwise-solid foundation: error-state handling, focus/contrast on the newest surfaces, and missing memoization on the two highest-render-frequency components.

---

## Must-fix before merge

1. **[A1 · Accessibility · Critical]** `SubsystemWeb` nodes (`SubsystemWeb.tsx:337-347`) render `outline-none` with nothing replacing it — a keyboard user can reach and activate every node but cannot see which one has focus. Add a focus-state ring reusing the existing `selected`-ring pattern in the same file (see phase report for a ready-made patch). This is the feature's whole "real hit-targets and keyboard focus" premise; ship it correctly.

---

## Strongly recommended in the same PR

Each is narrowly scoped to files this branch already owns and targets a surface the feature treats as its centerpiece (the drawer, the web, or the notification signal).

2. **[H1 · Quality · High-as-theme]** Loading and error states collapse into "empty" across four new drawer tabs (`ArtefaktyTab`, `AktivitaTab`, `GatesTab`, `RosterTab`) and the scoped `/gates` view — a failed fetch renders a false "owns nothing" / "no activity" claim to the operator. Directly conflicts with the ZIBBY "always answerable" law. Fix once as a shared loading/error/empty wrapper.
3. **[A2 + A3 · Accessibility · Serious]** `klid`-state node fill drops to ~1.5:1 contrast for some registry colors (needs ≥3:1); `variant="tertiary"` text (~3.98:1) carries primary content across all four new tabs, under the 4.5:1 AA floor. Bump the `klid` opacity floor (or add an always-visible stroke); swap `tertiary` → `secondary` on the cited content locations.
4. **[P1 + P2 · Performance · Serious]** Neither `RosterTab`'s pipeline-graph build nor `SubsystemWeb`'s particle `onEnd` callback is memoized, so both recompute/re-attach listeners on every `ChatScreen` re-render — which fires on every SSE token during streaming and every composer keystroke. `useMemo` the graph build, `useCallback` the particle-end handler. Mechanical, low-risk, targets the feature's liveliest surfaces.
5. **[M1 / S2 · Quality + Security]** `subsystem-seen.store.ts:57-62` collapses all read errors (including transient `EACCES`/`EMFILE`) into "missing file," so one transient failure wipes every subsystem's "seen" state and re-surfaces already-acknowledged Tier-2 reports. Distinguish `ENOENT` from other errors; rethrow the rest.
6. **[M3 + T7 · Quality]** Uncommitted WIP: the reduced-motion glow animates `transform: scale()` from the SVG origin, not the node center, producing a visible cross-screen slide — contradicting the component's own documented "opacity/stroke only" rule. Fix before committing the particle layer; add a placement assertion to the existing reduced-motion test.
7. **[S3 · Security]** `heroImage: z.string().nullable()` has no scheme/path constraint. Not exploitable today (always `null`, sourced from a trusted constant), but the contract should enforce the documented "root-relative path" intent before phase 90 populates it from a less-trusted source. One-line regex constraint.

---

## Track as fast-follow (does not block merge)

- **[M2 · Quality]** Chain-owned subsystems can never surface Tier-3 `ceka` (waiting-on-you) — `ownedPipelineRuns` only tracks `kind === "pipeline"` runs. Attribute through chain child-runs, or document the asymmetry explicitly.
- **[A4–A7 · Accessibility]** `Tabs` primitive lacks tab↔panel ARIA association and arrow-key roving focus (DS-level, benefits every consumer); drawer subsystem-switch produces no `aria-live` status announcement; Escape closes both the ⌘K palette and the drawer simultaneously with no topmost-only dismissal; Roster tab's CSS-transform-scaled canvas can shrink native focus rings to invisibility.
- **[P3 · Performance]** `useSubsystemsQuery`'s `refetchIntervalInBackground: true` never idles on a hidden/backgrounded tab, feeding a full-scan server aggregate continuously. Drop the flag (TanStack's default already pauses on hidden tabs) unless there's a specific product reason.
- **[P4 · Performance]** `phasesToGraph`'s module-level `guid()` counter makes graph output non-deterministic across renders — resolves itself once P1's memoization lands; otherwise file separately against the shared `pipeline-graph.ts`.
- **[P5 · Performance]** `runEvents.tsx`'s listener fan-out runs synchronously ahead of every query invalidation, with no time budget or listener cap — a forward-looking design note for the next `onRunEvent` consumer, not a live defect with one subscriber.
- **[S1 · Security]** The new `POST /api/subsystems/:id/seen` endpoint inherits the app's existing unauthenticated/no-CSRF posture (consistent with every other mutating endpoint; low impact — worst case is a reset "seen" timestamp). Note under any future CSRF hardening pass, no branch-local fix needed.
- **[M4, M5, M6, L1–L13, T1–T6 · Quality]** A long tail of Low-severity maintainability items and test-coverage gaps — duplicated `ago` formatter, untested `defaultOwnerSubsystem` payload behavior (the headline pipeline-tagging feature has zero direct coverage — worth promoting if triaging by risk), repeated `.filter()` scoping logic across tabs, an unmemoized `handleParticleEnd` call site (see P2, same root cause), clock-coupled unit tests. Full list in the quality phase report.
- **[A8, A9 · Accessibility]** External artifact links open in a new tab with no perceivable warning (AAA, polish); `usePrefersReducedMotion` is read once at mount on a component that now stays mounted for the whole `/chat` session rather than remounting as the hook's own doc comment assumes.
- **[P6, P7 · Performance]** Per-row `useTranslations` calls in list subcomponents; independent query subscriptions across four sibling tabs — both within framework-designed tolerances at current data volumes, noted for completeness only.

---

## Repo hygiene

Two untracked screenshot artifacts sit in the repo root (`chat-initial.png`, `chat-particle-1.png`) — remove before committing/opening the PR; flagged independently by both the quality and security phases. Not a defect, just noise that shouldn't land in the diff.

---

## What's genuinely good here (worth calling out, not just fixing gaps)

- **The gate trust boundary held.** The one thing that could have gone wrong in a feature that adds a field to gate rules — `ownerSubsystem` silently gaining read access in the evaluation/decision path — was verified absent by exhaustive grep, and the frontend structurally forecloses submitting a truncated reorder permutation. Attribution without policy leakage, done correctly.
- **Closed-enum ids everywhere**, atomic file-store writes, contract-first schemas with `.optional()` handled symmetrically on parse and serialize, and every deliberate rule-bend (an `exhaustive-deps` disable, a `style` passthrough, a plain-string `pathParams`) documented with a precise rationale.
- **The accessibility scaffolding is correct in structure**, just missing one layer: every `SubsystemWeb` node is a real `role="button"` + `tabIndex={0}` + Enter/Space handler + full descriptive `aria-label`, not a bare clickable `<div>`. `prefers-reduced-motion` is threaded consistently and has its own regression test. i18n parity is complete — zero missing/empty keys across `cs`/`en` for every new string, including every `aria-label`.
- **The pure-function layer is performance-conscious by design**: fixed 8-node geometry computed once at module scope, a hard `MAX_PARTICLES = 12` cap with oldest-first eviction, deterministic seeded jitter instead of `Math.random()` in render, and a primitive (not object-literal) SSE context value — the classic React context foot-gun correctly avoided.
- **SSE fan-out is correct and well-tested**: one `EventSource`, per-listener error isolation, ordered fan-out-before-invalidation, tested for delivery, unfiltered scopes, unsubscribe, and throwing-listener isolation.

---

## Recommended path to merge

1. Fix **A1** (blocking).
2. Fold in **H1, A2+A3, P1+P2, M1/S2, M3+T7, S3** in the same PR — all mechanical, all in files this branch already owns, all on the feature's centerpiece surfaces (drawer, web, particle layer, notification signal).
3. Remove the two stray root screenshots.
4. File the fast-follow list (M2, A4–A7, P3–P5, S1, the Low/Minor tail) as tracked follow-up work rather than blocking this PR further — none are structurally hard and none touch the correctness of the happy path.

---
name: design-match
description: >
  Implement a design mockup to structural and pixel parity. Use whenever a
  design HTML artifact in design/ must become real UI in apps/web or
  libs/design-system — measures the mockup, gates on structure before pixels,
  and loops until it matches or parks with evidence.
---

# design-match

Spec: `docs/superpowers/specs/2026-07-31-design-match-design.md`. CLI:
`tools/design-match/cli.mjs`; spec format `DESIGN_MATCH_VERSION = 1.3.0` — a
`spec.json` measured by a different format version is refused rather than
compared (see Exit codes).

## The rule this skill exists to enforce

**Structure first, values second, pixels last.** The failure this skill prevents
is not off-by-2px — it is inventing a different layout, or reaching for an
existing DS component whose internals do not match the design. So:

- **Reuse of an existing DS component is a result, not a default.** It must pass
  the skeleton check using only its existing props. If a variant would have to be
  added just for this one use, or its style overridden from outside, or a wrapper
  added to correct its size — that is a new component.
- **An unmatched value becomes a new token**, named semantically by role
  (`--zt-fg-secondary`), never by hex.
- **Never tune a value while the skeleton gate is red.** Two skeleton failures
  anywhere in the run — not necessarily back-to-back — stop it; that many is
  evidence the component choice itself is wrong, not that the numbers need work.

## Running it

`measure` runs once per design region and writes `spec.json`. `compare` runs
**one round** against the current implementation and exits — see "The loop"
below before you call it in an actual retry cycle.

```bash
# F1 + F2 — cache the mockup's CDN assets, inventory its regions, measure one
node tools/design-match/cli.mjs measure "design/Z.I.B.B.Y/ZIBBY Roadmap.html" "karta epicu"
```

This prints a numbered inventory (best text/class match first) with a preview
crop per candidate, e.g.:

```
Inventura regionů (1440×900):
  [1] div.epic-card                  360×140   @ (24,96)   ▸ r1.png
  [2] div.board > div.column         480×640  @ (400,80)  ▸ r2.png
Vybrán region [1]: div.epic-card — pokud je špatně, spusť znovu s --region <n>.
```

Only the top 5 candidates are printed and cropped (`r1.png`…`r5.png`), but
`--region` accepts any index in the full ranked list — a valid `--region`
beyond 5 has no preview crop to check it against. Open the crop, and if `[1]`
is the wrong region, rerun with `--region 2` (1-based). `measure` writes
`design.png` (the cropped shot) and `spec.json` for whichever region wins.

```bash
# F5 — one compare round against a real DS story (confirmed against the running
# Storybook's index: DesignSystem/Card → designsystem-card--overview)
node tools/design-match/cli.mjs compare --slug karta-epicu --story designsystem-card--overview

# …or against a real route (apps/web/app/(dashboard)/agents/page.tsx), dev
# server must already be up
node tools/design-match/cli.mjs compare --slug karta-epicu --route /agents
```

`--slug` defaults to a slugified `description` on `measure` (`"karta epicu"` →
`karta-epicu`); `compare` has no description to slugify from, so it always
requires `--slug` explicitly.

## Flags

`measure <design.html> "<description>"`:

| Flag                | Default                                    | Effect                                                                                                                           |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `--slug <slug>`     | slugified `description`                    | artifact directory name under `.design-match/`                                                                                   |
| `--region <n>`      | `1`                                        | 1-based pick from the printed inventory                                                                                          |
| `--strict-wrappers` | off                                        | see `references/skeleton-rules.md`; stamped into `spec.json` — `compare` refuses (exit 3) if its own flag disagrees              |
| `--theme <path>`    | `libs/design-system/src/theme/globals.css` | CSS `measure` reads to build `tokens.md`'s mappings; unreadable file just leaves the mapping empty (warns, doesn't fail the run) |

`compare --slug <slug>`:

| Flag                | Default                                        | Effect                                                                                                                                                                   |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--story <id>`      | —                                              | Storybook story id (one of `--story`/`--route` is required)                                                                                                              |
| `--route <path>`    | —                                              | app route; needs the dev server running (one of `--story`/`--route` is required)                                                                                         |
| `--selector <css>`  | the selector `measure` recorded in `spec.json` | override which element in the scene gets shot/compared                                                                                                                   |
| `--mask <css>`      | none, repeatable                               | region(s) masked out of the pixel diff — see `references/scene-recipes.md`                                                                                               |
| `--strict-wrappers` | off                                            | must match what `measure` stamped into `spec.json` for this slug — a mismatch refuses with exit 3, not a silent compare; there is no override, only re-running `measure` |
| `--reset`           | off                                            | discard `rounds.json` history, start a fresh attempt                                                                                                                     |

## The loop

`compare` is not a loop by itself — it runs exactly **one** round and exits.
The CLI cannot edit code, so the driving agent _is_ the loop: read the exit
code and `report.md`, edit the implementation, call `compare` again. History
accumulates across invocations in `.design-match/<slug>/rounds.json`, and two
things read that stored history rather than just the round that just ran:

- a hard ceiling of 5 rounds — the fifth round still runs in full (screenshot,
  diff, artifacts written), then parks instead of returning `POKRAČUJ`; nothing
  is ever refused outright, so a driver gets four `POKRAČUJ` rounds before the
  ceiling bites, not five;
- a thrash guard — once two consecutive rounds both produced a pixel
  percentage, a drop of less than 20% relative to the previous round parks the
  run rather than let small edits chase diminishing returns forever.

A round is **done** only when the pixel diff is under 0.5% **and** the largest
contiguous differing region is at most 4×4 px — a tiny total percentage with
one solid misplaced block is still `POKRAČUJ`, not `HOTOVO`.

`--reset` discards `rounds.json` and starts clean — use it once the actual
cause of a park (the font mismatch, the wrong component) is fixed, not to
dodge the ceiling.

## Exit codes

One exit code cannot express four outcomes, so there are four (`cli.mjs:311-316`):

| Code | Label      | Meaning                                                                                                                                                                                                                                                                                                   | What the driver does next                                                                           |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0    | `HOTOVO`   | a match was found                                                                                                                                                                                                                                                                                         | stop calling `compare`                                                                              |
| 1    | `POKRAČUJ` | no match yet, the loop hasn't given up                                                                                                                                                                                                                                                                    | edit the implementation, call `compare` again                                                       |
| 2    | `PARK`     | the loop stopped without reaching done — thrash, 2 skeleton failures, the round ceiling, or a font mismatch                                                                                                                                                                                               | stop calling `compare`, surface it to the operator                                                  |
| 3    | `CHYBA`    | `compare`/`measure` itself failed — a bad invocation, a missing `spec.json`, a `spec.json` from an older `design-match` format or measured with a different `--strict-wrappers` setting (both refuse rather than compare — re-run `measure` for the slug), a browser that wouldn't launch, a failed write | fix the invocation/environment first — reading this as "continue" loops forever against a dead tool |

## Font preflight

Once the skeleton gate passes, `compare` runs a font check before it ever
touches pixels (`checkFontPreflight` in `cli.mjs`, backed by
`preflight.mjs`). On a mismatch the pixel layer is skipped entirely and the
round **parks immediately** — not `continue` — because a font mismatch makes
every pixel delta a lie, and no further round can fix it without an edit.

`preflight.mjs` normalises `next/font/google`'s generated family names
(`__Geist_<hash>`) back to the human name before comparing, and drops the
synthetic `_Fallback` variant entirely (Next's own metric-matched substitute —
the design side has nothing to compare it against). **This normalisation is
verified only for `--route`** (against `apps/web`, where `next/font/google` is
actually in play) — it is unverified for `--story` (Storybook). Say so plainly
to whoever hits it first; if Task 15's dry run settles it, update this section.

## CDN cache (measure)

Mockups pull React, Babel, three.js off a CDN — without network they render
nothing, and an empty screenshot looks like valid input. Before shooting
`design.png`, `measure` runs the mockup through `ensureCdnCache`
(`cdn-cache.mjs`): every quoted `src="http(s)://…"` / `href="http(s)://…"` HTML
attribute is downloaded once into `.design-match/.cdn-cache/` (keyed by a hash
of the URL, typed by the response's real `content-type` rather than the URL's
extension — Chromium enforces MIME on `file://` stylesheets), and the mockup's
HTML is rewritten to point at the local copy.

What it does **not** catch:

- **Nested resources inside a cached stylesheet.** A cached Google Fonts CSS
  file still `@font-face`s the actual font binary off `fonts.gstatic.com` —
  that URL is never discovered or cached, so an "offline" run still reaches
  the network for it.
- **Anything that isn't a double-quoted `src=`/`href=` attribute.** The
  rewrite only matches `/\b(src|href)="(https?:\/\/[^"]+)"/g` — a
  single-quoted attribute, a CSS `@import`/`url()` inside an inline `<style>`
  block, or a resource fetched by a `<script>` at runtime are all invisible to
  it and still hit the network.
- **No staleness or invalidation.** The cache key is the URL alone — no TTL,
  ETag, or content hash — so a changed remote resource is served stale forever
  once cached.
- **No protection against concurrent runs** racing the same cache path.

A mockup that silently depends on something outside this list produces a run
that looks clean and measures the wrong thing — exactly the failure this
skill exists to prevent.

The rewritten mockup itself is **not** written under `.design-match/` — it
lands beside the original design file, as
`<mockup-dir>/.design-match-cached-<name>.html` (e.g.
`design/Z.I.B.B.Y/.design-match-cached-ZIBBY Roadmap.html`). It is covered by
`.gitignore:35` (`.design-match-cached-*`), so it's safe to leave uncommitted,
but nothing ever deletes it — it is only overwritten the next time `measure`
runs against that same mockup file.

## Reading the artifacts

Everything lands in `.design-match/<slug>/` (gitignored — `.gitignore:29`) —
except the CDN-cached mockup copy `measure` writes beside the design file
itself (see CDN cache above). `measure` alone writes only `spec.json`,
`design.png` and the `r*.png` crops; everything else below appears only after
a `compare` round, and `app.png` only on a round that got past both the
skeleton gate and the font preflight to reach the pixel layer:

| File                  | Read it when                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.md`           | first, always — verdict, round history, masked regions, and a list of the files `writeArtifacts` produced **this round** (not `rounds.json`, `design.png`, `app.png`, or the crops)                                                                                                                                                                                                                                         |
| `skeleton.md`         | the gate is red — this names the structural difference                                                                                                                                                                                                                                                                                                                                                                      |
| `values.md`           | skeleton is green and a value delta needs tuning. Reads `Sedí — žádné hodnotové rozdíly.` when values were actually compared and clean, or `Neměřeno — skeleton gate neprošel…` when the skeleton gate failed and the value layer never ran at all — the two are distinct states, never conflated. Same address space as `skeleton.md` either way: one DOM walk produces both, so a path names the same node in either file |
| `tokens.md`           | reviewing DS token growth before approving a new one — a **design-side inventory** computed once at `measure` time (every design value with no matching theme token), not a design-vs-app delta                                                                                                                                                                                                                             |
| `components.md`       | justifying why a new component was created instead of reusing one — today always just its `# Volba komponent` heading; the tool never auto-populates it (see note below)                                                                                                                                                                                                                                                    |
| `spec.json`           | the raw measured spec `measure` wrote — what every `compare` round is checked against                                                                                                                                                                                                                                                                                                                                       |
| `rounds.json`         | the accumulated round history driving the loop/thrash decisions                                                                                                                                                                                                                                                                                                                                                             |
| `round-N.json`        | one round's raw verdict (skeleton pass/fail, pixel %, reason)                                                                                                                                                                                                                                                                                                                                                               |
| `round-N-diff.png`    | the pixel diff mask **composited over the app screenshot** — not a bare mask; alone, a diff mask is marks floating on transparency                                                                                                                                                                                                                                                                                          |
| `design.png`          | the cropped design screenshot `measure` shot once                                                                                                                                                                                                                                                                                                                                                                           |
| `app.png`             | the app screenshot from the most recent `compare` round that reached the pixel layer                                                                                                                                                                                                                                                                                                                                        |
| `r1.png`, `r2.png`, … | the numbered region preview crops `measure` printed (top 5 only), for picking `--region <n>` with the image in hand                                                                                                                                                                                                                                                                                                         |

`components.md` is always just its `# Volba komponent` heading —
`buildCompareOutcome` hardcodes `componentDecisions: []` (`cli.mjs`) and
nothing populates it. Recording _why_ a new component was justified (which
existing DS candidates were tried, why each was rejected) is currently a
manual step for whoever drives the loop, not something `compare` derives on
its own.

## Gates

- **New tokens** are presented for approval before being written to
  `libs/design-system`.
- **Masked regions** are always listed in `report.md`. A masked region is
  unverified area — never mask silently.

## References

- `references/skeleton-rules.md` — what counts as a structural node
- `references/computed-props.md` — the measured property whitelist
- `references/scene-recipes.md` — Storybook / route / mask, and how scene
  resolution actually fails

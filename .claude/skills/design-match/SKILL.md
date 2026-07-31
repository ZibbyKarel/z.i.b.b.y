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

| Flag                | Default                                        | Effect                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--story <id>`      | —                                              | Storybook story id (one of `--story`/`--route` is required)                                                                                                                                                                                                           |
| `--route <path>`    | —                                              | app route; needs the dev server running (one of `--story`/`--route` is required)                                                                                                                                                                                      |
| `--selector <css>`  | the selector `measure` recorded in `spec.json` | override which element in the scene gets shot/compared                                                                                                                                                                                                                |
| `--mask <css>`      | none, repeatable                               | region(s) masked out of the pixel diff — see `references/scene-recipes.md`                                                                                                                                                                                            |
| `--strict-wrappers` | off                                            | must match what `measure` stamped into `spec.json` for this slug — a mismatch refuses with exit 3, not a silent compare; there is no override, only either dropping/adding the flag on `compare` to match the spec, or re-running `measure` with the setting you want |
| `--reset`           | off                                            | discard `rounds.json` history, start a fresh attempt                                                                                                                                                                                                                  |

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
the design side has nothing to compare it against). This normalisation matters
for `--route` (against `apps/web`, where `next/font/google` is in play). For
`--story` it is a **no-op, now measured rather than assumed**: Storybook boots
the DS theme CSS directly, not `next/font`, so a story computes the plain
family name — `getComputedStyle(document.body).fontFamily` on
`designsystem-card--overview` and `dashboard-hudcard--default` both read
`Geist, system-ui, -apple-system, "system-ui", sans-serif`, with no `__Geist_<hash>`
anywhere. A real `compare --story` round confirmed the same stack reaching
`fontPreflight` as the implementation side. Nothing to normalise, and nothing
left open.

Two things the same observation exposed, which do bite:

- The preflight compares the **whole stack, in order**, as one joined string.
  A design side of `Geist, -apple-system, system-ui, sans-serif` and an app
  side of `Geist, system-ui, -apple-system, sans-serif` are the same fonts in
  a different fallback order — the preflight calls that a mismatch and parks
  the round (exit 2) even though the primary family is identical. Read the
  message before believing the park.
- Storybook loads no `@font-face` for Geist at all (`document.fonts` holds only
  Storybook's own faces). `Geist` resolving at all depends on it being
  installed as a **system** font on the machine — true on the dev Mac used
  here, not something to count on elsewhere. The preflight compares the
  declared stack, not what actually rasterised, so it cannot catch this.

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
| `tokens.md`           | reviewing DS token growth before approving a new one — a **design-side inventory** computed once at `measure` time, of every tokenisable design value (one row per distinct `prop`/value pair), each shown as either the existing theme token it maps onto or a proposed new one — not a design-vs-app delta                                                                                                                |
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

## Known limits (from the first real run, 2026-07-31)

Everything below was **observed**, not predicted, on the first end-to-end run of
the real CLI against `design/Z.I.B.B.Y/` and a running Storybook. The blockers
are listed first because two of them stop the run before it starts.

### `measure` cannot currently read any mockup in `design/Z.I.B.B.Y/`

All **11** mockups there open with `<link rel="preconnect" href="https://fonts.googleapis.com" />`.
`ensureCdnCache` treats every `href="http(s)://…"` as a downloadable resource,
and a bare origin answers **HTTP 404** — so the run aborts before the browser
launches:

```
[design-match] design-match: nelze stáhnout https://fonts.googleapis.com (HTTP 404). Bez cache se mockup nevykreslí.
```

A `preconnect`/`dns-prefetch` hint names a connection, not a file; nothing
skips it. **This includes the `measure` example in "Running it" above** —
`"design/Z.I.B.B.Y/ZIBBY Roadmap.html"` fails exactly this way. The one good
news is the shape of the failure: ~0.3 s, exit 3, a single `[design-match]`
line, no stack.

### 7 of the 11 mockups render nothing, and `measure` calls it a success

The mockups load their components as `<script type="text/babel" src="zibby/*.jsx">`.
Babel fetches those over XHR, and Chromium refuses XHR on `file://` — so
`#root` stays empty. Independently, the CDN rewrite keeps the original
`crossorigin="anonymous"` attribute on the React/Babel `<script>` tags, which
`file://` also cannot satisfy, so those never load from the cache either.

Neither failure is detected. `measure` exits **0** and writes a confident
`spec.json` holding a one-node skeleton of an empty `#root`. Confirmed on all
seven: Roadmap, Velin, Velin-B, Velin-D, Archiv úloh, Pravidla schvalování,
Redesign Canvas.

**The tell is the inventory.** A real mockup prints several candidates; a
mockup that did not render prints exactly one, and it is the mount point at
full viewport size:

```
Inventura regionů (1440×900):
  [1] #root                     1440×900 @ (0,0)   ▸ r1.png
```

If you see that, stop — do not compare against the spec. Open `r1.png`; it
will be blank.

### A candidate below the fold crashes the inventory

`cropRegions` screenshots with `clip` against the **viewport**, not the full
page, so any ranked candidate whose origin sits below `y = 900` throws a raw
Playwright error — `Clipped area is either empty or outside the resulting image`
— with a full stack rather than a `design-match:` line. Exit is still 3.
Observed on the two long-document mockups, `ZIBBY Design Audit.html` and
`ZIBBY Implementace - Changelog.html`. A region merely _taller_ than the
viewport is fine (`svg.circuit-svg` at 1440×1440 cropped without complaint) —
it is the origin being off-screen that breaks.

Net: **2 of 11 mockups (`ZIBBY Orb.html`, `ZIBBY Loading Screen.html`) are
measurable today**, and only after the `preconnect` blocker is worked around.

### three.js mockups: confirmed, with a correction

`ZIBBY Orb.html` behaves as expected — three.js appends `renderer.domElement`
at runtime, so the `<canvas>` never appears in the source but does appear in
the inventory as a full-viewport candidate, ranked `[2]`, whose skeleton is a
single node with no children:

```
  [1] #stage                    1440×900 @ (0,0)   ▸ r1.png
  [2] canvas                    1440×900 @ (0,0)   ▸ r2.png
  [3] #dock                       482×90 @ (479,780)   ▸ r3.png
```

Measure the chrome, not the canvas: `--region 3` (`#dock`) yields a real
19-node skeleton with 51 measured properties per node and 59 token mappings.
`ZIBBY Velin-D.html` also uses three.js, but that is not what stops it — it
never renders at all (previous limit), so its canvas is moot.

### `compare` defaults `--selector` to the design's own selector

`spec.json` records the winning **design** selector (`#dock`), and `compare`
reuses it against the app scene, where it almost never exists. The resulting
error is thrown inside `page.evaluate`, so Playwright prefixes the message and
the clean-error path no longer recognises it as ours — the operator gets a raw
stack, no artifacts, exit 3:

```
page.evaluate: Error: design-match: selector not found: #dock
```

Pass `--selector` explicitly on essentially every `compare`.

### `report.md`'s headline reads PARK on rounds that are still running

`renderReport` has only two headline states, `HOTOVO` and `PARK`, so a
perfectly normal continuing round writes `**Výsledek:** PARK — pokračuje` while
the console prints `POKRAČUJ` and the process exits **1**. `report.md` is the
file this skill tells you to read first, and on that one line it disagrees with
the exit code. **Trust the exit code**; read `report.md` for the round history
and the reason, not for the verdict.

### What was verified working

Worth stating, since the failures above are loud: the loop and gate machinery
itself behaved exactly as documented. Exit codes 0/1/2/3 all matched their
table entry, including four distinct error paths (bad command, missing
`spec.json`, missing scene, out-of-range `--region`), each a single clean
`[design-match]` line. The skeleton gate correctly named a genuine structural
difference (`layout mód: flex-column vs block`) in `skeleton.md`; `values.md`
correctly rendered `Neměřeno` on that red-gate round and a real delta list on a
green-gate one; `app.png` was correctly absent when the pixel layer was
skipped; `--strict-wrappers` was stamped into `spec.json`, refused a
disagreeing `compare` with exit 3, and reached `values.md`'s collapsed-wrapper
disclosure (present without the flag, absent with it). `.design-match/` and the
`.design-match-cached-*` mockup copies both stayed out of `git status`.

## References

- `references/skeleton-rules.md` — what counts as a structural node
- `references/computed-props.md` — the measured property whitelist
- `references/scene-recipes.md` — Storybook / route / mask, and how scene
  resolution actually fails

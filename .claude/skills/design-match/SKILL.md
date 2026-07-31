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
`tools/design-match/cli.mjs`; spec format `DESIGN_MATCH_VERSION = 1.4.0`
(`version.mjs`) — a `spec.json` measured by a different format version is
refused rather than compared (see Exit codes). 1.4.0 added `settled` to
`spec.json`, so every spec measured before it is refused with a re-measure
message; re-running `measure` for the slug is the whole fix.

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
crop per candidate. Verbatim output of the command above, 2026-07-31:

```
Inventura regionů (1440×900):
  [1] #root                     1440×900 @ (0,0)   ▸ r1.png
  [2] #root > div               1440×900 @ (0,0)   ▸ r2.png
  [3] #root > div > div         1440×900 @ (0,0)   ▸ r3.png
  [4] #root > div > div > div   1440×900 @ (0,0)   ▸ r4.png
  [5] #root > div > div > div > div  1376×933 @ (32,28)   ▸ bez náhledu — region leží mimo snímek stránky
Vybrán region [1]: #root — pokud je špatně, spusť znovu s --region <n>.
spec.json zapsán → .design-match/karta-epicu/spec.json
```

Read that inventory as a warning as much as a menu: `rankCandidates` breaks
ties on **area**, so on a full-bleed mockup the largest and least useful
element wins by construction — here four nested full-viewport wrappers ahead
of anything worth matching. `--region <n>` is what saves it, and picking it is
the operator's job, not the tool's.

Only the top 5 candidates are cropped (`r1.png`…`r5.png`), and a candidate that
does not lie on the full-page screenshot gets **no crop at all** — the
inventory says `bez náhledu — region leží mimo snímek stránky` rather than
naming a file that was never written (`[5]` above). `--region` accepts any
index in the full ranked list (59 candidates for this mockup), so a valid
`--region` beyond 5 has no preview to check it against either. Open the crop,
and if `[1]` is the wrong region, rerun with `--region 2` (1-based). `measure`
writes `design.png` (the shot of the chosen element) and `spec.json` for
whichever region wins.

```bash
# F5 — one compare round against a real DS story (confirmed against the running
# Storybook's index: DesignSystem/Card → designsystem-card--overview). No
# --selector needed: a story mounts at #storybook-root.
node tools/design-match/cli.mjs compare --slug karta-epicu --story designsystem-card--overview

# …or against a real route (apps/web/app/(dashboard)/agents/page.tsx), dev
# server must already be up. `--route` REQUIRES --selector — see Flags.
node tools/design-match/cli.mjs compare --slug karta-epicu --route /agents --selector "body > div"
```

`--slug` defaults to a slugified `description` on `measure` (`"karta epicu"` →
`karta-epicu`); `compare` has no description to slugify from, so it always
requires `--slug` explicitly.

### Where the mockup is served from

`measure` does **not** open the mockup over `file://` any more. It stands up a
read-only `node:http` server on an ephemeral `127.0.0.1` port
(`withStaticServer` in `shoot.mjs`) with exactly **two mounts** — `/` serving
the mockup's own directory (so its sibling `zibby/*.jsx` resolve) and
`/__design-match-cdn` serving the shared CDN cache (`CDN_CACHE_URL_PREFIX` in
`cdn-cache.mjs`) — and tears it down in a `finally`. `file://` was never a
bytes problem: Chromium blocks the XHR Babel uses for
`<script type="text/babel" src="…jsx">` there, and cannot satisfy a
`crossorigin` fetch, so seven of this repo's eleven mockups rendered an empty
`#root`. Over `http://127.0.0.1` both causes disappear.

Dropping `file://` also drops its isolation, so there is a floor:
`assertServableRoot` refuses to serve a root that is not inside the current
working directory, and refuses `$HOME` or any ancestor of it — on realpaths,
so a symlink out of the tree does not sneak past. Measuring a mockup that sits
outside the repo hits it before a socket is opened:

```
$ node tools/design-match/cli.mjs measure /tmp/dm-probe/x.html "karta"
[design-match] design-match: adresář mockupu (/private/tmp/dm-probe) leží mimo aktuální
pracovní adresář (/Users/zibby/Workspace/z.i.b.b.y) — design-match servíruje jen adresáře
uvnitř něj. Spusť measure z adresáře, který mockup obsahuje, nebo mockup do něj zkopíruj.
EXIT=3
```

That message is the only guidance you get, and the remedy in it is the one to
take: **copy the mockup into the repo** (`design/…`) and measure it there. The
other remedy it names — running `measure` from a directory containing the
mockup — only works if that directory can also hold `.design-match/`, which is
cwd-relative.

## Flags

`measure <design.html> "<description>"`:

| Flag                | Default                                    | Effect                                                                                                                           |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `--slug <slug>`     | slugified `description`                    | artifact directory name under `.design-match/`                                                                                   |
| `--region <n>`      | `1`                                        | 1-based pick from the printed inventory                                                                                          |
| `--strict-wrappers` | off                                        | see `references/skeleton-rules.md`; stamped into `spec.json` — `compare` refuses (exit 3) if its own flag disagrees              |
| `--theme <path>`    | `libs/design-system/src/theme/globals.css` | CSS `measure` reads to build `tokens.md`'s mappings; unreadable file just leaves the mapping empty (warns, doesn't fail the run) |

`compare --slug <slug>`:

| Flag                        | Default                                               | Effect                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--story <id>`              | —                                                     | Storybook story id (one of `--story`/`--route` is required)                                                                                                                                                                                                           |
| `--route <path>`            | —                                                     | app route; needs the dev server running (one of `--story`/`--route` is required)                                                                                                                                                                                      |
| `--selector <css>`          | `--story`: `#storybook-root`; `--route`: **required** | which element in the scene gets extracted, shot and compared. The design's own selector from `spec.json` is **never** inherited — see below                                                                                                                           |
| `--mask <css>`              | none, repeatable                                      | region(s) masked out of the pixel diff — see `references/scene-recipes.md`                                                                                                                                                                                            |
| `--strict-wrappers`         | off                                                   | must match what `measure` stamped into `spec.json` for this slug — a mismatch refuses with exit 3, not a silent compare; there is no override, only either dropping/adding the flag on `compare` to match the spec, or re-running `measure` with the setting you want |
| `--reset`                   | off                                                   | discard `rounds.json` history, start a fresh attempt                                                                                                                                                                                                                  |
| `--app-base <origin>`       | `http://localhost:3000`                               | origin `--route` is joined onto                                                                                                                                                                                                                                       |
| `--storybook-base <origin>` | `http://localhost:6006`                               | origin `--story`'s `/iframe.html?id=…&viewMode=story` is built on                                                                                                                                                                                                     |

### `--selector` on `compare`

`spec.json` records the winning **design** selector (`#root`, `#dock`,
`svg.circuit-svg`, `div.row:nth-child(3)`). `compare` used to fall back to it,
and that was the tool's worst default: those selectors are generic enough to
match _something_ in a real app while naming an entirely unrelated node, and a
compare that quietly measures the wrong node is worse than one that refuses. It
is no longer consulted at all, and no fallback chain leads back to it.

The two scenes then differ because the evidence about them differs
(`resolveScene`, `shoot.mjs`):

- **`--story` defaults to `#storybook-root`** — Storybook's own mount contract,
  not an inference about anyone's markup, so the documented `compare --story`
  works with no `--selector` at all.
- **`--route` refuses without one.** Next's App Router mounts straight into
  `<body>`; there is nothing correct to default to, so it says so and names what
  to pass, at exit 3:

  ```
  [design-match] design-match: --route vyžaduje i --selector — v implementaci neexistuje
  uzel, který by šlo bezpečně uhodnout, a selector z designu (spec.json) se nedědí: buď
  v aplikaci není, nebo tam náhodou sedí na úplně jiný prvek. Otevři route v prohlížeči
  a předej selector kořene porovnávané části.
  ```

Open the route in a browser and pass the root of the part being matched. A
selector that matches nothing in the scene is one clean line naming the
selector and the page — never a stack (see Exit codes).

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

One exit code cannot express four outcomes, so there are four. They come from a
single table — `OUTCOME` in `loop.mjs` — which `report.md`'s headline is looked
up from as well, so the file and the exit code cannot disagree:

| Code | Label      | Meaning                                                                                                                                                                                                                                                                                                   | What the driver does next                                                                           |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0    | `HOTOVO`   | a match was found                                                                                                                                                                                                                                                                                         | stop calling `compare`                                                                              |
| 1    | `POKRAČUJ` | no match yet, the loop hasn't given up                                                                                                                                                                                                                                                                    | edit the implementation, call `compare` again                                                       |
| 2    | `PARK`     | the loop stopped without reaching done — thrash, 2 skeleton failures, the round ceiling, or a font mismatch                                                                                                                                                                                               | stop calling `compare`, surface it to the operator                                                  |
| 3    | `CHYBA`    | `compare`/`measure` itself failed — a bad invocation, a missing `spec.json`, a `spec.json` from an older `design-match` format or measured with a different `--strict-wrappers` setting (both refuse rather than compare — re-run `measure` for the slug), a browser that wouldn't launch, a failed write | fix the invocation/environment first — reading this as "continue" loops forever against a dead tool |

`report.md`'s headline is now that same label — a continuing round writes
`**Výsledek:** POKRAČUJ`, not `PARK`. Earlier revisions of this file told you to
trust the exit code over the report; that caveat is gone because the defect is.

## When a run fails

Everything below exits **3** and prints exactly one `[design-match]` line, no
stack. The rule about what such a run leaves on disk is stated once in
`cli.mjs` and applied at every refusal path:

> design-match never deletes what it **saw**, and never writes what it
> **concluded** — and it names only files it actually wrote.

So `design.png` and the `rN.png` crops survive a refusal: they are correct
renderings of what the browser really put on screen, and they are the evidence
the refusal is telling you to go and look at. `spec.json`, `report.md` and
`rounds.json` assert conclusions and are never written on a failing path.

| Refusal                                                            | What it leaves, and what it points you at                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| root outside cwd / at or above `$HOME`                             | nothing — it fires before the browser launches. Copy the mockup into the repo                                                                                                        |
| CDN resource that cannot be downloaded                             | nothing — `design-match: nelze stáhnout <url> (HTTP nnn). Bez cache se mockup nevykreslí.`                                                                                           |
| `--region <n>` out of range                                        | names the crops **that exist**; when `cropFitsPage` skipped all of them it says so and sends you to the inventory's selectors and dimensions instead of naming a file it never wrote |
| region rendered nothing (below)                                    | names `design.png` and the **chosen** region's crop, when that crop exists                                                                                                           |
| `spec.json` missing / older version / blank                        | nothing new — re-run `measure` for the slug                                                                                                                                          |
| `--strict-wrappers` disagrees with `spec.json`                     | nothing new — re-run `measure`, or drop/add the flag on `compare`                                                                                                                    |
| `--route` without `--selector`, or a selector that matches nothing | nothing — the message names the selector and the page                                                                                                                                |

A failed `compare` additionally **marks the previous `report.md` stale** rather
than leaving a passing verdict lying next to a failed run. The retraction is
prepended, the earlier round's record is preserved underneath it, and repeated
failures do not stack a second marker:

```
> **NEPLATNÉ:** tenhle report popisuje starší kolo. Následující `compare` skončil chybou
(hláška je ve výstupu terminálu, ne tady), takže verdikt níž na aktuální stav neodpovídá —
oprav příčinu a spusť `compare` znovu.
```

Only `compare` does this: a failed `measure` says nothing about whether an
earlier comparison held.

### A spec that measured nothing is a failure, not a result

`measure` refuses to write a spec whose chosen region is an **empty
container** — no visible children, no own text anywhere in the extracted
subtree, and a tag that is not content in itself (`assertRegionRendered`,
`cli.mjs`). This is the guard against the branch's worst failure: a mockup that
rendered nothing, measured as a confident one-node spec at exit 0, with every
layer downstream then comparing against a description of nothing.

```
[design-match] design-match: region "#root" nic neobsahuje — v celém podstromu není text
ani žádný obsahový prvek, takže spec by popisoval prázdno. Pravděpodobné příčiny: stránka
se nevykreslila, skripty se nenačetly, nebo selector míří na prázdný kontejner. Otevři
mockup v prohlížeči a ověř, že se vykreslí, případně zvol jiný region přes --region <n>.
Soubory z tohoto běhu zůstaly na disku: .design-match/x/design.png, .design-match/x/r1.png.
EXIT=3
```

The three causes it names are the three to check, in that order. No `spec.json`
is written.

Two things the guard deliberately does **not** do. It does not require a
minimum node count, and it does not look at the region's size — a one-node spec
is the correct result for a leaf `<canvas>`, `<img>` or `<button>`, and a
full-viewport region is correct for a full-bleed mockup. And it treats a
subtree cut off by `extractRaw`'s depth cap of 6 as **unknown, not empty**
(`truncated`, `extract.mjs`): without that, `ZIBBY Roadmap.html` — this file's
own worked example, whose first text sits at DOM depth 13 — was falsely
refused. A subtree that was not looked at must not condemn.

The same question is asked of a `spec.json` already on disk
(`assertSpecMeasured`), because the blank specs written before the guard existed
are well-formed documents that the version check alone cannot catch. There it
is **root-only**: a stored skeleton does not carry the depth-cap flag, so a
childless node deeper in the tree is unknowable from the file, while a childless
root is decidable.

## Font preflight

Once the skeleton gate passes, `compare` runs a font check before it ever
touches pixels (`checkFontPreflight` in `cli.mjs`, backed by
`preflight.mjs`). On a mismatch the pixel layer is skipped entirely and the
round **parks immediately** — not `continue` — because a font mismatch makes
every pixel delta a lie, and no further round can fix it without an edit.

**It compares the first resolved family only** — case-folded, after
normalisation. The rest of the stack is not compared at all, not even at a
lower severity: `collectFontStacks` dedupes families into a `Set` in
DOM-traversal order across the whole tree, so the tail's _order_ is a property
of the walk rather than of anyone's CSS, and reporting a difference computed
from it would be the tool making a claim it cannot back. Nothing is lost by
that: `fontFamily` is in the measured whitelist, so `compareValues` still
compares the full declared stack node by node, and any delta there keeps the
round at `POKRAČUJ`. A fallback-order difference is therefore a value delta
naming the node it happened on — it no longer parks the run and no longer
suppresses the pixel layer.

A genuine mismatch — a different **primary** family — still parks, with pixels
suppressed and no `app.png`, because with different fonts every pixel delta is
a lie:

```
PARK — font stack se liší v první vykreslované rodině — design: Comic Sans MS,
implementace: Geist (celé stacky — design: [Comic Sans MS, cursive], implementace:
[Geist, system-ui, -apple-system, system-ui, sans-serif]). Sjednoť je dřív, než se začne
porovnávat.
EXIT=2
```

`preflight.mjs` normalises `next/font/google`'s generated family names
(`__Geist_<hash>`) back to the human name before comparing, and drops the
synthetic `_Fallback` variant entirely (Next's own metric-matched substitute —
the design side has nothing to compare it against). This normalisation matters
for `--route` (against `apps/web`, where `next/font/google` is in play). For
`--story` it is a **no-op, measured rather than assumed**: Storybook boots the
DS theme CSS directly, not `next/font`, so a story computes the plain family
name — `getComputedStyle(document.body).fontFamily` on
`designsystem-card--overview` and `dashboard-hudcard--default` both read
`Geist, system-ui, -apple-system, "system-ui", sans-serif`, with no
`__Geist_<hash>` anywhere. Nothing to normalise, and nothing left open.

Two limits that remain:

- **Scope.** `design[0]` is the first family of the first font-declaring node in
  DOM order — in practice the root's primary family, not every family the tree
  uses. A heading font that differs while the body font matches passes here.
  That is deliberate, not a hole: the value layer catches it per node and keeps
  the round going; the preflight only answers the coarse question of whether the
  comparison is worth running at all.
- Storybook loads no `@font-face` for Geist at all (`document.fonts` holds only
  Storybook's own faces). `Geist` resolving at all depends on it being
  installed as a **system** font on the machine — true on the dev Mac used
  here, not something to count on elsewhere. The preflight compares the
  declared stack, not what actually rasterised, so it cannot catch this.

The passing message (`font stack shodný v první rodině: …`) never reaches an
artifact — only a failing preflight becomes the round's reason. Silence from
this layer means it passed.

## CDN cache (measure)

Mockups pull React, Babel, three.js off a CDN — without network they render
nothing, and an empty screenshot looks like valid input. Before shooting
`design.png`, `measure` runs the mockup through `ensureCdnCache`
(`cdn-cache.mjs`): every remote URL a tag genuinely asks the browser to fetch
is downloaded once into `.design-match/.cdn-cache/` (keyed by a hash of the
URL, typed by the response's real `content-type` rather than the URL's
extension, so an extension-less Google Fonts `css2?family=…` is still cached as
`.css`), and the mockup's HTML is rewritten to point at the local copy under
`/__design-match-cdn`.

**What counts as a fetch is decided per tag, not per attribute.** A `src` on
any tag, and an `href` on anything that is not `<a>`/`<area>`/`<base>`, is a
resource. On `<link>` it is a resource only when `rel` names one — a positive
allow-list (`stylesheet`, `preload`, `modulepreload`, `prefetch`, `icon`,
`apple-touch-icon`, `apple-touch-startup-image`, `mask-icon`, `manifest`). This
is why every mockup in `design/Z.I.B.B.Y/` can be measured at all: they all open
with `<link rel="preconnect" href="https://fonts.googleapis.com" />`, a bare
origin that answers 404, and a blunt attribute scan aborted the whole run on it.
An allow-list fails towards "not cached, fetched live"; an ignore-list fails
towards "blocked", and would need updating every time HTML gains a hint.

What it does **not** catch:

- **Nested resources inside a cached stylesheet.** A cached Google Fonts CSS
  file still `@font-face`s the actual font binary off `fonts.gstatic.com` —
  that URL is never discovered or cached, so an "offline" run still reaches
  the network for it.
- **Anything that isn't an HTML attribute on a tag.** A CSS `@import`/`url()`
  inside an inline `<style>` block, or a resource fetched by a `<script>` at
  runtime, is invisible to the rewrite and still hits the network. (Quoting
  style is _not_ a limit any more: single-quoted and unquoted attribute values
  are parsed the same as double-quoted ones, and collection and rewriting are
  driven by the same tag walk, so a URL cannot be cached without being
  rewritten.)
- **No staleness or invalidation.** The cache key is the URL alone — no TTL,
  ETag, or content hash — so a changed remote resource is served stale forever
  once cached.
- **No protection against concurrent runs** racing the same cache path.

A mockup that silently depends on something outside this list produces a run
that looks clean and measures the wrong thing — exactly the failure this
skill exists to prevent. The emptiness guard above is the backstop, and it only
fires when the page renders _nothing_; a page that renders short still measures.

The rewritten mockup itself is **not** written under `.design-match/` — it
lands beside the original design file, as
`<mockup-dir>/.design-match-cached-<name>.html` (e.g.
`design/Z.I.B.B.Y/.design-match-cached-ZIBBY Roadmap.html`). It is covered by
`.gitignore:35` (`.design-match-cached-*`), so it's safe to leave uncommitted,
but nothing ever deletes it — it is only overwritten the next time `measure`
runs against that same mockup file. It is not openable on its own any more
either: the cache URLs in it are root-absolute against the mount prefix, so it
only resolves when this tool serves it.

## Reading the artifacts

Everything lands in `.design-match/<slug>/` (gitignored — `.gitignore:29`) —
except the CDN-cached mockup copy `measure` writes beside the design file
itself (see CDN cache above). `measure` alone writes only `spec.json`,
`design.png` and the `r*.png` crops; everything else below appears only after
a `compare` round, and `app.png` only on a round that got past both the
skeleton gate and the font preflight to reach the pixel layer:

| File                  | Read it when                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.md`           | first, always — verdict (the same `OUTCOME` label the exit code comes from), round counter, settle caveat, round history, masked regions, and a list of the files `writeArtifacts` produced **this round** (not `rounds.json`, `design.png`, `app.png`, or the crops). A refused later run prepends a `> **NEPLATNÉ:**` retraction rather than leaving this verdict looking current |
| `skeleton.md`         | the gate is red — this names the structural difference                                                                                                                                                                                                                                                                                                                              |
| `values.md`           | skeleton is green and a value delta needs tuning — see the four states below                                                                                                                                                                                                                                                                                                        |
| `tokens.md`           | reviewing DS token growth before approving a new one — a **design-side inventory** computed once at `measure` time, of every tokenisable design value (one row per distinct `prop`/value pair), each shown as either the existing theme token it maps onto or a proposed new one — not a design-vs-app delta                                                                        |
| `components.md`       | justifying why a new component was created instead of reusing one — today always just its `# Volba komponent` heading; the tool never auto-populates it (see note below)                                                                                                                                                                                                            |
| `spec.json`           | the measured spec `measure` wrote — what every `compare` round is checked against. Top-level: `settled`, `selector`, `skeleton`, `tokenMappings`, `strictWrappers`, `version`; values hang off each skeleton node, there is no `spec.values`                                                                                                                                        |
| `rounds.json`         | the accumulated round history driving the loop/thrash decisions                                                                                                                                                                                                                                                                                                                     |
| `round-N.json`        | one round's raw verdict (skeleton pass/fail, pixel %, reason, `settled`)                                                                                                                                                                                                                                                                                                            |
| `round-N-diff.png`    | the pixel diff mask **composited over the app screenshot** — not a bare mask; alone, a diff mask is marks floating on transparency                                                                                                                                                                                                                                                  |
| `design.png`          | the design screenshot `measure` shot once, of the chosen element                                                                                                                                                                                                                                                                                                                    |
| `app.png`             | the app screenshot from the most recent `compare` round that reached the pixel layer                                                                                                                                                                                                                                                                                                |
| `r1.png`, `r2.png`, … | the numbered region preview crops `measure` printed — top 5, and only those that lie on the page image — for picking `--region <n>` with the image in hand                                                                                                                                                                                                                          |

### `values.md`'s four states

The distinction the whole branch exists to keep: "no differences" and "not
measured" must never render the same. `renderValues` (`report.mjs`) has exactly
four operator-visible outputs:

1. **`Neměřeno — skeleton gate neprošel…`** — the gate was red, `compareValues`
   never ran, nothing about the values is known. This is the state an operator
   meets first, and the one worth reading carefully: it is _not_ a pass.
2. **`Sedí — žádné hodnotové rozdíly.`** — the values really were compared and
   really were clean.
3. **a delta list**, grouped by skeleton path, one bullet per property.
4. and, on top of (2) and (3), the **wrapper-coverage caveat** —
   `> Měřeny jsou uzly, které zůstaly ve skeletonu…` — present whenever wrapper
   collapsing was on (the default), absent under `--strict-wrappers`. It names
   what the value layer did _not_ look at: a collapsed pass-through wrapper
   takes its own measured values with it.

All four use `skeleton.md`'s address space — one DOM walk produces both, so a
path names the same node in either file.

### `settled`

`gotoSettled` waits for `load` (fatal) and then for `networkidle` (bounded at
10 s, non-fatal). A page that never goes idle is still measured — that is what
makes `apps/web`'s permanent SSE stream and one of the mockups usable at all —
but the fact is recorded rather than swallowed: `settled` lands on the round in
`rounds.json`/`round-N.json`, on `spec.json` for the design side, and as a
caveat block under `report.md`'s headline naming which side and which rounds.

```
> **Pozor na ustálení stránky:** implementace se neustálila (networkidle) v kole 1
> — snímek je z rozpracovaného načítání, takže procenta níž jsou orientační.
```

A **missing** `settled` is a third state and renders as neither — a round or a
spec written before the field existed knows nothing about its settle, and
unknown must not be laundered into "settled".

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

## Known limits (measured 2026-07-31, on the tree that carries this file)

Everything below was **observed**, not predicted, by running the real CLI
against `design/Z.I.B.B.Y/` with Storybook and `pnpm web:dev` up. Earlier
revisions of this section described blockers that no longer exist; what follows
is what is true now.

### The corpus: 11 of 11 measurable

Every mockup in `design/Z.I.B.B.Y/` measures to a real spec, from a cold cache
(`.design-match/.cdn-cache` deleted first), default `--region 1`, exit 0:

| Mockup                         | Nodes | Token mappings | Winning selector                             | `settled` |
| ------------------------------ | ----- | -------------- | -------------------------------------------- | --------- |
| ZIBBY Archiv úloh              | 41    | 69             | `#root`                                      | true      |
| ZIBBY Design Audit             | 13    | 27             | `section:nth-child(6)`                       | true      |
| ZIBBY Implementace - Changelog | 11    | 47             | `… > div.row:nth-child(3)`                   | true      |
| ZIBBY Loading Screen           | 15    | 13             | `svg.circuit-svg`                            | true      |
| ZIBBY Orb                      | 2     | 13             | `#stage`                                     | true      |
| ZIBBY Pravidla schvalování     | 15    | 63             | `#root`                                      | true      |
| ZIBBY Redesign Canvas          | 28    | 48             | `div.design-canvas > div > div:nth-child(3)` | **false** |
| ZIBBY Roadmap                  | 10    | 24             | `#root`                                      | true      |
| ZIBBY Velin-B                  | 267   | 154            | `… > div > div`                              | true      |
| ZIBBY Velin-D                  | 124   | 86             | `#root`                                      | true      |
| ZIBBY Velin                    | 82    | 97             | `#root`                                      | true      |

Measuring is not matching: a spec is only the design side. But "the tool cannot
read this repo's own designs" — which this section used to say, at 2 of 11 — is
no longer true of anything here.

### Two mockups do not shoot the same `design.png` twice

`shootElement` captures both sides with `animations: "disabled"`, which freezes
**CSS** animations and transitions. Its reach stops there. Motion driven by
script lands on a wall-clock-dependent frame regardless, so the option makes
both sides frozen the _same_ way; it does not make either side reproducible.

- **`ZIBBY Orb`** — a three.js render loop. Three consecutive `measure` runs of
  the default region (`#stage`, which contains the canvas) produced three
  different `design.png` hashes.
- **`ZIBBY Loading Screen`** — a `setTimeout` progress simulation rather than a
  CSS animation. Intermittent: task 17 measured five runs and got three
  identical hashes plus two others, with a residual diff of **0.01 %** (largest
  differing region 36×24 px); three runs here were byte-identical.

That residual is the scale of the problem — it is not "the tool is
non-deterministic". A control run of `ZIBBY Roadmap` three times produced one
identical hash, and every other mockup is stable the same way.

### `rankCandidates` breaks ties on area

Unchanged, and it is the limit an operator meets on every full-bleed mockup: the
largest element wins, so `#root` and its nested wrappers take the top slots
ahead of anything worth matching (see the inventory in "Running it"). The
numbered inventory plus `--region <n>` is the mitigation, and choosing is the
operator's job.

### `ZIBBY Redesign Canvas` measures, but with no region previews at all

It is a pan/zoom canvas: its cards sit inside a transformed, `overflow: hidden`
container, so their boxes are reported at `y ≈ 1173` and 4256 px wide while the
document itself never grows past 1440×900. Every ranked candidate is therefore
off the page image, `cropFitsPage` skips all of them, and the operator gets a
numbered list with no pictures — `bez náhledu — region leží mimo snímek
stránky` on every row. Choose by selector and dimensions instead. The chosen
region's own `design.png` is unaffected (it is a `locator.screenshot()`, which
scrolls the element into view), which is why the mockup still measures to a real
28-node spec.

It is also the one mockup of eleven that measures `settled: false`: a `fetch` on
its 404 branch never reads or cancels the response body, so the request never
finishes and the page can never go idle. That is recorded in `spec.json` and
surfaced in `report.md`, not swallowed.

### three.js mockups: measure the chrome, not the canvas

`ZIBBY Orb.html` behaves as expected — three.js appends `renderer.domElement` at
runtime, so the `<canvas>` never appears in the source but does appear in the
inventory as a full-viewport candidate, ranked `[2]`, whose skeleton is a single
node with no children:

```
  [1] #stage                    1440×900 @ (0,0)   ▸ r1.png
  [2] canvas                    1440×900 @ (0,0)   ▸ r2.png
  [3] #dock                       482×90 @ (479,780)   ▸ r3.png
```

`--region 3` (`#dock`) yields a real 19-node skeleton, 51 measured properties
per node and 59 token mappings (24 exact, 35 proposed new) — re-confirmed on
this tree. A one-node `<canvas>` spec is a legitimate measurement, not an empty
one, which is exactly why the emptiness guard tests for content rather than for
node count.

### A design and an app screenshot of different pixel sizes is exit 3, not a verdict

The skeleton gate compares every node's box **relative to its parent**, and the
root's own relative box is `1×1` by construction — so the absolute size of the
comparison root is never gated. Two structurally identical trees of different
size therefore pass the gate, pass the preflight, and then reach `diffPngs`,
which refuses to diff mismatched buffers:

```
[design-match] design-match: rozměry se liší — design 800×240, app 640×54
EXIT=3
```

Observed on a deliberate probe. It is `CHYBA`, not `POKRAČUJ` — no artifacts
for that round, and the previous `report.md` gets the stale marker — even though
a size difference is a perfectly ordinary implementation difference. Size the
scene (or pick a `--selector` whose element matches the design region's
dimensions) before reading that message as a tool fault.

### `compareValues` compares `fontFamily` as an exact string

Since the preflight narrowed to the first family, a differing fallback **order**
is a value delta on every node — which is the right layer for it, but it means a
run cannot reach `HOTOVO` until the implementation's declared stack matches the
design's. Against Storybook, whose order genuinely differs from these mockups',
that is a standing blocker. Recorded as open in `references/computed-props.md`.

### `components.md` is never populated

`buildCompareOutcome` hardcodes `componentDecisions: []`. Recording _why_ a new
component was justified is a manual step for whoever drives the loop.

### What was verified working

Worth stating alongside the limits: the loop and gate machinery behaves as
documented. All four exit codes matched their table entry across the acceptance
run, including every refusal path in "When a run fails", each a single clean
`[design-match]` line with no stack. The skeleton gate named genuine structural
differences (`počet potomků: 1 vs 0`, a `šířka` ratio) in `skeleton.md`;
`values.md` rendered `Neměřeno` on those red-gate rounds; a green-gate round
against a differing primary font parked at exit 2 with `app.png` correctly
absent; `--strict-wrappers` was stamped into `spec.json` and refused a
disagreeing `compare`; a refused `compare` retracted the previous `report.md`
while preserving it. `.design-match/` and the `.design-match-cached-*` mockup
copies both stayed out of `git status`.

## References

- `references/skeleton-rules.md` — what counts as a structural node
- `references/computed-props.md` — the measured property whitelist
- `references/scene-recipes.md` — Storybook / route / mask, and how scene
  resolution actually fails

# Scene recipes

`compare` needs somewhere to shoot the implementation from. `resolveScene`
(`shoot.mjs`) resolves that from three flags, in the order the spec prefers:

- `--story <id>` — Storybook, the cleanest scene: one component, no app chrome,
  no seeded data. Preferred when the target is a DS component.
- `--route <path>` — the running app. Necessary when the thing being matched
  only exists in context (a page layout, a form inside its shell). Needs the
  dev server up.
- `--mask <selector>` (repeatable) — **not a third scene**, a modifier on top of
  either of the above: `resolveScene` threads `masks` through the `--story`
  branch exactly as it does the `--route` branch. Use it for regions that
  cannot be made deterministic — live timestamps, avatars, anything seeded
  from real data. A mask is unverified area, every mask is listed in
  `report.md`, and masking is the last resort, not the first.

## `--story <id>`

```bash
pnpm storybook            # http://localhost:6006
```

Write a story whose args mirror the mockup's content exactly — same strings, same
counts, same states — then compare against it. Confirmed against the running
Storybook's own `/index.json`: `DesignSystem/Card`'s `Overview` export resolves
to the id `designsystem-card--overview`.

```bash
node .claude/skills/design-match/scripts/cli.mjs compare --slug karta-epicu --story designsystem-card--overview
```

The engine hits `/iframe.html?id=…&viewMode=story`, so no Storybook chrome is in
the shot. `--storybook-base <origin>` overrides `http://localhost:6006` when
Storybook is somewhere else.

## `--route <path>`

```bash
pnpm web:dev              # http://localhost:3000
```

`--route` is normalised to always start with exactly one `/` (a bare
`--route agents` and `--route /agents` resolve to the same URL), then joined
onto the app base (`--app-base <origin>`, default `http://localhost:3000`).
Confirmed real: `apps/web/app/(dashboard)/agents/page.tsx` exists.

```bash
node .claude/skills/design-match/scripts/cli.mjs compare --slug karta-epicu --route /agents --selector "body > div"
```

`--selector` is not optional here — see below.

If the page composes seeded or live data, its content must match the mockup's
exactly — a different string is a different pixel width — or mask it (below).

**`apps/web` never goes network-idle.** Its run-events SSE stream is by
construction a request that never finishes, so every `--route` round prints

```
design-match: stránka se do 10000 ms neustálila (networkidle) — http://localhost:3000/agents. …
```

and carries on. The wait for idleness is bounded (10 s) and non-fatal — `load`
is what decides whether a page can be measured — but the round is recorded as
`settled: false` and `report.md` gets a caveat block saying the screenshot came
from a page that was still loading. That is a real caveat on the percentages,
not noise to filter out.

## `--selector`

**The design's own selector is never inherited.** `spec.json` records whatever
won the design inventory (`#root`, `#dock`, `div.row:nth-child(3)`); those are
generic enough to match an unrelated node in a real app, and a compare that
quietly measures the wrong node is worse than one that refuses. `resolveScene`
does not consult `spec.selector` at all.

- `--story` defaults to `#storybook-root` — Storybook's own mount contract,
  true of every entry in this repo's index, so it is a fact rather than a guess.
- `--route` **requires** `--selector` and refuses (exit 3) without it, naming
  what to pass. Next's App Router mounts straight into `<body>`, and comparing
  a design region against a whole page body is meaningless.

A `--selector` that matches nothing in the scene produces one clean line naming
both the selector and the page it was looked for on, and no stack:

```
[design-match] design-match: selector "#dock" neodpovídá žádnému prvku na stránce
http://localhost:6006/iframe.html?id=designsystem-card--overview&viewMode=story — měřená
scéna ten uzel nemá. Otevři stránku v prohlížeči, najdi odpovídající element a předej ho
přes --selector; selector z designu (spec.json) v implementaci zpravidla neexistuje.
```

## `--mask <selector>` (repeatable)

```bash
node .claude/skills/design-match/scripts/cli.mjs compare --slug karta-epicu --route /agents \
  --selector "body > div" \
  --mask "[data-testid=last-active]"   # illustrative: stand-in for a live/relative-time field
```

`shootScene` resolves every mask selector against the live page and fails
loudly rather than silently producing an unmasked, non-deterministic
screenshot:

- a mask that matches **zero** elements throws — `design-match: maska "<sel>"
neodpovídá žádnému prvku`;
- a mask that matches something, but none of the matches intersect the
  screenshotted region's bounding box, throws — `design-match: maska "<sel>"
leží mimo snímaný výřez`.

Both are deliberate: a mask that silently does nothing is indistinguishable
from no mask at all in the output, and that is exactly the failure this tool
exists to eliminate — a pixel comparison that fails on non-deterministic
content with no visible cause. Both exit 3, and both messages above are
verbatim.

One scope limit worth knowing: masks are resolved inside `shootScene`, which
only runs on a round that got past the skeleton gate **and** the font
preflight. On a round that stopped earlier, a broken mask selector is never
noticed — and `report.md` still lists it under "Maskované regiony", because
what that list means is "area this run did not verify", which holds either way.
Do not read a listed mask as proof the mask resolved.

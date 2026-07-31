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
node tools/design-match/cli.mjs compare --slug karta-epicu --story designsystem-card--overview
```

The engine hits `/iframe.html?id=…&viewMode=story`, so no Storybook chrome is in
the shot.

## `--route <path>`

```bash
pnpm web:dev              # http://localhost:3000
```

`--route` is normalised to always start with exactly one `/` (a bare
`--route agents` and `--route /agents` resolve to the same URL), then joined
onto the app base. Confirmed real: `apps/web/app/(dashboard)/agents/page.tsx`
exists.

```bash
node tools/design-match/cli.mjs compare --slug karta-epicu --route /agents
```

If the page composes seeded or live data, its content must match the mockup's
exactly — a different string is a different pixel width — or mask it (below).

## `--selector`

Both scenes default `--selector` to whatever `measure` recorded as the winning
region's selector in `spec.json`. Only pass `--selector` explicitly when the
app's structure means a different element needs to be the comparison root than
the one the design side used.

## `--mask <selector>` (repeatable)

```bash
node tools/design-match/cli.mjs compare --slug karta-epicu --route /agents \
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
content with no visible cause.

# Scene recipes

Three ways to get the implementation onto screen for comparison. Prefer them in
this order.

## C — Storybook story (default for DS components)

```bash
pnpm storybook            # http://localhost:6006
```

Write a story whose args mirror the mockup's content exactly — same strings, same
counts, same states. Then:

```bash
node tools/design-match/cli.mjs compare --slug epic-card \
  --story ds-epiccard--from-design --selector "#storybook-root > *"
```

The engine hits `/iframe.html?id=…&viewMode=story`, so no Storybook chrome is in
the shot.

## A — seeded route (page composition)

Seed `.e2e-data` the way `e2e/global-setup.ts` does, then boot both servers:

```bash
ZIBBY_DATA_DIR=.e2e-data pnpm dev
node tools/design-match/cli.mjs compare --slug roadmap-board \
  --route /roadmap --selector "[data-testid=roadmap-board]"
```

Seed values must match the mockup's content exactly. A different task title is a
different pixel width.

## B — mask (fallback only)

For blocks that cannot be made deterministic — relative timestamps, live
counters:

```bash
node tools/design-match/cli.mjs compare --slug roadmap-board \
  --route /roadmap --selector "[data-testid=roadmap-board]" \
  --mask "[data-testid=relative-time]"
```

Every mask is printed in `report.md`. A masked region is unverified area and must
stay visible as such.

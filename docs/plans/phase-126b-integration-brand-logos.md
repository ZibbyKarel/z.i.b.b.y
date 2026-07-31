# Phase 126b — integration cards carry the service's own logo

> TODO.md item 2: _"kartičky integrací v detailu projektu budou mít ikonky služeb třetích
> stran — Jira integrace → ikonka JIRA systému, Github integrace → ikonka GitHub atp.…
> zobrazíme místo glyphu vlevo nahoře."_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## Problem

`IntegrationCard.tsx:19-26` borrows generic geometric DS glyphs as stand-ins for real
services — `branch` for GitHub, `checkpoint` for Jira, `plug` for Slack, `server` for email,
`clock` for calendar, `bolt` for Sentry. Nothing on the card says *which service* at a
glance.

## The seam — already built, currently unused

`HudCard` accepts `logoSrc`/`logoAlt` (`HudCard.tsx:20-25`) and forwards them into
`IconTile.src` (`HudCard.tsx:70`). `IconTile` treats `src` as the preferred rendering and —
critically — **falls back to `glyph` automatically on image load failure**
(`IconTile.tsx:110-117, 138-148`). `ProjectCard.tsx:184` already uses this path for project
logos.

So the whole change is: give `IntegrationCard` a per-kind logo URL and pass it as `logoSrc`,
keeping `KIND_GLYPH` as the fallback. **No design-system change at all.**

## Decisions to record in DECISIONS.md

- **D3 — brand logos are image assets, not new `IconName` glyphs.** The DS `Icon` is hard
  locked to monochrome `stroke="currentColor"` (`Icon.tsx:74-81`) and the design-system
  SKILL.md forbids per-icon tests/stories — the registry is a set of generic geometric
  shapes by design. A brand mark is a different class of asset and belongs on the
  `IconTile.src` image path that already exists for project logos.
- **D4 — monochrome brand marks tinted for the dark tile, not official multicolour art.**
  The app runs `DesignSystemProvider theme="dark"`; GitHub's official mark is `#181717` and
  would be invisible on a dark tile, and an `<img src>` cannot inherit theme tokens. Each
  logo is therefore a single-path [Simple Icons](https://simpleicons.org) mark (CC0-1.0)
  filled with a per-kind colour chosen for contrast on the dark tile. Shape carries the
  recognition; exact brand colour does not survive the dark surface anyway.
- **D5 — assets are committed static files, not an npm dependency.** Fetched once from the
  Simple Icons CDN and checked in under `apps/web/public/logos/`, with provenance and a
  refresh recipe in `tools/brand-logos/README.md`. Avoids a ~15 MB devDependency and any
  `check:deps` churn for six static files.

## Implementation

### 1. Assets — `apps/web/public/logos/`

Fetch each mark from `https://cdn.simpleicons.org/<slug>/<hex>` (returns a complete,
single-path SVG already filled with `<hex>`), save as `apps/web/public/logos/<kind>.svg`:

| integration `kind` | Simple Icons slug | fill hex | rationale |
| --- | --- | --- | --- |
| `github` | `github` | `FFFFFF` | official mark is near-black; white is GitHub's own dark-background variant |
| `jira` | `jira` | `2684FF` | Atlassian brand blue, legible on dark |
| `slack` | `slack` | `E8E8E8` | official mark is multicolour; the monochrome variant is the sanctioned single-colour use |
| `calendar` | `googlecalendar` | `4285F4` | the `calendar` kind is Google Calendar (`integration.schema.ts:101`) |
| `sentry` | `sentry` | `F6F6F8` | brand purple `362D59` is too dark for the tile |

`email` gets **no logo** — the kind is generic IMAP/SMTP (`EmailConfigSchema`,
`integration.schema.ts:45`), not Gmail. It keeps its `server` glyph. Do not invent a mark
for it.

Verify each downloaded file before committing: it must be a single `<svg>` with a `<path>`,
no `<script>`, no external references, and `viewBox="0 0 24 24"`. Reject and re-fetch
anything else.

Also write `tools/brand-logos/README.md`: the table above, the CDN URL pattern, the CC0-1.0
licence note, and the one-liner to refresh all five.

### 2. `IntegrationCard.tsx`

Add next to `KIND_GLYPH`, typed against the contract enum so a future `kind` is a *compile*
error rather than a silent missing logo:

```ts
const KIND_LOGO: Partial<Record<IntegrationKind, string>> = {
  github: "/logos/github.svg",
  jira: "/logos/jira.svg",
  slack: "/logos/slack.svg",
  calendar: "/logos/googlecalendar.svg",
  sentry: "/logos/sentry.svg",
};
```

(Keep the filename matching the `kind` key — `calendar.svg`, not `googlecalendar.svg` —
so the map reads as one lookup. Pick one convention and hold it across the table above,
the files, and the README.)

Pass through to `HudCard` at line 132:

```tsx
logoSrc={KIND_LOGO[integration.kind]}
logoAlt={/* the service name, e.g. t(`integrations.kind.${integration.kind}`) */}
glyph={KIND_GLYPH[integration.kind]}
```

`KIND_GLYPH` **stays** — it is the fallback for `email` and for any logo that fails to load.
Deleting it would regress the card to an empty tile on a 404.

`logoAlt` must be a real service name, not the empty string — the tile is the card's only
service indicator. Reuse an existing `integrations.kind.*` i18n key if one exists; if not,
add one per kind to both catalogs.

### 3. Sizing check

`IconTile` renders `src` as an `<img>` sized by the `size` prop. Confirm the SVG's intrinsic
`viewBox` fills the tile the same way `ProjectCard`'s raster logos do — if the mark ends up
noticeably smaller or larger than the glyph it replaces, fix it with the tile's existing
props, **not** by adding an inline `style` (ESLint `react/forbid-dom-props` forbids it in
`apps/web`).

## Tests (`--project web-components`)

`IntegrationCard.test.tsx` (extend; create only if absent):
- A `github` integration renders `IconTileTestId.Image` with `src="/logos/github.svg"` and a
  non-empty `alt`.
- An `email` integration renders **no** image and still renders its glyph tile.
- Every member of `IntegrationKindSchema.options` renders a card without throwing — a table
  test so a newly added kind fails loudly here rather than shipping a blank tile.

## Definition of done

1. `pnpm exec vitest run apps/web/features/integrations --project web-components` green.
2. `pnpm exec vitest run --project web` green (i18n parity, if keys were added).
3. Prettier + ESLint clean on touched files; `tsc -p apps/web/tsconfig.json --noEmit` clean.
4. The five SVGs exist, are valid, and are committed.
5. One commit: `feat(integrations): show the service's own logo on integration cards`.

## Out of scope

- Any change to `libs/design-system` — if you find yourself editing `Icon.tsx` or the glyph
  registry, stop: the plan is wrong and needs the orchestrator, not a workaround.
- Logos anywhere other than the integration card (project cards, nav, settings).
- A `gmail` integration kind.

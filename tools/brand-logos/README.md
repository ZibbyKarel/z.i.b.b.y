# Brand logos — `apps/web/public/logos/`

Per-`kind` brand marks for `IntegrationCard` (phase 126b), so a service's own logo shows
in the card's leading tile instead of a generic DS glyph. See
`docs/plans/phase-126b-integration-brand-logos.md` for the full decision record (D3–D5).

## Provenance

Each mark is a single-path [Simple Icons](https://simpleicons.org) SVG (CC0-1.0 licence),
fetched pre-filled with a per-kind hex chosen for contrast on the app's dark tile —
**not** the service's official brand colour, which is often too dark to read on
`DesignSystemProvider theme="dark"`.

| integration `kind` | Simple Icons slug | fill hex | file                                 |
| ------------------ | ----------------- | -------- | ------------------------------------ |
| `github`           | `github`          | `FFFFFF` | `apps/web/public/logos/github.svg`   |
| `jira`             | `jira`            | `2684FF` | `apps/web/public/logos/jira.svg`     |
| `calendar`         | `googlecalendar`  | `4285F4` | `apps/web/public/logos/calendar.svg` |
| `sentry`           | `sentry`          | `F6F6F8` | `apps/web/public/logos/sentry.svg`   |

`email` has no logo — the kind is generic IMAP/SMTP, not Gmail — and keeps its `server`
DS glyph.

### `slack` — deliberately absent

Slack's mark is **not** included. As of this writing, Simple Icons has pulled the Slack
icon from its registry after a trademark-permission request from Slack
([simple-icons/simple-icons#14140](https://github.com/simple-icons/simple-icons/issues/14140),
labelled "permission required"). There is no upstream CC0 asset left to fetch. The
`slack` kind keeps its existing `plug` DS glyph via `IntegrationCard`'s `KIND_GLYPH`
fallback (the same path `IconTile` uses when any `src` 404s). Do not hand-author a Slack
mark from memory — re-check the upstream issue before adding one back.

## Refresh recipe

Re-fetch a mark (e.g. after a rebrand) with:

```bash
curl -sS "https://cdn.simpleicons.org/<slug>/<hex>" -o apps/web/public/logos/<kind>.svg
```

This CDN endpoint returns a complete, single-path SVG already filled with `<hex>`. After
fetching, verify the file: it must start with `<svg`, contain exactly one `<path>`, declare
`viewBox="0 0 24 24"`, and contain no `<script>` tag or external URL reference. Reject and
re-fetch anything else — never hand-author brand path data.

To refresh all four in one go:

```bash
curl -sS "https://cdn.simpleicons.org/github/FFFFFF" -o apps/web/public/logos/github.svg
curl -sS "https://cdn.simpleicons.org/jira/2684FF" -o apps/web/public/logos/jira.svg
curl -sS "https://cdn.simpleicons.org/googlecalendar/4285F4" -o apps/web/public/logos/calendar.svg
curl -sS "https://cdn.simpleicons.org/sentry/F6F6F8" -o apps/web/public/logos/sentry.svg
```

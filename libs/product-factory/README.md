# @zibby/product-factory

Deterministic CLI behind the `tool` phases of the coloring-book workflow. Runs on plain Node 24
(native TypeScript type stripping — erasable syntax only, `.ts` import extensions).

```
product-factory plan check <content-plan.md> [--out plan.json]   # exit 0 ok, 1 problems (plan-check.md)
product-factory cast [--report f] [--rounds N]                     # character sheets + title buddies, exit 0 / 2 blocked
product-factory produce <jobs.json> [--report f] [--rounds N] [--pages a-b]   # exit 0 all approved, 2 blocked pages
product-factory reject <pages> [--reason text]                     # un-approve pages (0 = cover) so produce redoes them
product-factory render [--report f]                               # interior.pdf, cover.pdf, render-manifest.json
product-factory preflight [--report f]                            # preflight.json, exit 0 pass / 1 fail
product-factory finalize <listing.md> [--report f]                # listing.md, README.md, report with book path
product-factory doctor                                            # environment check, always exit 0
product-factory bakeoff [--prompts f] [--out dir] [--configs model:quantize:steps,...]   # compare models
```

Reports end with `<verdict>pass</verdict>` or `<verdict>gap</verdict>`.

## Env

| Var                                                               | Default                               | Meaning                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PF_BOOK_DIR`                                                     | `$ZIBBY_RUN_DIR/book` (else `./book`) | durable output folder                                                                          |
| `ZIBBY_RUN_DIR`                                                   | cwd                                   | run root; `finalize` sums every `costs.jsonl` below it                                         |
| `PF_ROUNDS`                                                       | 3                                     | produce rounds                                                                                 |
| `PF_THRESHOLD`                                                    | 160                                   | black/white threshold                                                                          |
| `PF_MAX_GRAY` / `PF_MIN_INK` / `PF_MAX_INK` / `PF_MAX_MARGIN_INK` | 0.08 / 0.01 / 0.35 / 0.0005           | pixel QA limits                                                                                |
| `PF_MIN_COLOR` / `PF_MAX_WHITE`                                   | 0.25 / 0.45                           | cover QA: min saturated / max near-white share                                                 |
| `PF_MAX_BUSY`                                                     | 0.15                                  | cover QA: max busy share under the title / badges                                              |
| `PF_CONCURRENCY`                                                  | 1                                     | vision QA concurrency                                                                          |
| `PF_IMAGE_PROVIDER`                                               | `mock`                                | `mock`, `mflux` (local), `fal` (cloud)                                                         |
| `PF_VISION_PROVIDER`                                              | `none`                                | `none` (pixel QA only), `mock`, `lmstudio`, `haiku`                                            |
| `PF_MOCK_FAIL_PAGES`                                              | –                                     | e.g. `3,5`: mock emits a gray image for those pages on attempt 1; `0` = a white line-art cover |
| `PF_SINGLE_SIDED`                                                 | `true`                                | blank back side after each coloring page                                                       |
| `PF_CREATED_AT`                                                   | now                                   | timestamp in the book README                                                                   |

Real-provider variables (`PF_IMAGE_MODEL`, `PF_IMAGE_SIZE`, `PF_MFLUX_*`, `FAL_KEY` (secret), `PF_FAL_PRICE_USD`,
`LMSTUDIO_HOST`, `PF_LMSTUDIO_MODEL`, `PF_HAIKU_TIMEOUT_MS`), install steps, the 24 GB memory rules and licence
allow-list are in `docs/ops/product-factory.md`.

## Layout

```
book/  plan.json jobs.json illustrations/<NN>/{<NN>-attempt-001.png,<NN>-approved.png,<NN>-meta.json}
       characters/<id>/{attempt-001.png,approved.png,meta.json,superseded-001.png} characters/cast-<ids>.png
       cover-art/{attempt-001.png,approved.png,buddy-<n>.png} qa/<NN>.json render-manifest.json
       cover-front.png interior.pdf cover.pdf preflight.json listing.md README.md
<stage cwd>/costs.jsonl   one JSON line per image/vision call
```

## Recurring characters

Every `plan.characters` entry is drawn once by `cast` as a black-and-white reference sheet
(pixel QA + a vision check of the sheet against its `spec`: counts, garments, shape). A changed
spec supersedes the old sheet. `produce` then sends every page and the cover that list
characters as an image-conditioned edit: one reference PNG with their sheets side by side, plus
their specs appended to the prompt (mflux: `Flux2KleinEdit`; fal: the `/edit` endpoint).
`cover.titleBuddies` are drawn by `cast` too — the character in colour in the given pose,
flood-fill cut out of the white background — and `render` sits them on / hangs them from the
title.

## Cover front

`render` composes `cover-front.png` (art + title + buddies + badges, flattened) and embeds it as
the front panel. The title is vector glyph paths in `fonts/LuckiestGuy-Regular.ttf` (Apache-2.0,
full Czech coverage): one or two balanced lines, letters cycling through `cover.titlePalette`,
alternately tilted, thick outline and drop shadow. `src/cover-layout.ts` is the one layout both
`render` and the cover QA in `produce` use, so the `busy-zone` check covers exactly the area the
title, subtitle, buddies and badges occupy.

`fonts/NotoSans-Regular.ttf` (SIL OFL, from Next's bundled OG fonts) is embedded in the PDFs (interior, back cover, spine); it is a Latin
subset, so characters outside it (e.g. Czech diacritics) are stripped to their base letter with a render warning.

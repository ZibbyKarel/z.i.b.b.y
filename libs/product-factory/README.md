# @zibby/product-factory

Deterministic CLI behind the `tool` phases of the coloring-book workflow. Runs on plain Node 24
(native TypeScript type stripping — erasable syntax only, `.ts` import extensions).

```
product-factory plan check <content-plan.md> [--out plan.json]   # exit 0 ok, 1 problems (plan-check.md)
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

| Var                                                               | Default                               | Meaning                                                          |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `PF_BOOK_DIR`                                                     | `$ZIBBY_RUN_DIR/book` (else `./book`) | durable output folder                                            |
| `ZIBBY_RUN_DIR`                                                   | cwd                                   | run root; `finalize` sums every `costs.jsonl` below it           |
| `PF_ROUNDS`                                                       | 3                                     | produce rounds                                                   |
| `PF_THRESHOLD`                                                    | 160                                   | black/white threshold                                            |
| `PF_MAX_GRAY` / `PF_MIN_INK` / `PF_MAX_INK` / `PF_MAX_MARGIN_INK` | 0.08 / 0.01 / 0.35 / 0.0005           | pixel QA limits                                                  |
| `PF_CONCURRENCY`                                                  | 1                                     | vision QA concurrency                                            |
| `PF_IMAGE_PROVIDER`                                               | `mock`                                | `mock`, `mflux` (local), `fal` (cloud)                           |
| `PF_VISION_PROVIDER`                                              | `none`                                | `none` (pixel QA only), `mock`, `ollama`, `haiku`                |
| `PF_MOCK_FAIL_PAGES`                                              | –                                     | e.g. `3,5`: mock emits a gray image for those pages on attempt 1 |
| `PF_SINGLE_SIDED`                                                 | `true`                                | blank back side after each coloring page                         |
| `PF_CREATED_AT`                                                   | now                                   | timestamp in the book README                                     |

Real-provider variables (`PF_IMAGE_MODEL`, `PF_IMAGE_SIZE`, `PF_MFLUX_*`, `FAL_KEY` (secret), `PF_FAL_PRICE_USD`,
`OLLAMA_HOST`, `PF_OLLAMA_MODEL`, `PF_HAIKU_TIMEOUT_MS`), install steps, the 24 GB memory rules and licence
allow-list are in `docs/ops/product-factory.md`.

## Layout

```
book/  plan.json jobs.json illustrations/<NN>/{attempt-001.png,approved.png,meta.json}
       cover-art/{attempt-001.png,approved.png} qa/<NN>.json render-manifest.json
       interior.pdf cover.pdf preflight.json listing.md README.md
<stage cwd>/costs.jsonl   one JSON line per image/vision call
```

`fonts/NotoSans-Regular.ttf` (SIL OFL, from Next's bundled OG fonts) is embedded in the PDFs; it is a Latin
subset, so characters outside it (e.g. Czech diacritics) are stripped to their base letter with a render warning.

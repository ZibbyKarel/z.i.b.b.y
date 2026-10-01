# product-factory — local and cloud generation

CLI package: `libs/product-factory` (see its README for commands). This page covers the
real image and vision providers, their environment, and the 24 GB memory rules.

## Install / update (Apple Silicon, one time)

```bash
uv tool install mflux            # update: uv tool upgrade mflux
brew install ollama && brew services start ollama
ollama pull qwen3-vl:8b          # ~6 GB
product-factory doctor           # shows what is usable
```

The first mflux run downloads the FLUX.2 klein 4B weights (several GB, `~/.cache/huggingface`).
Run long batches on mains power under `caffeinate -i`, lid open.

## Switching local / cloud

| Goal                           | Setting                                             |
| ------------------------------ | --------------------------------------------------- |
| Local images (default real)    | `PF_IMAGE_PROVIDER=mflux`                           |
| Cloud images (fal.ai klein 4B) | `PF_IMAGE_PROVIDER=fal` + secret `FAL_KEY`          |
| Local vision QA                | `PF_VISION_PROVIDER=ollama`                         |
| Cloud vision QA (Claude Haiku) | `PF_VISION_PROVIDER=haiku` (needs `claude` on PATH) |
| Pixel QA only                  | `PF_VISION_PROVIDER=none`                           |
| Offline tests / dry runs       | `PF_IMAGE_PROVIDER=mock`, `PF_VISION_PROVIDER=mock` |

Every provider call is logged as one line in the stage's `costs.jsonl` (`source`, `provider`,
`model`, `costUsd`, `durationMs`, `page`). Local = 0 USD; fal = `$0.005 / megapixel`
(<https://fal.ai/models/fal-ai/flux-2/klein/4b>); haiku = the CLI's `total_cost_usd`.

## Environment variables

Put them in the project **env** unless marked **secret**.

| Var                                                               | Default                                    | Meaning                                                          |
| ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `PF_BOOK_DIR`                                                     | `$ZIBBY_RUN_DIR/book` (else `./book`)      | durable output folder                                            |
| `ZIBBY_RUN_DIR`                                                   | cwd                                        | run root; `finalize` sums every `costs.jsonl` below it           |
| `PF_ROUNDS`                                                       | 3                                          | produce rounds                                                   |
| `PF_THRESHOLD`                                                    | 160                                        | black/white threshold                                            |
| `PF_MAX_GRAY` / `PF_MIN_INK` / `PF_MAX_INK` / `PF_MAX_MARGIN_INK` | 0.08 / 0.01 / 0.35 / 0.0005                | pixel QA limits                                                  |
| `PF_CONCURRENCY`                                                  | 1                                          | vision QA concurrency                                            |
| `PF_IMAGE_PROVIDER`                                               | `mock`                                     | `mock`, `mflux`, `fal`                                           |
| `PF_VISION_PROVIDER`                                              | `none`                                     | `none`, `mock`, `ollama`, `haiku`                                |
| `PF_IMAGE_MODEL`                                                  | `flux2-klein-4b`                           | mflux model; must be on the licence allow-list                   |
| `PF_IMAGE_LORA`                                                   | –                                          | comma list; only allow-listed LoRAs (list is empty today)        |
| `PF_IMAGE_SIZE`                                                   | 1024                                       | square generation size in px (produce upscales to 300 DPI later) |
| `PF_MFLUX_PYTHON`                                                 | `~/.local/share/uv/tools/mflux/bin/python` | python of the mflux tool venv                                    |
| `PF_MFLUX_QUANTIZE`                                               | 4                                          | mflux `--quantize` bits                                          |
| `PF_MFLUX_STEPS`                                                  | 4 (klein), 8 (z-image-turbo)               | inference steps                                                  |
| `PF_FAL_PRICE_USD`                                                | `0.005 x megapixels`                       | per-image cost override for `costs.jsonl`                        |
| `FAL_KEY`                                                         | –                                          | **secret** — fal.ai API key; never logged                        |
| `OLLAMA_HOST`                                                     | `http://127.0.0.1:11434`                   | Ollama endpoint                                                  |
| `PF_OLLAMA_MODEL`                                                 | `qwen3-vl:8b`                              | vision model                                                     |
| `PF_HAIKU_TIMEOUT_MS`                                             | 120000                                     | per-image timeout for the `claude -p` judge                      |
| `PF_MOCK_FAIL_PAGES`                                              | –                                          | e.g. `3,5`: mock emits a gray image for those pages on attempt 1 |
| `PF_SINGLE_SIDED`                                                 | `true`                                     | blank back side after each coloring page                         |
| `PF_CREATED_AT`                                                   | now                                        | timestamp in the book README                                     |

## 24 GB memory choreography

Two models resident at once swaps the machine to death, so phases never overlap:

1. Before an mflux batch the provider asks Ollama to unload every loaded model (`/api/ps` + `keep_alive: 0`).
2. The Python driver (`py/mflux_batch.py`) loads the image model once and generates the whole round, then exits.
3. Vision QA runs after the whole round (`keep_alive: 10m` while judging); the provider unloads the model afterwards (`dispose()`).
4. Keep `PF_CONCURRENCY=1`. Never run `mflux` by hand while a vision pass is running.

## Licence rules

Only commercially usable models run: `flux2-klein-4b`, `flux2-klein-base-4b`, `z-image-turbo` (Apache-2.0).
FLUX.1/2 dev, klein 9B, Kontext dev, krea-dev and any non-commercial LoRA throw
`model X is not licensed for commercial use` before anything is generated. Allow-lists live in
`libs/product-factory/src/providers/licence.ts`; add the Coloring-Book-Z LoRA only after checking its licence.
FLUX.2 klein and Z-Image Turbo take no negative prompt, so none is sent.

## Bake-off

```bash
product-factory bakeoff [--prompts fixtures/bakeoff.json] [--out bakeoff] \
  [--configs flux2-klein-4b:4:4,z-image-turbo:4:8]      # model:quantize:steps
```

Writes `bakeoff/bakeoff.md` (config, image, seconds, grayRatio, inkRatio, pixel pass, vision pass) and the images.
Vision QA runs after all images.

## Troubleshooting

- **Machine slows / swap**: `doctor` shows free memory; make sure `ollama ps` is empty before generating; try `PF_IMAGE_SIZE=768`.
- **First run seems hung**: it is downloading weights (several GB). Check `~/.cache/huggingface/hub`.
- **Battery**: mflux stops at 5 % battery by default; pass `-B` through a manual mflux run if needed, but prefer mains power.
- **`mflux not importable`**: `uv tool install mflux` (or set `PF_MFLUX_PYTHON`).
- **Vision judge-error pages**: model reply was not valid JSON twice; they are blocked, not approved. Re-run or switch to `haiku`.
- **Haiku denied reading the PNG**: the provider passes `--add-dir <image dir>`; check `claude` is logged in.

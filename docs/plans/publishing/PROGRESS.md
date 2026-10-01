# Publishing Factory — progress and handoff

**Read this first after a context loss.** Then run `rtk git log --oneline` on
`feat/publishing-factory` to see what actually landed.

- **Plan and night-run loop:** [`PLAN.md`](./PLAN.md) (§5 conventions, parts P0–P6, waves)
- **Defaults for open questions:** [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md)
- **Org decisions:** `docs/plans/zibbycorp/DECISIONS.md` (D-022 is written by P0-04)

**Branch:** `feat/publishing-factory`, worktree `worktrees/publishing-factory`.
**Wave order:** Wave 1 (P0-01..03 ∥ P1 ∥ P2) → Wave 2 (P0-04 → P4 ∥ P3 ∥ P7-01..02) →
Wave 3 (P5 → P7-03..04 → P8) → Wave 4, second night (P9 ∥ P10).
**Last updated:** 2026-10-01 ~23:45 — night-1 goal met: live 24-page book built end to end on local models.
**Hard stop (operator, 2026-10-01):** if not finished by **2026-10-02 10:00**, stop and write the final state + what was not done.
**Resume at:** night 1 is closed (PR open, not merged). Next night: P5 → P7 → P8 (see board).

---

## Status board

Legend: ⬜ todo · 🟦 in progress · ✅ landed (sha) · ⛔ parked (reason)

### Part P0 — Departments become data (D-022)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P0-01 | Contract: open id, department fields, divisions | ✅ | |
| P0-02 | API: store, seed, create/update, existence checks | ✅ | |
| P0-03 | Web: departments from the query, Create department dialog | ✅ | |
| P0-04 | DECISIONS D-022 + `pub` department data | ✅ | |

### Part P1 — Engine
| Phase | Title | Status | Commit |
|---|---|---|---|
| P1-01 | `tool` phase type | ✅ | |
| P1-02 | Stage-level approval | ✅ | |
| P1-03 | Per-run cost cap + external cost seam | ✅ (ledger part of E4 deferred) | |
| P1-04 | Employee pin | ⬜ deferred (not needed for night-1 goal) | |

### Part P2 — Publishing contracts + toolkit (mock)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P2-01 | Contracts | ✅ (Zod schemas live in `libs/product-factory/src/schemas.ts`, not `libs/contracts`) | |
| P2-02 | CLI: validate-plan, render, preflight, mock provider, pixel QA | ✅ | |
| P2-03 | `produce` batch loop | ✅ | |

### Part P3 — Local generation
| Phase | Title | Status | Commit |
|---|---|---|---|
| P3-01 | mflux provider + licence allow-list | ✅ (allow-list empty, `referenceImages` ignored) | |
| P3-02 | Vision providers (ollama, haiku) | ✅ ollama live; haiku mock-tested only | |
| P3-03 | 24 GB memory choreography + ops doc | ✅ `docs/ops/product-factory.md` | |
| P3-04 | Bake-off | ✅ tool landed; z-image leg not rerun after the cache fix | |

### Part P4 — Milestone 1 (mock end-to-end)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P4-01 | Agents, skills, employees | ✅ (skills folded into agent instructions) | |
| P4-02 | Pipeline file | ✅ | |
| P4-03 | End-to-end test | ✅ `apps/api/test/coloring-book.e2e.test.ts` | |

### Part P5 — Chains and sub-pipelines
| Phase | Title | Status | Commit |
|---|---|---|---|
| P5-01 | Chain step targets | ⬜ | |
| P5-02 | `pipeline` sub-phase | ⬜ | |
| P5-03 | `book-factory` chain | ⬜ | |

### Part P7 — Product model, marketplaces, economic gate
| Phase | Title | Status | Commit |
|---|---|---|---|
| P7-01 | Contracts: Product, Edition, Marketplace, Opportunity | ⬜ | |
| P7-02 | Marketplace seed + economics tool + catalog | ⬜ | |
| P7-03 | Economic gate as phase 0 of product pipelines | ⬜ | |
| P7-04 | Swap interim `listing` phase for `catalog` | ⬜ | |

### Part P8 — Distribution (dist)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P8-00 | Operator: Etsy shop + API key, Gumroad create-API check | ⬜ (morning) | |
| P8-01 | `edition` pipeline | ⬜ | |
| P8-02 | Adapters: kdp-manual, etsy-api, gumroad-api, tpt/ucitelnice/fler-manual | ⬜ | |
| P8-03 | `product-release` chain | ⬜ | |

### Part P9 — Demand research (rnd)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P9-01 | `opportunity-scan` pipeline + `demand-to-product` chain | ⬜ | |

### Part P10 — Economics & analytics (fin)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P10-01 | Sales import, economics report, `monthly-economics` automation | ⬜ | |

### Part P11 — Batch mode + own store (later, not scheduled)

---

## Night run 1 (started 2026-10-01 evening) — goal and operator answers

**Goal (operator, verbatim intent):** in ZibbyCorp, start autonomous creation of
children's coloring books, runnable against a **local** model and against a **cloud**
model; everything configurable through the ZibbyCorp UI; an automation that runs a
pipeline **twice a week** and ends with a folder containing the book PDF as the output
artifact.

**Operator answers (binding for this night):**
- Models: operator delegated the choice. **Local** = mflux FLUX.2 klein 4B (4-bit) +
  Ollama `qwen3-vl:8b-instruct` (the thinking build broke JSON replies). **Cloud** = fal.ai FLUX.2 klein 4B (same model, ~$0.012/img,
  `FAL_KEY`) + Claude Haiku via `claude -p` for vision. Provider is a setting.
- Gates: per-phase optional human check (`approval: ask`), settable in the pipeline;
  **default fully autonomous** (no gate in the shipped pipeline).
- Output: the run sandbox only (the `book/` folder in the run dir), linked from run detail.
- Install: **allowed** — night run installs mflux (`uv tool install`) and Ollama (brew),
  pulls `qwen3-vl:8b`. (Overrides Q5.)
- Etsy: first API channel, key later (not tonight). No external human QA panel.

**Night-1 scope (goal-critical first):** P1-01 tool phase · P1-02 phase approval ·
P1-03 cost cap · P2 toolkit · P3 providers (mflux, fal, ollama, haiku, mock) · P0
departments as data + `pub` · P4 agents/pipeline/employees · automation 2×/week ·
settings via project env/secrets in UI. P5, P7–P11 are later nights.

## Defaults applied
_(Q-number · default taken · where it shows)_
- Q5 overridden by the operator: install allowed (mflux via uv, Ollama via brew, `qwen3-vl:8b` pulled).
- Gates: the shipped pipeline has **no** `approval: ask` (operator: default fully autonomous).
- Editorial QA phase dropped for night 1: plan-check (banned terms, duplicates) + visual audit cover it.
- `listing-specialist` hired into `pub` (not `dist`): a pipeline leases employees from its own department.
- Skills folded into agent instructions: the agent schema has no skills field.

## Data written
_(path · reason · subphase)_
- `.zibby/data/departments/*.json` + `_divisions.json` — the 11 seeds + `pub` + `dist` (P0-04). Written as files so the seed-once rule never sees a lone `pub.json`.
- `.zibby/data/agents/{book-creative-director,book-page-planner,book-illustrator,book-visual-qa,listing-specialist}.md` (P4-01).
- `.zibby/data/employees/employee_<agent>.json` ×5 in `pub` (Bruno, Ed, Gary, Hugo, Joe) + `employee-names.json` claims (P4-01).
- `.zibby/data/pipelines/coloring-book.pipeline.md` (P4-02).
- `.zibby/data/projects/_projects.json` + `_categories.json` — project `publishing`, path `/Users/zibar/Workspace/zibby-publishing` (non-git), env `PF_IMAGE_PROVIDER=mflux`, `PF_VISION_PROVIDER=ollama`.
- `.zibby/data/automations/coloring-book-twice-weekly.json` — cron `0 2 * * 1,4`, enabled, `theme: auto`.
- `/Users/zibar/Workspace/zibby-publishing/books.md` — the theme ledger the creative director reads and appends.

## Execution notes
- Real CLI verbs differ from PLAN §4.1: `plan check`, `produce`, `reject`, `render`, `preflight`, `finalize`, `doctor`, `bakeoff`.
- Tool phases run in the stage sandbox with repo `node_modules/.bin` first on PATH; agent stages get it last.
- Agents spawn in the project path; they read run artifacts via `$ZIBBY_RUN_DIR` (book at `$ZIBBY_RUN_DIR/book`).
- Run-id collision fix: `start()` claims the run folder exclusively (D-017 flake).
- mflux warm-up: FLUX.2 klein 4B q4, 1024², 4 steps ≈ 20 s/image, peak MLX memory 17.9 GB — never run ollama vision concurrently.
- Pre-existing red test: `AppShell renders the header's section nav…` (no shell/header file touched on this branch).

## Follow-ups found
- **Vision QA quality.** The 8B local judge is weak: it only checks subject, text, scary
  content and over-complexity (pixel QA owns gray/contours/margins). Haiku vision
  (`PF_VISION_PROVIDER=haiku`) is wired but has never run live — try it as the cloud judge.
- **Cover is line art**, not a colour cover. Fine for v1; a colour cover sells better.
- **fal.ai** never ran live (no `FAL_KEY`). Set it in project-secrets, switch
  `PF_IMAGE_PROVIDER=fal` and run once.
- `produce` with the old judge took 40 min for 24 pages (11 blocked × 3 attempts, model
  swaps). With the narrowed judge the re-run of blocked pages took < 5 min.
- Deferred: P1-04 employee pin, E4 cost ledger, editorial QA phase, real skills (folded
  into agent instructions), P5, P7–P11, Etsy key (P8-00).
- Pre-existing red web test `AppShell renders the header's section nav…` (untouched).

## PR drafts

- Night 1: https://github.com/ZibbyKarel/z.i.b.b.y/pull/71 (open, not merged)

## Operator action needed (morning)
- Review and merge the PR (never auto-merged).
- Tooling is installed on this Mac (mflux, Ollama, `qwen3-vl:8b-instruct`). The old
  `qwen3-vl:8b` (thinking build, 6 GB) can be removed: `ollama rm qwen3-vl:8b`.
- The automation `coloring-book-twice-weekly` is enabled (Mon + Thu 02:00) — it runs
  as soon as the API runs. Disable it in Automations if you do not want that yet.
- P8-00 (when convenient, not blocking): create the Etsy shop + Seller-App API key
  (store in `project-secrets`) — `etsy-api` flips from prepare-only to full on its own;
  check Gumroad live docs for `POST /v2/products` (Q16).
- Ask the accountant about CZ VAT registration before any direct (own-store) sale (Q20).

## Run log

- **2026-10-01 21:35–23:36 · live smoke, real Claude + mflux + Ollama, isolated data dir.**
  - Run 1: fake claude (vitest default `CLAUDE_BIN`) → set the real binary.
  - Run 2: parked on approval — creative director wrote `books.md` with `>>`. Fix: File
    writes rule in agent instructions (gate floor unchanged).
  - Runs 3–4: Ollama vision returned empty / `<think>` JSON (~220 s/page). Fix:
    `qwen3-vl:8b-instruct` default + `think:false` + verdict extraction (`36930fa`, `deff03a`).
  - Run 5: parked on approval — illustrator wrote `jobs.json` with `cat <<EOF`. Fix: rule in
    all five agents.
  - Run 6: parked on retries — auditor rejected the same banana three times for thin lines.
    Fix: blocking vs minor findings (`368bc5f`).
  - **Run 7 (4 pages): `done` in 5.5 min, $0.90.** interior.pdf (9 pp) + cover.pdf, checked visually.
  - Run 8: 24 pages, automation prompt (`theme: auto` → *Friendly Baby Dinosaurs*): first
    `produce` blocked 11/25 on false vision claims → narrowed the local judge (`8ab5c43`);
    auditor kept finding new pages per pass → re-audit checks only redrawn pages.
    **`done` in 56 min, $3.61 tokens, $0 images**: interior.pdf 49 pp (single-sided),
    cover.pdf with spine 0.11", preflight clean, listing.md, README.md.


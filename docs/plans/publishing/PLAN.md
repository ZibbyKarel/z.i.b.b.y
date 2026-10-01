# Product Factory — demand-driven digital products, multi-channel distribution, coloring books first (night-run plan)

> **Status:** proposed 2026-10-01, reworked from two ChatGPT drafts ("AI Coloring Book
> Factory" and "AI Product Factory & Multi-Channel Distribution") against the real
> codebase and against current KDP / marketplace / local-model facts. Written to be executed by the
> night-run loop (`docs/plans/zibbycorp/ROADMAP.md`, "The night-run loop"): Opus
> orchestrator writes the brief per subphase, Sonnet implements on the listed paths,
> ≤ 3 review rounds, one conventional commit per subphase, `PROGRESS.md` updated at once,
> park after 3 red rounds. Open questions carry a default in
> [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md); status of truth is
> [`PROGRESS.md`](./PROGRESS.md).

**Branch:** `feat/publishing-factory`, cut from `main`, worked in
`worktrees/publishing-factory` (per the operator's global rule). Every part ends with a
PR the operator reviews in the morning. **Nothing publishes to Amazon, ever.**

**Operator's hardware:** MacBook Pro **M5, 24 GB** unified memory. Local models are
sized for that (§3.3). Text agents stay on Claude (`claude -p`, Max subscription);
image generation and vision QA run locally; Haiku is the vision tie-breaker.

---

## 0. The business in one loop, the product in one paragraph

ZibbyCorp is a **digital product factory**, not a content generator. The asset is the
loop, not any single book:

```
DEMAND (research: keywords, niches, seasonality, competition)
  → OPPORTUNITY (demand score + economics: price, fees, cost cap, margin)   ← economic gate, before anything expensive
  → PRODUCT (one channel-agnostic source product: pages, images, text, cover)
  → QA (deterministic + agent; the operator's gates are the only human step)
  → EDITIONS (one package per channel: title, keywords, format, price, previews)
  → DISTRIBUTION (channel adapters; publishing itself is Tier-3)
  → SALES + COSTS (ledger + imported sales reports)
  → ANALYTICS (margin per product and per channel, what sold)
  → DEMAND (research reads the analytics)
```

Rules the loop obeys: **distribution-first** (start from where people already search),
**one source product → N editions**, **economics checked before generation**, **a
product that fails QA never reaches a marketplace**, **publishing commits the operator
→ Tier-3** (Law 3: no autonomous commit to the outside world; a one-click approval runs
the adapter where an API exists, otherwise the package is prepared for manual upload).
Product category is **configuration of the factory**: coloring book is the first
`productType`, activity pack / worksheets / printable games follow on the same engine.
Czech preschool printables are a real niche for channels without a language
restriction (Etsy, own store, Czech portals), while KDP titles start in English.

**First product, in one paragraph.** A brief (`theme, targetAge, language, pageCount,
style, storyMode, listPriceUsd, breakEvenCopies`) goes into the `pub` department's
`coloring-book` pipeline. Claude
agents do the creative work (concept + Visual Bible, 40 unique scenes, per-page
prompts, book-level visual audit, editorial QA, KDP listing). Deterministic tools do
the rest (local image generation with batch QA and retries, threshold/clean-up,
300-DPI PDF interior and wrap-around cover, KDP preflight). The run stops at three
Tier-3 gates (concept, first three real pages, final package) and at a **per-book
cost cap**. The operator uploads to KDP by hand.

---

## 1. Verdict on the ChatGPT draft — what changes and why

| ChatGPT draft | ZIBBY reality (verified) | Decision |
|---|---|---|
| `Publisher` agent running a hand-written state machine | `PipelineRunnerService` + `PhaseLoop` (`qualify` verdicts, retries, escalation, park) **is** the state machine | No Publisher agent. The pipeline is the publisher. |
| 12 roles, each an agent | Agent = position (`.zibby/data/agents/*.md`), employee = hired instance; deterministic work belongs in non-agent phases | **6 new agents + 1 reused**; everything deterministic is a `tool` phase (new, §4.1) |
| `Vectorization Specialist`, `Book Designer`, `Preflight Specialist` as agents | — | Deterministic CLI `tools/product-factory` |
| Custom `UsageRecord`, `maxProjectGenerations` | Budget ledger exists (`costUsd` per stage, project caps, `spend-past-cap` floor) but **no per-run cap, no mid-run check, no non-LLM cost source** | Extend the ledger; add `PipelineBudget` with a mid-run check (§4.2) |
| Org tree `Publishing → Children's Books → Coloring Book Factory` | `DepartmentIdSchema` is a closed `z.enum` (D-004/D-016/D-021) | **Departments become data** (D-022, Part P0) — operator's requirement. One new department `pub`; "Children's Books" is a project, the Factory is a pipeline |
| Own MCP server + `ImageGenerationProvider` with 4 providers | MCP servers are injected into *every* run; CLI via `Bash` is simpler and the loop is deterministic anyway | **No MCP.** One CLI, two image providers (`mock`, `mflux`), two vision providers (`ollama`, `haiku`) |
| Per-page loop gen → QA → retry inside an agent | Agent context would burn 40 tool calls; on 24 GB the image model and the VLM cannot both stay resident | **Batch loop in the tool**: generate all → unload → QA all → regenerate the failed set, ≤ 3 rounds |
| Research stage inside the pipeline | `market-researcher` is hired in `rnd` (Lenny); `research.pipeline.md` exists | Research = `rnd` pipeline `opportunity-scan` producing scored `Opportunity` artifacts; chain hop `rnd → pub` |
| Listing stage inside the pipeline | `copywriter`, `seo-specialist`, `content-quality-editor` hired in `com` | Listing = one channel-agnostic `listing-specialist` in `dist` with per-channel skill docs; `com` polishes copy via chain |
| Second draft: Research / Production / Distribution / QA / Analytics as org pillars | Departments become data (P0), so this is cheap | `rnd` (exists) · `pub` (new, production) · `dist` (new, channel editions + adapters) · `fin` (exists, empty → analytics/economics) · QA stays inside `pub` pipelines (the `qa` department is code QA) |
| Second draft: `Distribution Agent` publishes to marketplaces | Law 3, Tier-3 | The adapter prepares a package; **publishing is a Tier-3 approval** that triggers the API call (Etsy/Gumroad) or hands over a manual-upload checklist (KDP/TPT) |
| Second draft: `if expected_margin < minimum_margin: reject()` before generation | Budget is checked only at dispatch today | `economics` **tool phase** at the top of every product pipeline (P7-03) + the per-run cap (P1-03) |
| Second draft: own storefront as aggregator | ZIBBY web is an operator HUD, not a shop | Catalog is files first (`.zibby/data/products/`); storefront is a later separate app (P11), reads the catalog |
| `cs`, 40 pages, price from research | KDP facts §2 | **`en`, 40–60 pages, $9.99**; `cs` after verifying KDP paperback language support |
| SVG vectorization core stage | KDP accepts 300-DPI raster; thresholding fixes gray | Optional post-MVP |

---

## 2. Economics → the per-book cap

KDP facts (official KDP help pages unless noted; US marketplace, 2026-10):

| Item | Value |
|---|---|
| Print cost 8.5×11 B&W, 24–110 pages | **$2.84 flat** (€2.48 EU); per-page pricing only from 110 pages |
| Royalty since 2025-06-10 | **50 %** below $9.99 list, **60 %** at ≥ $9.99 |
| Net per copy at $6.99 / $7.99 / $8.99 / $9.98 | $0.66 / $1.16 / $1.66 / $2.15 |
| Net per copy at **$9.99** | **$3.15** |
| Title creation limit | **2 paperbacks / week / account** (third-party, Sept 2026) — 🟥 verify in the dashboard |
| AI content disclosure | mandatory for AI-generated images, even if edited |
| "Low-content" rules | **do not apply** to coloring books (free ISBN, Look Inside OK) |
| Mid-tail sales | 5–30 copies / month (blog-grade; pull real comps by hand) |

Consequences:

- Price **$9.99**. Between 40 and 110 pages print cost is identical, so page count is a
  generation-cost / value trade-off only.
- A book is produced once and sold N times, so the cap is
  **`maxCostUsd = netPerCopy × breakEvenCopies`** — default `3.15 × 5 = $15.75`,
  warn at 70 %. `breakEvenCopies` is a brief field the operator raises once sales exist.
- Expected production cost per 40-page book, local images (API list-price estimates):

| Stage | Model | USD |
|---|---|---|
| concept + Visual Bible | sonnet | 0.30 |
| page plan | sonnet | 0.30 |
| illustrator (prompt writing, no tool calls) | sonnet | 0.40 |
| image generation (mflux, local) | — | 0.00 (duration tracked) |
| vision QA, 40 pages × ≤ 3 rounds | Qwen3-VL 8B local; Haiku tie-breaker ~$0.004/img | 0.00–0.20 |
| visual audit + editorial QA | sonnet | 0.80 |
| listing | haiku | 0.10 |
| **Total** | | **≈ $2–3**, electricity ≈ €0.02–0.06 |

The cap bites on retry storms and model escalation, which is exactly where it should.
`total_cost_usd` is an API-list estimate; on Max the marginal cost is ~0, but the number
is still the right governor for model choice.

---

## 3. Facts the plan stands on (verified in the repo, 2026-10-01)

### 3.1 Org model

- `libs/contracts/src/departments/department.schema.ts:11-24` — `DepartmentIdSchema =
  z.enum([...11 ids])`, `DivisionIdSchema` (`:33`), `DEPARTMENTS` literal (`:79`);
  doc comment at `:3-7` "Fixed set … closed enum". D-016 (`DECISIONS.md:407`) and D-021
  (`:527`) reaffirm it. **~80 non-test files** use the id (mostly type-only or
  `.find` with `?? id`); three `Record<DepartmentId,…>` maps carry real data:
  `task-classifier.service.ts:184` (`DEPARTMENT_FALLBACK`), `gate.schema.ts:191`
  (`DEPARTMENT_TIER_DEFAULT`, only `inc: "ask"`), `apps/web/features/departments/
  departmentVisuals.ts:13` (`DEPARTMENT_GLYPH`). Zero department-keyed i18n keys.
- Departments API is read-only (`departments.contract.ts`: list / unowned / :id /
  roster / subtasks / POST seen). `department-seen.json` is already a tolerant
  string-keyed map.
- Store pattern to copy: `apps/api/src/shared/file-storage/entity-file-store.ts`
  (`EntityFileStore<T>`, one file per entity, atomic write, tolerant list);
  minimal subclass `apps/api/src/employees/employees.storage.service.ts`.
- Agent = `.zibby/data/agents/<id>.md` (frontmatter `model|thinking|tools|
  optionalTools|category|gates`, body = instructions). Employee =
  `{id,name,agentId,department,status,hiredAt}`; hire via `POST
  /departments/:id/employees`; `EmployeeAllocator.acquire(department, agentId)` FIFO.
- `owner-seed.ts:34` — pipeline → department backfill table (stored file wins).

### 3.2 Pipelines, chains, runner

- `pipeline.schema.ts:51` `PipelinePhaseTypeSchema = z.enum(["agent","verify"])`;
  `:71-84` `PipelinePhaseSchema` (`consumes`, `produces`, `commands`, `qualify`,
  `loop`); `:30-43` `PhaseLoopSchema` (`to, maxRetries, escalate, then, escalation[],
  driftTo`). No `approval`, no `employee`, no budget, no fan-out.
- `pipeline-runner.service.ts:1946-1958` — a `verify` phase runs in the project
  worktree/checkout (sandbox only when projectless) via `buildVerifyCommand`;
  `:1881-1882` `placeHandoff` returns early when the phase has no `consumes`;
  `:1095-1097` a passing phase with `produces` becomes the next handoff source;
  `:1104-1109` **any** failed phase takes `loop.to` / `driftTo`.
  `:1666-1672` `resolveProjectEnv` → `{...project.env, ...projectSecrets}` is the only
  per-run env seam.
- Chains are **derived from handoff rules** (`handoff/chain-view.ts`,
  `MAX_CHAIN_STEPS = 11`), department targets only, `gate: auto|ask`;
  `artifactRef` reaches only a pipeline target (`task-scheduler.service.ts:1642`).
- Runner argv (`claude-run-command.service.ts:467-504`): `-p … --permission-mode
  dontAsk --allowedTools … --agents … --settings … [--mcp-config] [--model opus|sonnet|
  haiku] [--effort]`; env = `{...process.env, ...spec.env}` (`runner-core.ts:407`).
  `mapTools` (`runner/claude-tools.ts`): `bash`→`Bash`, other tokens pass through
  (so `Bash(product-factory:*)` works as an allowed tool).
- Cost: `runner-core.ts:893-903` parses `total_cost_usd` → `StageRun.costUsd`;
  `budget/ledger.store.ts:22-33` `LedgerEntry {at, projectId?, taskId?, runRef, kind,
  type?, costUsd?}` written only for runs from a scheduled task with `projectId`
  (`task-scheduler.service.ts:2059-2067`). `BudgetService.check`
  (`budget.service.ts:125-258`) runs at dispatch only; overage → `held` +
  `spend-past-cap` approval (`POLICY.md` `floor-spend-past-cap`, human).
  `ParkedReason = approval|retries|limit|output|no-employee`.

### 3.3 Local models on a 24 GB M5 MacBook Pro (web research, 2026-10; unmeasured)

| Role | Pick | Memory | Licence | Notes |
|---|---|---|---|---|
| Image, default | **FLUX.2 klein 4B, 4-bit, via mflux** | ~6.5–10 GB resident (Qwen3-8B text encoder included) | Apache-2.0 | no negative prompt (guidance 1.0) → positive phrasing; single/dual reference editing for a recurring mascot |
| Image, challenger | **Z-Image Turbo + "Coloring Book Z" LoRA** (`c0l0ringb00k`, strength ~0.7) via mflux | ~6 GB at 8-bit | Apache-2.0 (model and LoRA) | community tests: thicker, harder black outlines than klein; decide by bake-off (P3-04) |
| Vision QA, local | **Qwen3-VL 8B Q4 via Ollama** | ~6 GB + KV | Apache-2.0 | good at wrong subject / text / clutter; weak at thin contour gaps and faint gray → pixel metrics first |
| Vision QA, tie-breaker | Claude Haiku via `claude -p --model haiku` with the PNG | — | subscription | ~$0.004/img; cost shows up as `total_cost_usd` → counts toward the cap |
| Text agents | Claude (as today) | — | — | operator's choice; a 27–35B local model would need ~20 GB and is unreliable at headless tool use |

**Never use** (non-commercial): FLUX.1 dev, FLUX.1 Kontext dev, FLUX.2 klein 9B,
FLUX.2 dev, "Coloring-Book-Flux-LoRA" (dev base). Qwen-Image 2.1 needs a separate
commercial licence. The CLI refuses a model/LoRA not on its allow-list.

Speed: klein 4B 4-bit at 1024 px is ~17–30 s on M4 Max; the M5 (non-Max, ~150 GB/s)
is estimated **50–90 s/image** → a 40-page book with ~1.4 attempts/page ≈ 50–85 min
of image time. Z-Image Turbo roughly 2× slower. **Phase-batch** on 24 GB: image
model resident for the whole batch, exit; then Ollama QA batch with
`OLLAMA_MAX_LOADED_MODELS=1`, `keep_alive: 0` after the batch. Run under
`caffeinate -i`, on mains power, lid open; expect 10–25 % thermal slowdown on a
MacBook Pro. Electricity ≈ 0.1–0.2 kWh per book.

Post-process that makes mediocre output acceptable: grayscale → Otsu/fixed threshold
(~140–200) → morphological close (seal 1–2 px gaps) → optional potrace → re-raster at
300 DPI. Deterministic pixel checks beat any VLM on gray ratio and open contours
(flood-fill from the border, connected components, ink ratio, margin emptiness).

### 3.4 Distribution channels (web research, 2026-10; official pages where reachable)

The second draft's principle, with numbers: **free distribution is not automatically
good distribution** — rank channels by `expected profit per product ÷ human minutes`.

| Channel | Fee stack | Listing API | Sales data | AI policy | Human min / edition | Role in the plan |
|---|---|---|---|---|---|---|
| **Amazon KDP** | print $2.84 + 40–50 % of list; net **$3.15** at $9.99 | none (manual upload) | KDP Reports CSV, no API | disclosure mandatory | 20–30 | **First product channel** (highest net per sale, real demand). `kdp-manual` adapter = pre-filled checklist. Cap 2 titles/week/format (from 2026-09-21, secondary sources) |
| **Etsy** (digital) | $0.20 listing + 6.5 % + payment 4 % + €0.30 (CZ seller) + Offsite Ads 12–15 % on attributed orders | **Open API v3** — Seller App tier (own shop, auto-approval); `createDraftListing → uploadListingFile → updateListing(type: download)`; 5 files × 20 MB | API (receipts) + CSV | allowed **with disclosure** (checkbox + "Designed by", enforced from 2026-01-14); the API has no documented AI field → may need a manual tick | 3–5 (+2–3 if the AI box is manual) | **First API channel.** Kids printables sell at **$1–3.50**, so economics are thin: net ≈ $1.60 on a $2.50 pack; bundle to $4.99+. Mass undifferentiated AI uploads get suspended |
| **Gumroad** | 10 % + $0.50 (30 % via Discover); merchant of record, VAT handled | REST v2; **create-product endpoint status conflicting** (404 in docs mirror vs "available since 2026-04") — verify | API + CSV + webhooks | no AI-specific rule | 2–4 if create works, else ~10 | Second API channel *if* create works; price ≥ $5 because of the fixed fee |
| **Teachers Pay Teachers** | $29 once (55 %) or $59.95/yr (80 %) + per-item fee | **none** | dashboard | no rule, but actively demotes low-quality AI (2026-08) | 15–20 | Manual only; reputational risk. `tpt-manual` later, Premium tier if used |
| **Payhip / Ko-fi / Lemon Squeezy** | 5 % (+ processing) · 5 %/0 % Gold · 5 % + $0.50 MoR | Payhip: no product API; Ko-fi: Gold-gated; LS: unverified, migrating to Stripe Managed Payments | unverified | not found | 8–10 | Own-store backends, not primary channels |
| **Stock sites** (Adobe Stock, Freepik, Vecteezy; Shutterstock bans AI) | royalty / pool ≈ $0.04–0.07 per download | portal/FTP/CSV only | reports | allowed with labeling (except Shutterstock) | ~5 | SVG/clipart only, later |
| **Own store** (Stripe CZ 1.5 % + 6.50 Kč, or MoR ≈ 5–6.4 %) | — | own | own | n/a | 2–3 | P11; MoR removes the EU VAT OSS burden (€10k cross-border threshold, then buyer-country VAT) |
| **Czech niche**: Učitelnice.cz (author keeps 70 %, school accounts), Fler.cz (11 %, CZ/SK address) | — | none | dashboard | unknown — ask | ~10 | Where **Czech preschool worksheets** sell; manual adapters |

Open verifications before building adapters: Etsy API's AI-disclosure field; Gumroad
create endpoint; whether the operator's Etsy shop exists (API key needs an active shop);
Učitelnice.cz AI policy.

---

## 4. Target design

### 4.1 Pipeline `coloring-book` (department `pub`, complexity `deep`)

```yaml
---
name: Coloring Book
department: pub
complexity: deep
budget: { maxCostUsd: 15.75, warnAtPct: 70 }        # P1; overridable per run from the brief
phases:
  - { id: concept,  type: agent, agent: book-creative-director, consumes: task.md,
      produces: visual-bible.md, model: sonnet, thinking: high, approval: ask }      # gate 1
  - { id: plan,     type: agent, agent: book-page-planner, consumes: visual-bible.md,
      produces: content-plan.md, model: sonnet, thinking: medium }
  - { id: plan-check, type: tool, consumes: content-plan.md, produces: content-plan.md,
      commands: ["product-factory validate-plan content-plan.md"] }
  - { id: illustrate, type: agent, agent: book-illustrator, consumes: content-plan.md,
      produces: jobs.json, model: sonnet, thinking: medium }                         # prompts only
  - { id: pilot,    type: tool, consumes: jobs.json, produces: pilot-report.md, approval: ask,
      commands: ["product-factory produce jobs.json --pages 1-3 --out book/ --report pilot-report.md"] }  # gate 2
  - { id: produce,  type: tool, consumes: jobs.json, produces: produce-report.md,
      commands: ["product-factory produce jobs.json --out book/ --rounds 3 --report produce-report.md"] }
  - { id: visual-audit, type: agent, agent: book-visual-qa, consumes: produce-report.md,
      produces: visual-audit.md, model: sonnet, thinking: medium, qualify: true,
      loop: { to: illustrate, maxRetries: 2, escalate: false, then: park, driftTo: concept } }
  - { id: render,   type: tool, consumes: visual-audit.md, produces: render-report.md,
      commands: ["product-factory render --plan content-plan.md --book book/ --report render-report.md"] }
  - { id: editorial, type: agent, agent: book-editorial-qa, consumes: render-report.md,
      produces: editorial.md, model: sonnet, thinking: medium, qualify: true,
      loop: { to: plan, maxRetries: 1, escalate: true, then: park, driftTo: concept,
              escalation: [{ model: opus, thinking: high }] } }
  - { id: preflight, type: tool, consumes: editorial.md, produces: preflight-report.md,
      commands: ["product-factory preflight book/interior.pdf book/cover.pdf --plan content-plan.md --report preflight-report.md"] }
  - { id: catalog,  type: tool, consumes: preflight-report.md, produces: product.json,
      commands: ["product-factory catalog add --type coloring-book --book book/ --plan content-plan.md --out product.json"] }  # P7: source product record
outputs:
  - { type: file, from: product.json, dest: vault, to: "Products/{slug}/product.md" }
---
```

Listing is **not** in the production pipeline any more: the `dist` department's
`edition` pipeline (P8) takes `product.json` through the chain and emits one edition per
channel. Until P7 lands, Milestone 1 ends at `preflight` with a `listing` agent phase as
in the first draft (kept in P4-02 as a temporary last phase, removed by P7-04).

- **`tool` phase (new, P1-01):** like `verify` but runs **in the stage sandbox**, honours
  `consumes`/`produces`, forbids `agent`, costs nothing, and on a non-zero exit takes
  `loop` like any phase. `verify` keeps its meaning (checks the project checkout).
- Gate 3 (final package) needs no field: the run ends `done`, the operator reads
  `preflight-report.md` + `listing.md` and uploads by hand.
- The illustrator writes **prompts only** (`jobs.json`); `produce` owns the whole
  generate → threshold → pixel QA → VLM QA → regenerate loop. The `visual-audit` agent
  reads the report and the approved PNGs (Claude Code `Read` on PNG) and verdicts the
  *book* (style drift, duplicate compositions, mascot consistency).
- `task.md` carries the brief as a YAML block; `BookBriefSchema` lives in
  `libs/contracts/src/publishing/`.

### 4.2 Engine additions (generic, not book-specific)

| # | Change | Why the factory needs it |
|---|---|---|
| E1 | `type: tool` phase | deterministic transform steps in the sandbox |
| E2 | `approval: "ask"` on a phase → park `approval`, `stage-approval` approval | gates 1 and 2 |
| E3 | `PipelineBudget {maxCostUsd, warnAtPct}` + mid-run check → park `budget`, `spend-past-cap` approval; per-run override | the per-book cap |
| E4 | `StageRun.externalCostUsd` summed from `<stageDir>/costs.jsonl`; ledger gets `pipelineId`, `pipelineRunId`, `externalCostUsd`; **every** finished pipeline run is ledgered | Haiku/API image costs count; manual runs become visible |
| E5 | `employee?: EmployeeId` pin on an agent phase | operator asked for agent-level routing |
| E6 | Chain steps target `department \| pipeline \| agent`; `artifactRef` → agent runs | `rnd:research → pub:coloring-book → com:content-piece` |
| E7 | `type: pipeline` sub-phase (nested run in its own department; cost + approvals roll up) | multi-level composition across departments |
| — | fan-out/fan-in over items | **deferred**: per-page parallelism lives in the tool |

### 4.3 Departments as data (D-022)

`.zibby/data/departments/<id>.json`, one file per department, seeded once from today's
constant; `_divisions.json` single manifest. `DepartmentIdSchema = z.string().regex(
/^[a-z][a-z0-9-]{1,23}$/)`. The three `Record` maps become fields on the department
(`icon`, `fallback`, `tierDefault`). API gains `POST /departments` and
`PATCH /departments/:id`; web gains a *Create department* dialog (copy of
`NewPipelineDialog`). Runtime "department exists" checks replace the enum at the trust
boundaries (hire, pipeline write, task target, handoff/chain/gate-rule writes); read
guards become tolerant (`agents.storage.service.ts:186`, `vault.service.ts:163`).

### 4.4 Organisation

Two new departments (data files, P0), two existing ones take new roles:

| Department | Role in the loop | Owns |
|---|---|---|
| `rnd` (exists) | Demand: keywords, niches, seasonality, competition → scored `Opportunity` artifacts | `opportunity-scan` pipeline (P9-01); `market-researcher` + new `demand-analyst` |
| **`pub` — Publishing** (new; code `PUB`, division `business`, icon `book`, fallback `primary`; mandate (cs): "Vyrábí prodejné digitální produkty z příležitosti — knihy, sešity, tiskoviny. Vlastní výrobní pipeline, jejich jednotkovou cenu a kontrolu kvality.") | Production + QA | `coloring-book`, later `activity-pack`, `worksheets`; the 5 production agents |
| **`dist` — Distribution** (new; code `DIST`, division `business`, icon `send`, fallback `primary`; mandate (cs): "Balí jeden zdrojový produkt do edic pro konkrétní tržiště a připravuje publikaci. Publikuje jen po schválení operátorem.") | Editions + channel adapters + publication packages | `edition` pipeline per channel (P8), `listing-specialist`, `distribution-coordinator`, marketplace data |
| `fin` (exists, empty) | Economics + analytics: cost per product, sales imports, margin per channel, feedback to `rnd` | `product-analyst`, `sales-import` tool, monthly `economics.md` (P10) |
| `com` (exists) | Copy polish of listings, later storefront content | chain hop `dist → com` |

**Agents (positions)**, category `Specialized Domains`, template `copywriter.md`.
Inspired by `kindle-book-agency` (Niche Researcher → Ghostwriter / Cover Designer /
Marketing → Developmental Editor → Proofreader / Formatter → Compiler) and
`Claude-Book` (consistency-check subagents + quality gate); no upstream coloring-book
agent definitions exist.

| Agent | model/thinking | tools | produces |
|---|---|---|---|
| `book-creative-director` | sonnet/high | Read, Write, Glob, Grep, WebSearch | `visual-bible.md` — concept, age rules, style spec (line weight, no gray, enclosed shapes), mascot spec, cover concept |
| `book-page-planner` | sonnet/medium | Read, Write | `content-plan.md` + `pages.json` block — N unique scenes, story order, objects, optional one-line caption |
| `book-illustrator` | sonnet/medium | Read, Write | `jobs.json` — per-page positive prompts from the Visual Bible, reference ids, seeds; rewrites prompts for blocked pages on loop |
| `book-visual-qa` | sonnet/medium | Read (PNG), Write | `visual-audit.md` `<verdict>` — book-level style drift, duplicates, mascot consistency |
| `book-editorial-qa` | sonnet/medium | Read, Write | `editorial.md` `<verdict>` — captions (spelling, diacritics, age fit), story continuity, scene ↔ image, no brand/IP leakage |
| `listing-specialist` (`dist`) | haiku/low | Read, Write, WebSearch | `edition.json` + `listing.md` per channel — title, description, keywords/tags, categories, price, previews list, AI-disclosure answers; channel rules come from the skill docs |
| `distribution-coordinator` (`dist`) | sonnet/medium | Read, Write, Bash(`product-factory:*`) | `publication-package.md` — runs the channel adapter in *prepare* mode, checks channel limits (KDP 2/week, Etsy file limits), writes the Tier-3 approval payload; never publishes itself |
| `demand-analyst` (`rnd`) | sonnet/medium | Read, Write, WebSearch | `opportunities.json` — scored opportunities (demand signals, competition, seasonality, suggested productType/channel/price) |
| `product-analyst` (`fin`) | haiku/low | Read, Write | `economics.md` per product and per month — cost (ledger) vs sales (imports) vs fees → margin, what to make more of |
| *(reused)* `market-researcher` (`rnd`) | — | — | advisory `research.md` via chain hop |

Hire one employee per new position: 5 into `pub`, 2 into `dist`, 1 into `rnd`, 1 into
`fin`. Skills (reference docs, no code): `kdp-paperback-specs`,
`coloring-book-style-rules`, `kdp-listing`, `etsy-listing`, `tpt-listing`,
`gumroad-listing`, `marketplace-ai-policies`, `preschool-activity-design`.

### 4.5 Deterministic toolkit — `tools/product-factory/` (TypeScript CLI, bin `product-factory`)

| Command | Does | Libs |
|---|---|---|
| `validate-plan` | Zod `PagePlanSchema`, page count vs brief, duplicate scenes (normalised), banned brand/IP terms | zod |
| `produce` | batch loop: `generate` (provider) → `threshold` → pixel QA → VLM QA → regenerate failed → ≤ `--rounds`; writes `illustrations/<page>/attempt-NNN.png`, `approved.png`, `meta.json` (provider, model, seed, prompt, durationMs, costUsd, qa); appends `costs.jsonl`; report with `<verdict>` and blocked pages | sharp, execa |
| `render` | 300-DPI PNGs at trim with KDP margins (gutter 0.375" ≤ 150 pp, outer 0.25" no-bleed), caption with embedded font, cover wrap `2×trim + spine(pages × 0.002252") + 0.25"`, fixed metadata dates → byte-identical PDF | pdf-lib |
| `preflight` | page count vs plan, page boxes, image DPI ≥ 300, fonts embedded, no transparency, no blank interior page, cover dimensions → `{passed, errors[], warnings[]}` | pdf-lib, pdfjs-dist |
| `bakeoff` | same 10 prompts through every allowed image model, grid PNG + metrics, for the operator's morning pick | — |

Providers (`src/providers/image/{mock,mflux}.ts`, `src/providers/vision/{ollama,haiku}.ts`),
config `~/.zibby/coloring-book.json` or env: `imageProvider`, `imageModel`,
`visionProvider`, `visionModel`, `concurrency` (1 on 24 GB), `allowedModels` (licence
allow-list, baked in). `mock` draws a deterministic placeholder with the page id and
passes pixel QA — CI never needs a model.

---

## 5. Shared conventions (all parts)

- Branch `feat/publishing-factory`, worktree `worktrees/publishing-factory`; one commit
  per subphase, conventional message, `Co-Authored-By: Claude Fable 5.1
  <noreply@anthropic.com>`; stage only the subphase's paths.
- Contract first (`libs/contracts`), then api, then web; scoped validation per
  `docs/ops/validation-policy.md` (prettier + eslint on touched files, the related
  vitest file, incremental tsc); repo-wide checks only before the PR.
- New Zod is `.strict()` where the existing sibling is; every new field documented with
  a doc comment in the style of the file.
- Tests select by `data-testid` enums (DS rule); API tests are scoped vitest; no paid
  model call in any test — `mock` providers only.
- Data under `.zibby/data` is the operator's source of truth: the night run may **add**
  files (departments seed, agents, skills, pipeline, employees) but never rewrites
  existing ones except the explicit migrations listed below. Record every data write in
  `PROGRESS.md` → "Data written".
- Hard invariants (each has a test): I-1 no auto-publish path exists; I-2 a run whose
  cost exceeds its cap parks within one stage; I-3 a `tool` phase never spawns `claude`;
  I-4 the CLI refuses a model outside the allow-list; I-5 `render` is byte-identical
  across two runs; I-6 unknown department id → 404/422 at every write boundary, tolerated
  at every read boundary; I-7 existing 11 department ids keep working after the seed.
- Known pre-existing reds: see `docs/plans/zibbycorp/ROADMAP.md` "Known pre-existing
  reds" and the memory notes on the nondeterministic full suite — never gate a subphase
  on `pnpm test` repo-wide.

---

# Part P0 — Departments become data (D-022)

**Verified current state:** §3.1. Blocking everything else only logically (the `pub`
department); technically P1–P3 are independent and run in parallel waves.

## P0-01 — Contract: open id, department fields, divisions

### Contract additions (exact Zod) — `libs/contracts/src/departments/department.schema.ts`

```ts
/** Open set since D-022: departments are data files, created on demand. */
export const DepartmentIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,23}$/);
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

export const DivisionIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,23}$/);
export const DivisionSchema = z.object({ id: DivisionIdSchema, name: z.string().min(1), order: z.number().int() }).strict();

export const DepartmentFallbackSchema = z.enum(["primary", "orchestrator"]);
export const DepartmentTierDefaultSchema = z.enum(["ask", "deny", "allow", "notify"]).nullable();

export const DepartmentSchema = z.object({
  id: DepartmentIdSchema,
  code: z.string().regex(/^[A-Z0-9]{2,6}$/),
  name: z.string().min(1).max(64),
  tagline: z.string().max(120),
  mandate: z.string().max(2000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  division: DivisionIdSchema,
  /** Design-system icon name shown on the org map and chips (was DEPARTMENT_GLYPH). */
  icon: z.string().min(1).default("folder"),
  /** Stage-2 classifier terminal fallback (was DEPARTMENT_FALLBACK). */
  fallback: DepartmentFallbackSchema.default("primary"),
  /** Default gate decision for this department's actions (was DEPARTMENT_TIER_DEFAULT). */
  tierDefault: DepartmentTierDefaultSchema.default(null),
  createdAt: z.string().datetime().optional(),
}).strict();

export const CreateDepartmentInputSchema = DepartmentSchema.omit({ createdAt: true });
export const UpdateDepartmentInputSchema = DepartmentSchema.omit({ id: true, createdAt: true }).partial();

/** Seed only — written to `.zibby/data/departments/` on first boot, never read at runtime. */
export const DEPARTMENT_SEED: readonly Department[] = [ /* today's 11 + icon/fallback/tierDefault folded in */ ];
export const DIVISION_SEED: readonly Division[] = [ /* today's 4 */ ];
```

`departments.contract.ts`: add `createDepartment: POST /departments` (201 / 409 on
duplicate / 422), `updateDepartment: PATCH /departments/:id` (200 / 404 / 422),
`listDivisions: GET /departments/divisions`. Remove `DEPARTMENT_TIER_DEFAULT` from
`gate.schema.ts` (consumers read `department.tierDefault`).

### Change list

- `department.schema.ts` as above; delete the "closed enum" doc comment; export
  `DEPARTMENT_SEED` and `DIVISION_SEED`.
- `gate.schema.ts:176,191` — `department: DepartmentIdSchema` stays (now a string);
  drop the Record.
- Every other contract usage (§3.1 list: employees, agents, pipelines, tasks,
  task-parents, task-run, handoff, registries, memory, activity, approvals, briefing)
  compiles unchanged — the type widened.

### Tests (scoped vitest)

`libs/contracts/src/departments/department.schema.test.ts`: id regex accepts the 11
seed ids and `pub`, rejects `Dev`, `a`, `x/y`; defaults applied; `.strict()` rejects
unknown keys; seed arrays parse.

### Commit
`feat(contracts): open DepartmentId, department fields icon/fallback/tierDefault, create/update routes (D-022)`

## P0-02 — API: `DepartmentsStorageService`, seed, create/update, existence checks

### Change list

- New `apps/api/src/departments/departments.storage.service.ts` extends
  `EntityFileStore<Department>`: `fileExt ".json"`, `idRegex` = the schema regex, dir
  token `DEPARTMENTS_DIR` → `.zibby/data/departments/` (listing skips the existing
  `findings/` subdirectory — directories are not entities). `ensureSeeded()` on module
  init: if no `*.json` present, write `DEPARTMENT_SEED` and `_divisions.json`. Stored
  file always wins (same rule as `owner-seed.ts`).
- `departments.service.ts:127,233,260,302,347` — read from the store (`list()`,
  `get(id)`), add `create`, `update`, `assertExists(id)` (throws
  `DepartmentNotFoundError`).
- `departments.controller.ts` — the two new routes + divisions.
- `task-classifier.service.ts:184,314-316,774` — `(await depts.get(id))?.fallback ??
  "orchestrator"`; delete `DEPARTMENT_FALLBACK`.
- `gate-evaluator.service.ts` — read `tierDefault` from the department.
- `chat-mcp.controller.ts:249-251` — tool schema `z.string()`; validate against the
  store at call time.
- Write-boundary checks (`assertExists`): `employees.service.ts:148` (already a find →
  switch to the store), `pipelines.controller.ts` (422 on unknown department),
  `task-scheduler.service.ts` department target resolution, `handoff` rule/chain
  writes (`validateChainInput`), gate-rule writes.
- Read tolerance: `agents.storage.service.ts:186`, `vault.service.ts:163` — accept any
  id matching the regex.
- `owner-seed.ts`, `signal-kind.service.ts:74`, `handoff.service.ts:223,265`,
  `roadmap-gate.service.ts:1012`, `task-scheduler.service.ts:2091`,
  `claude-cli-router.ts:237`, `vault-seed.service.ts:32`, `self-knowledge.*` — swap the
  constant for the store (`?? id` fallbacks stay).
- Migration: none for existing data (ids unchanged, I-7). `pnpm check:self-knowledge`
  regenerates its note (departments list now comes from the store — run the generator).

### Tests
`apps/api/test/departments.e2e.test.ts`: seed on empty dir; create `pub` → 201, listed,
roster empty; duplicate → 409; bad id → 422; hire into unknown department → 404;
pipeline write with unknown department → 422; agent file with unknown department still
lists. Existing department/employee e2e stay green.

### Commit
`feat(api): departments as data — file store, seed, create/update, existence checks (D-022)`

## P0-03 — Web: departments from the query, Create department dialog

### Change list

- `features/departments/queries/useDepartmentsQuery.ts` (exists) + new
  `useDivisionsQuery`; new `features/departments/departmentLookup.ts` →
  `lookup(data).get(id)` with fallback `{name: id, code: id.toUpperCase(), color:
  neutral token, icon: "folder"}`.
- Replace static `DEPARTMENTS` / `DIVISIONS` / `DEPARTMENT_GLYPH` usages (§3.1 list,
  ~30 files: `OrgMapScreen.tsx:51,64,146-147`, selects in `NewTaskScreen`,
  `TasksListScreen`, `PeopleScreen`, `HireEmployeeScreen`, `AgentEditBasics`,
  `ChainEditor` (`DEFAULT_DEPARTMENTS` → first two from data), lookups in tasks /
  archive / activity / approvals / runs / chains / ledger / gates / knowledge /
  registries / pipelines). Delete `departmentVisuals.ts` and its test.
- `features/departments/components/NewDepartmentDialog.tsx` (copy
  `NewPipelineDialog`; fields id, code, name, tagline, mandate, color, division, icon;
  `@zibby/forms`), mounted on the org map top-right per the interaction grammar;
  mutation `useCreateDepartmentMutation`.
- i18n: new keys for the dialog in `cs.json`/`en.json` (parity test).

### Tests
`NewDepartmentDialog.test.tsx` (testid enum, submit → mutation called with the parsed
body); `departmentLookup.test.ts` (fallback shape); existing screen tests updated to
mock the query instead of importing the constant.

### Commit
`feat(web): departments from the API, Create department dialog, drop static department maps (D-022)`

## P0-04 — DECISIONS + data: D-022 and the `pub` department

- `docs/plans/zibbycorp/DECISIONS.md`: **D-022 — Departments are data (2026-10-01,
  operator)**: supersedes the closed-enum clauses of D-004, D-016, D-021; id regex;
  seed-once rule; creation is an operator action (UI/API), never autonomous (an
  `agent-factory` proposal for a department is a later, Tier-3 feature).
- Write `.zibby/data/departments/pub.json` and `dist.json` (§4.4).
- `owner-seed.ts`: `coloring-book → pub`, `edition → dist`, `opportunity-scan → rnd`.

### Commit
`docs(decisions): D-022 departments are data; data(departments): add pub, dist`

---

# Part P1 — Engine: tool phase, stage approval, per-run cost cap, external cost, employee pin

**Verified current state:** §3.2. Independent of P0 (type widening only).

## P1-01 — `tool` phase type

### Contract additions — `pipeline.schema.ts`

```ts
/** `tool`: deterministic shell transform run IN THE STAGE SANDBOX (consumes → commands → produces);
 *  `verify`: deterministic checks run in the project checkout. Neither spawns a model. */
export const PipelinePhaseTypeSchema = z.enum(["agent", "verify", "tool"]);
```
superRefine: `tool` requires `commands` (≥ 1) and `produces`, forbids `agent`/`model`/
`thinking`/`qualify`; `consumes` optional.

### Change list
- `pipeline-runner.service.ts:1950` — `if (phase.type === "verify" || phase.type ===
  "tool")` → `buildVerifyCommand({commands, projectChecks: undefined, spawnCwd:
  phase.type === "tool" ? cwd : spawnCwd})`; `:1076` `verifyCommands` only for
  `verify`; `placeHandoff` already places when `consumes` is set; `:1097` already
  promotes `produces`. Stage record gets `costUsd: 0`.
- Web `PipelineStageTimeline` / pipeline editor: render `tool` like `verify` with a
  wrench glyph; phase-type select gains the option.

### Tests
`pipeline-runner` unit: a `tool` phase runs in the sandbox cwd, its `produces` becomes
the next handoff, a non-zero exit takes `loop.to`, no `claude` spawn (I-3). Schema
test for the refine.

### Commit
`feat(pipelines): tool phase — deterministic sandbox transform between agent stages`

## P1-02 — Stage-level approval

### Contract additions
```ts
// PipelinePhaseSchema
/** Park after this phase's `produces` is written and wait for the operator (Tier-3). */
approval: z.enum(["ask"]).optional(),
// approval.schema.ts: ApprovalActionSchema gains "stage-approval"; payload { pipelineRunId, phaseId, producesPath }
```

### Change list
- Runner `:1070-1101`: after promoting `produces`, if `phase.approval === "ask"` →
  create approval (`action: "stage-approval"`, `risk: "low"`), set `parkedReason:
  "approval"`, stop the loop; `resume()` continues at `cursor` (the existing approval
  resume path).
- `gate-rules.json`: add `gr-stage-approval` `{match:[{type:"action",action:
  "stage-approval"}], decision:"ask", resolve:{type:"human"}}` (system rule).
- Web approvals sheet: render the produces file (markdown) inline, "Approve / Reject".

### Tests
Runner: phase with `approval: ask` parks exactly once, approve → next phase runs,
reject → run `failed`. Gate rule e2e.

### Commit
`feat(pipelines): per-phase approval gate (approval: ask) backed by stage-approval approvals`

## P1-03 — Per-run cost cap + external cost seam

### Contract additions
```ts
// pipeline.schema.ts
export const PipelineBudgetSchema = z.object({
  maxCostUsd: z.number().positive(),
  warnAtPct: z.number().int().min(1).max(100).default(70),
}).strict();
// PipelineSchema: budget: PipelineBudgetSchema.optional()
// pipeline-run.schema.ts: StageRun gets externalCostUsd: z.number().nonnegative().optional();
//   PipelineRun gets budget: z.object({ maxCostUsd, warnAtPct, spentUsd: z.number().nonnegative() }).optional()
// ParkedReasonSchema gains "budget"
// budget ledger (api-internal LedgerEntry): pipelineId?, pipelineRunId?, externalCostUsd?
```

### Change list
- `PipelineRunner.start(pipelineId, …, { budget?: PipelineBudget })` — snapshot
  `pipeline.budget` or the override onto `run.budget`.
- After every stage completes (`:1070` block and the failure block): read
  `<stageDir>/costs.jsonl` (lines `{at, source, model, costUsd, durationMs}`), sum into
  `stageRun.externalCostUsd`; `run.budget.spentUsd = Σ(costUsd + externalCostUsd)`;
  ≥ `warnAtPct` → activity `budget-warn` once; `> maxCostUsd` → `parkedReason:
  "budget"`, approval `spend-past-cap` with `metrics {costUsd: spent, capUsd}` (resolved
  by the existing `floor-spend-past-cap` human floor); approve → raise cap by the
  operator's amount and resume; reject → fail.
- `BudgetService.recordCost` — call for **every** finished pipeline run (also manual /
  projectless), with `pipelineId`, `pipelineRunId`, `externalCostUsd`.
- Web: `RunDetail` cost cell shows `spent / cap`; `PipelineStageTimeline` shows
  external cost per attempt; `LedgerSpendScreen` groups by pipeline.

### Tests
Runner: a run whose second stage's `costs.jsonl` pushes `spentUsd` over the cap parks
with `budget` before the third stage dispatches (I-2); warn fires once; manual run
writes a ledger line. Ledger store round-trip with the new fields.

### Commit
`feat(budget): per-pipeline-run cost cap with mid-run check, external cost seam, ledger attribution`

## P1-04 — Employee pin

```ts
// PipelinePhaseSchema: employee: EmployeeIdSchema.optional()  // agent phases only; must be an active employee of `agent`
```
`EmployeeAllocator.acquireById(employeeId, {runId})` (FIFO per employee); fallback to
position if the employee is fired → activity note. Pipeline write validates the pin
(422). Web phase editor: employee select filtered by agent + department.

### Commit
`feat(pipelines): pin a named employee on an agent phase`

---

# Part P2 — Publishing contracts + deterministic toolkit (mock only)

**Verified current state:** nothing exists; `tools/` holds `docs-sync`, `self-knowledge`,
`check-names.mjs`, `check-deps.sh`. New workspace package `tools/product-factory`
(`@zibby/product-factory`, bin `product-factory`, vitest project `product-factory`).

## P2-01 — Contracts

`libs/contracts/src/publishing/{book-brief,page-plan,illustration-job,qa-result,
preflight-report}.schema.ts`:

```ts
export const BookBriefSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  theme: z.string().min(1).max(200),
  targetAge: z.object({ min: z.number().int().min(1).max(12), max: z.number().int().min(1).max(12) }).strict(),
  language: z.enum(["en", "de", "fr", "es", "it", "cs"]).default("en"),   // cs gated by OPEN-QUESTIONS Q2
  pageCount: z.number().int().min(24).max(110),
  style: z.enum(["cute_simple_line_art", "bold_outline_cartoon", "storybook_line_art"]),
  storyMode: z.boolean().default(false),
  mascot: z.object({ name: z.string(), description: z.string() }).strict().optional(),
  trim: z.literal("8.5x11").default("8.5x11"),
  bleed: z.literal(false).default(false),
  listPriceUsd: z.number().positive().default(9.99),
  breakEvenCopies: z.number().int().positive().default(5),
}).strict().refine(b => b.targetAge.min <= b.targetAge.max);

export const PagePlanSchema = z.object({ pageNumber: z.number().int().positive(), scene: z.string().min(1),
  characters: z.array(z.string()), objects: z.array(z.string()), caption: z.string().max(120).optional(),
  difficulty: z.number().int().min(1).max(3) }).strict();
export const ContentPlanSchema = z.object({ pages: z.array(PagePlanSchema).min(1) }).strict();

export const IllustrationJobSchema = z.object({ pageNumber: z.number().int().positive(), prompt: z.string().min(1),
  referenceIds: z.array(z.string()).default([]), seed: z.number().int().optional() }).strict();
export const IllustrationJobsSchema = z.object({ visualBibleRef: z.string(), jobs: z.array(IllustrationJobSchema).min(1) }).strict();

export const VisualQaIssueTypeSchema = z.enum(["gray-area","open-contour","too-complex","small-detail",
  "wrong-subject","style-inconsistent","text-artifact","unsafe-content","margin-violation"]);
export const VisualQaResultSchema = z.object({ pageNumber: z.number().int(), attempt: z.number().int(), passed: z.boolean(),
  pixel: z.object({ grayRatio: z.number(), inkRatio: z.number(), openRegions: z.number(), marginInk: z.number() }).strict(),
  issues: z.array(z.object({ type: VisualQaIssueTypeSchema, severity: z.enum(["low","medium","high"]), description: z.string() }).strict()),
  judge: z.enum(["pixel","ollama","haiku"]) }).strict();

export const PreflightReportSchema = z.object({ passed: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()),
  pageCount: z.number().int(), trim: z.string(), spineIn: z.number() }).strict();
```

### Commit
`feat(contracts): publishing schemas — BookBrief, ContentPlan, IllustrationJobs, VisualQaResult, PreflightReport`

## P2-02 — CLI skeleton, `validate-plan`, `render`, `preflight`, `mock` provider

Change list: package scaffold (`src/cli.ts` with `commander`, already a dependency? —
if not, `node:util.parseArgs`); `render` per §4.5 with fixed `CreationDate`/`ModDate`
(I-5); `preflight` per §4.5; `mock` image provider (sharp-drawn placeholder: thick
black rounded shapes + page number, pure B/W); `threshold` + pixel metrics module
(`grayRatio` = share of pixels in 40–215; `openRegions` via flood fill from border on
the inverted ink mask; `marginInk` = ink inside the KDP safe margin).
Fixture `tools/product-factory/fixtures/farm-animals/{brief.md,content-plan.md,jobs.json}`
(10 pages).

### Tests
`render.test.ts`: two renders of the fixture are byte-identical; page boxes 612×792 pt;
`preflight.test.ts`: fixture passes; a 200-DPI image fails; `validate-plan.test.ts`:
duplicate scene and banned term fail; `pixel-qa.test.ts`: synthetic gray image fails,
open circle counts as open region.

### Commit
`feat(tools): coloring-book CLI — validate-plan, render, preflight, mock image provider, pixel QA`

## P2-03 — `produce` batch loop (mock image + pixel QA only)

`produce jobs.json --out book/ --rounds 3 [--pages a-b] --report X.md`:
round r: generate missing/failed pages with `imageProvider` → threshold → pixel QA →
(vision QA if configured) → mark passed; loop; write `produce-report.md` with
`<verdict>pass</verdict>` when every page passed, else `gap` and the blocked list;
append `costs.jsonl`. Never overwrite an attempt.

### Tests
Mock run of the 10-page fixture ends in one round, report `pass`, 10 `approved.png`,
`costs.jsonl` has 10 lines with `costUsd: 0`; a provider that fails page 3 twice →
3 attempts recorded, `gap`.

### Commit
`feat(tools): coloring-book produce — batched generate → QA → retry loop`

---

# Part P3 — Local generation on the M5 (mflux + Ollama) and the bake-off

**Verified current state:** nothing local is installed by the repo. These subphases
touch no ZIBBY source — only the CLI package and an ops doc. The night run may install
tooling in the user space (`uv tool install mflux`, `ollama pull qwen3-vl:8b`) — see
OPEN-QUESTIONS Q5 for the default.

## P3-01 — `mflux` image provider + licence allow-list

- `src/providers/image/mflux.ts`: shells out to `mflux-generate` (`--model
  flux2-klein-4b -q 4 --steps 4 --width 2550 --height 3300` or 1024² then upscale ×2.5
  via sharp — decide by bake-off), one process per batch (`--batch` / prompt file if
  supported by the installed mflux; else sequential calls in one child), seed per job,
  reference images for mascot pages (`--image-paths`), writes `meta.json`.
- Allow-list `ALLOWED_IMAGE_MODELS = ["flux2-klein-4b", "flux1-schnell",
  "z-image-turbo"]`, `ALLOWED_LORAS = ["renderartist/Coloring-Book-Z-Image-Turbo-LoRA"]`
  — anything else → exit 3 with the licence reason (I-4).
- `doctor` subcommand: checks `mflux-generate`, `ollama`, model presence, free memory
  ≥ 12 GB, prints the plan.

## P3-02 — Vision providers

- `ollama`: `POST /api/chat` with `format` = `VisualQaResultSchema` JSON schema, image
  base64, model `qwen3-vl:8b`, `keep_alive: 0` on the last page of the batch; prompt
  from `coloring-book-style-rules`.
- `haiku`: `claude -p --model haiku --output-format json` with the PNG path and the same
  schema prompt; parse `total_cost_usd` into `costs.jsonl` (`source: "vision"`).
- Policy in `produce`: pixel QA first (hard fail on `grayRatio > 0.02`,
  `openRegions > 0`, `marginInk > 0`); then `visionProvider`; a `medium`-severity
  local verdict on a page is re-judged by `haiku` when `visionTieBreaker: haiku`.

## P3-03 — Memory choreography for 24 GB

`produce` runs image generation for the whole round in one child process, waits for
exit, then runs vision QA for the round; `concurrency` default 1; `doctor` warns when
Ollama already holds a model. Ops doc `docs/ops/coloring-book-local.md`: install
steps, `caffeinate -i`, power, expected s/page, how to read `costs.jsonl`.

## P3-04 — Bake-off (night) → operator pick (morning)

`product-factory bakeoff --prompts fixtures/bakeoff/10-prompts.json --models
flux2-klein-4b,z-image-turbo+coloring-lora --out bakeoff/` → grid PNG per model,
`metrics.json` (s/image, grayRatio, openRegions before/after threshold, VLM pass rate).
Written to `PROGRESS.md` → "Operator action needed (morning)". Default if the operator
does not pick: the model with the higher VLM pass rate after threshold.

### Tests (P3)
Provider unit tests with a stubbed child process (argv shape, allow-list refusal,
`meta.json` content); Ollama provider with a stubbed HTTP server (schema-conformant
response parsed, `keep_alive: 0` sent). No real model in CI.

### Commits
`feat(tools): mflux image provider with commercial-licence allow-list` ·
`feat(tools): ollama and haiku vision QA providers` ·
`docs(ops): local coloring-book generation on Apple Silicon` ·
`feat(tools): coloring-book bakeoff`

---

# Part P4 — Org data, pipeline, first end-to-end book (mock) — **Milestone 1**

**Depends on:** P0-04 (`pub` exists), P1-01..03, P2.

## P4-01 — Agents, skills, employees
Write the 5 production agent `.md` files plus `listing-specialist` (§4.4; `tools` as
listed, `category: Specialized Domains`, `status: active`), the `kdp-paperback-specs`,
`coloring-book-style-rules`, `kdp-listing` skill files, hire 5 employees into `pub` and
1 into `dist` via the API (names from the pool). The remaining agents and skills come
with P8–P10. Agent instructions reference the skills and the exact artifact formats
(`pages.json` block, `jobs.json`, `<verdict>` tag).

## P4-02 — Pipeline file
`.zibby/data/pipelines/coloring-book.pipeline.md` as §4.1, with a temporary last phase
`listing` (`listing-specialist`, consumes `preflight-report.md`, produces `listing.md`,
vault output) instead of `catalog` until P7 lands (body in Czech like the sibling
pipelines). `tools/product-factory` on `PATH` for the API process (document in
`docs/ops/environment.md`; the `tool` phase runs in the sandbox).

## P4-03 — End-to-end with `mock`
Task → `coloring-book` → approve concept → approve pilot → … → `done`. Assert: 10-page
`interior.pdf`, `cover.pdf`, `preflight-report.md {passed: true}`, `listing.md` in the
vault, `run.budget.spentUsd < 15.75`, ledger line with `pipelineId`. This is an api
e2e with `AGENT_RUNNER_MODE` demo stubs for the agent phases and the real CLI for the
tool phases.

### Commits
`data(publishing): book agents, skills, employees` · `data(pipelines): coloring-book` ·
`test(api): coloring-book end-to-end with mock providers`

---

# Part P5 — Chain targets and sub-pipelines (E6, E7) + the `book-factory` chain

## P5-01 — Chain step targets
```ts
export const ChainStepTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("department"), id: DepartmentIdSchema }).strict(),
  z.object({ kind: z.literal("pipeline"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("agent"), id: AgentIdSchema, employee: EmployeeIdSchema.optional() }).strict(),
]);
export const ChainStepInputSchema = z.object({ target: ChainStepTargetSchema, gate: z.enum(["auto","ask"]) }).strict();
// back-compat: `department` on a step is read as target {kind:"department"}
```
`chainToRules` / `deriveChain` / `validateChainInput` learn the two kinds; `HandoffTarget`
gains `agent`; `AgentRunner.start` gets an `input` seam so `artifactRef` lands in the
agent's handoff (today it is dropped, `task-scheduler.service.ts:1526`). `ChainEditor`
target picker.

## P5-02 — `type: pipeline` phase
`{ id, type: "pipeline", pipeline: id, consumes, produces }` → nested
`PipelineRunner.start` in the child's department, parent waits; child `spentUsd` and
approvals roll up (parent parks while the child is parked); recursion depth ≤ 2.

## P5-03 — `book-factory` chain
`entry: rnd`; steps `[{pipeline: research, auto}, {pipeline: coloring-book, auto},
{pipeline: content-piece, ask}]`. Stored via `PUT /api/handoff/chains/book-factory`.

### Commits
`feat(handoff): chain steps target pipelines and agents; artifact input for agent runs` ·
`feat(pipelines): pipeline sub-phase with cost and approval roll-up` ·
`data(handoff): book-factory chain rnd → pub → com`

---

# Part P6 — Milestone 2: one real book (operator-run, not a night run)

Not implementation. Checklist in `PROGRESS.md` → "Operator action needed": pick the
bake-off winner; set `imageProvider: mflux`; run the fixture brief for 40 pages with
`caffeinate`; approve gates; read `produce-report.md` cost and duration; upload to KDP
by hand with the AI disclosure; record list price, cost and date in
`Products/<slug>/economics.md` (vault). Only after this: raise `breakEvenCopies`,
start a second title, consider `cs`.

---

# Part P7 — Product model, marketplaces as data, economic gate

**Verified current state:** no product/edition/marketplace entity exists; `.zibby/data/
channels/` is taken by the inbound communication channels (Slack, email) — the sales
channels get their own directory `marketplaces/`. Budget is checked at dispatch only
(§3.2); nothing rejects a run on expected margin before it spends.

## P7-01 — Contracts: Product, Edition, Marketplace, Opportunity

`libs/contracts/src/publishing/{product,edition,marketplace,opportunity}.schema.ts`:

```ts
export const ProductTypeSchema = z.enum(["coloring-book", "activity-pack", "worksheets", "printable-game", "svg-bundle"]);

/** The channel-agnostic SOURCE product: one production run's durable result. */
export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),               // slug
  type: ProductTypeSchema,
  title: z.string().min(1).max(120),
  language: z.enum(["en", "de", "fr", "es", "it", "cs"]),
  audience: z.object({ ageMin: z.number().int(), ageMax: z.number().int() }).strict(),
  theme: z.string(),
  components: z.array(z.object({ kind: z.enum(["interior-pdf","cover-pdf","page-png","preview-png","svg","zip"]),
    path: z.string(), pages: z.number().int().optional(), dpi: z.number().int().optional() }).strict()).min(1),
  qa: z.object({ visual: z.enum(["passed","failed","skipped"]), editorial: z.enum(["passed","failed","skipped"]),
    preflight: z.enum(["passed","failed","skipped"]) }).strict(),
  production: z.object({ pipelineRunId: z.string(), costUsd: z.number().nonnegative(), durationMs: z.number().int(),
    imageProvider: z.string(), imageModel: z.string(), aiGenerated: z.literal(true) }).strict(),
  opportunityId: z.string().optional(),
  createdAt: z.string().datetime(),
}).strict();

/** One channel's packaging of a product. `status` is the Tier-3 ladder; `published` is set only by the adapter after approval. */
export const EditionStatusSchema = z.enum(["drafted","packaged","awaiting-approval","published","rejected","delisted"]);
export const EditionSchema = z.object({
  id: z.string(), productId: z.string(), marketplaceId: z.string(),
  listing: z.object({ title: z.string().max(140), subtitle: z.string().max(200).optional(), description: z.string(),
    keywords: z.array(z.string()).max(13), tags: z.array(z.string()).max(13), categories: z.array(z.string()),
    price: z.object({ amount: z.number().positive(), currency: z.enum(["USD","EUR","CZK","GBP"]) }).strict(),
    aiDisclosure: z.string() }).strict(),
  files: z.array(z.object({ kind: z.enum(["interior","cover","download","preview","thumbnail"]), path: z.string() }).strict()),
  economics: z.object({ expectedNetPerSale: z.number(), feeStack: z.string(), breakEvenSales: z.number() }).strict(),
  status: EditionStatusSchema, remoteId: z.string().optional(), remoteUrl: z.string().url().optional(),
  publishedAt: z.string().datetime().optional(), approvalId: z.string().optional(),
}).strict();

/** A sales channel as data. Fees and limits are what the economic gate reads; `automation` is honest about human minutes. */
export const MarketplaceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,23}$/), name: z.string(),
  productTypes: z.array(ProductTypeSchema).min(1), languages: z.array(z.string()).min(1),
  fees: z.object({ listingFee: z.number().nonnegative().default(0), commissionPct: z.number().min(0).max(100),
    paymentPct: z.number().min(0).max(100).default(0), paymentFixed: z.number().nonnegative().default(0),
    fixedCostPerUnit: z.number().nonnegative().default(0) /* e.g. KDP print */, currency: z.enum(["USD","EUR"]) }).strict(),
  limits: z.object({ newListingsPerWeek: z.number().int().optional(), maxFiles: z.number().int().optional(),
    maxFileMb: z.number().optional() }).strict(),
  automation: z.object({ listingApi: z.enum(["none","prepare-only","full"]), salesData: z.enum(["none","csv","api"]),
    humanMinutesPerEdition: z.number().int() }).strict(),
  aiPolicy: z.enum(["allowed","disclosure-required","restricted","banned","unclear"]),
  adapter: z.string() /* adapter module id, e.g. "kdp-manual", "etsy-api", "gumroad-api" */,
  enabled: z.boolean().default(true),
}).strict();

/** Research output: a demand hypothesis with the numbers the economic gate needs. */
export const OpportunitySchema = z.object({
  id: z.string(), createdAt: z.string().datetime(), source: z.enum(["rnd","analytics","operator"]),
  productType: ProductTypeSchema, theme: z.string(), audience: z.object({ ageMin: z.number().int(), ageMax: z.number().int() }).strict(),
  language: z.string(), marketplaces: z.array(z.string()).min(1),
  demand: z.object({ score: z.number().min(0).max(1), signals: z.array(z.string()), seasonality: z.string().optional(),
    competition: z.enum(["low","medium","high"]) }).strict(),
  economics: z.object({ expectedPrice: z.number().positive(), expectedMonthlySales: z.number().nonnegative(),
    maxProductionCostUsd: z.number().positive(), minMarginPct: z.number().min(0).max(100).default(80) }).strict(),
  status: z.enum(["proposed","accepted","rejected","produced"]).default("proposed"), productId: z.string().optional(),
}).strict();
```

Stores: `.zibby/data/products/<id>/product.json` (+ `editions/<marketplaceId>.json`),
`.zibby/data/marketplaces/<id>.json`, `.zibby/data/opportunities/<id>.json`, all via
`EntityFileStore`. Read-only API for the HUD in P7-02; writes come from tools and
approvals, not from UI forms.

## P7-02 — Marketplace seed + economics tool

- Seed `marketplaces/{kdp,etsy,gumroad,tpt,own-store}.json` from §3.4 (research-backed
  numbers, `aiPolicy`, `automation`). Disabled by default except `kdp`.
- `product-factory economics --opportunity opp.json --marketplaces .zibby/data/marketplaces`
  → `economics.md` with `<verdict>pass|gap</verdict>`:
  `netPerSale = price × (1 − commission) − payment − fixedCostPerUnit − listingFee/expectedSales`;
  `breakEvenSales = maxProductionCost / netPerSale`; **gap** when
  `netPerSale/price < minMarginPct` (digital goods) or when `breakEvenSales >
  expectedMonthlySales × 3` or when `aiPolicy ∈ {banned, unclear}` for every target
  marketplace or when `maxProductionCostUsd > pipeline.budget.maxCostUsd`. The verdict
  is the pipeline's first phase (P7-03) — nothing expensive runs after a `gap`.
- `product-factory catalog add` (writes `product.json` from the book folder + plan +
  run cost read from `costs.jsonl` and the run record).

## P7-03 — Economic gate in every product pipeline

`coloring-book.pipeline.md` gains phase 0 `{ id: economics, type: tool, consumes:
task.md, produces: economics.md, commands: ["product-factory economics --brief task.md
…"] , loop: { to: economics, maxRetries: 0, then: park } }` — a `gap` parks the run
with the reason in `economics.md` before `concept` spends a token. The brief carries
`opportunityId` optionally; without one the gate uses the brief's `listPriceUsd` /
`breakEvenCopies` against `kdp`.

## P7-04 — Swap the temporary `listing` phase for `catalog`
Remove the P4-02 interim phase; `catalog` as in §4.1; vault output `Products/<slug>/
product.md`. P4-03 e2e asserts `product.json` instead of `listing.md`.

### Tests
Schema tests; economics tool: KDP $9.99 example → `pass`, `netPerSale 3.15`; a $4.99
Etsy printable with `expectedMonthlySales 1` and `maxProductionCostUsd 15` → `gap`;
`aiPolicy: banned` → `gap`. Store round-trips.

### Commits
`feat(contracts): publishing product model — Product, Edition, Marketplace, Opportunity` ·
`feat(tools): product-factory economics gate and catalog; seed marketplaces` ·
`data(pipelines): coloring-book — economics gate first, catalog last`

---

# Part P8 — Distribution: editions and channel adapters (department `dist`)

**Verified current state:** nothing. `HandoffTarget` and approvals exist; Law 3 and the
`gr-*` gate rules make "publish" an `ask` action by construction.

## P8-01 — `edition` pipeline

`.zibby/data/pipelines/edition.pipeline.md` (department `dist`, complexity `light`):

```yaml
phases:
  - { id: fit,     type: tool,  consumes: task.md, produces: fit.md,
      commands: ["product-factory edition fit --product task.md --marketplace $MARKETPLACE"] }   # type/lang/aiPolicy/limits → <verdict>
  - { id: listing, type: agent, agent: listing-specialist, consumes: fit.md, produces: edition.json, model: haiku, thinking: low }
  - { id: package, type: tool,  consumes: edition.json, produces: package.md,
      commands: ["product-factory edition package edition.json --out editions/"] }   # previews, thumbnails, zip, file-size/format checks per marketplace
  - { id: polish,  type: agent, agent: content-quality-editor, consumes: package.md, produces: polished.md, model: sonnet, thinking: low,
      qualify: true, loop: { to: listing, maxRetries: 1, then: park } }                           # com's editor, cross-department employee via P1-04 pin
  - { id: prepare, type: agent, agent: distribution-coordinator, consumes: polished.md, produces: publication-package.md,
      model: sonnet, thinking: medium, approval: ask }                                            # Tier-3: "publish to <marketplace>?"
  - { id: publish, type: tool,  consumes: publication-package.md, produces: publish-result.md,
      commands: ["product-factory publish publication-package.md"] }                             # runs only after approval; adapter decides api vs manual checklist
```

The task input is `product.json` + a `marketplace` id (the chain fans one product into
one `edition` run per enabled marketplace that `fit` accepts — fan-out across *runs*,
which the scheduler already supports via separate tasks; no runner fan-out needed).

## P8-02 — Adapters (`tools/product-factory/src/adapters/`)

| Adapter | Mode | What `publish` does after approval |
|---|---|---|
| `kdp-manual` | prepare-only | writes a step-by-step upload checklist with every field pre-filled (title, keywords, categories, AI-disclosure answers, price), opens nothing; `Edition.status → packaged`, operator flips to `published` with the ASIN via the HUD |
| `etsy-api` | full (Seller App tier: own shop, auto-approval; needs an active Etsy shop + API key, §3.4) | `createDraftListing` → `uploadListingFile` (≤ 5 × 20 MB) → `updateListing(type: download)`, previews, price/tags, `who_made/when_made/taxonomy_id`; **activates only if the approval payload says so**, else leaves the draft; stores `remoteId/remoteUrl`. If the AI-disclosure field is not settable via API, the checklist tells the operator to tick it before activation |
| `gumroad-api` | full **only after P8-00 verifies the create-product endpoint**; else prepare-only | creates the product, uploads the file, sets price ≥ $5; publishes per approval |
| `tpt-manual`, `ucitelnice-manual`, `fler-manual` | prepare-only | checklist like KDP (no public APIs); Czech ones only for `language: cs` products |
| `own-store` | full (P11) | writes the catalog entry the storefront reads |

**P8-00 (morning, operator + 10 min):** create/confirm the Etsy shop and a Seller App
API key; check Gumroad's live API docs for `POST /v2/products`; record both in
`OPEN-QUESTIONS.md` Q15/Q16.

Every adapter implements `prepare(edition) → PublicationPackage` and
`publish(package, {activate}) → PublishResult`; every network call appends to
`costs.jsonl` (`source: "marketplace"`, listing fees as cost) so fees land in the
ledger. Credentials via `project-secrets` / `mcp-credentials` pattern, never in data.

## P8-03 — `product-release` chain
`entry: pub`; steps `[{pipeline: coloring-book, auto}, {pipeline: edition, auto}]`;
`emitChainStep` carries `product.json` as `artifactRef`. The second step is dispatched
once per enabled marketplace that `fit` accepts (`distribution-coordinator` lists them
in `publication-package.md`; the scheduler creates one subtask each — P5-01 target
`pipeline` + a `perMarketplace: true` flag on the step).

### Tests
Adapter unit tests with stubbed HTTP (`etsy-api`, `gumroad-api`): draft created, files
uploaded, `activate: false` never calls the activate endpoint (I-1 extended: **no
adapter publishes without an approval id in the package**). `kdp-manual` checklist
snapshot. `fit` rejects a `cs` product for `kdp` and a `banned` marketplace.

### Commits
`data(pipelines): edition pipeline (dist)` · `feat(tools): marketplace adapters — kdp-manual, etsy-api, gumroad-api, tpt-manual` ·
`data(handoff): product-release chain pub → dist`

---

# Part P9 — Demand research as a pipeline (department `rnd`)

## P9-01 — `opportunity-scan` pipeline
```yaml
phases:
  - { id: scan,    type: agent, agent: demand-analyst, consumes: task.md, produces: opportunities.json, model: sonnet, thinking: medium }  # WebSearch: marketplace search pages, autocomplete, bestseller lists, seasonal calendar; reads fin's latest economics.md
  - { id: score,   type: tool,  consumes: opportunities.json, produces: scored.md,
      commands: ["product-factory opportunities score opportunities.json --marketplaces .zibby/data/marketplaces --analytics .zibby/data/analytics"] }  # economics per opportunity, dedupe against existing products, verdict
  - { id: review,  type: agent, agent: market-researcher, consumes: scored.md, produces: shortlist.md, model: sonnet, thinking: medium, approval: ask }  # Tier-3: operator picks what goes to production
```
Accepted opportunities are written to `.zibby/data/opportunities/` and each one becomes
a `coloring-book` (or other type) task via the chain `demand-to-product`:
`rnd:opportunity-scan → pub:<type pipeline> → dist:edition`.

No paid data sources in the first version; demand signals are search-result counts,
autocomplete, bestseller-rank reads and the analytics file. Mark every signal with its
source so the operator can judge it.

### Commit
`data(pipelines): opportunity-scan (rnd); data(handoff): demand-to-product chain`

---

# Part P10 — Economics and analytics (department `fin`)

## P10-01 — Sales import + per-product economics
- `product-factory sales import --marketplace kdp --file ~/Downloads/KDP_Report.csv`
  (CSV from the KDP Reports dashboard; Etsy/Gumroad via API when the adapter is
  `full`) → `.zibby/data/analytics/sales/<marketplace>/<yyyy-mm>.jsonl` rows
  `{date, editionId, units, grossAmount, currency, feesAmount, netAmount}`.
- `product-factory economics report --month 2026-10` → `Products/<slug>/economics.md`
  (vault) and `.zibby/data/analytics/summary/<yyyy-mm>.json`: cost (ledger by
  `pipelineRunId` → product) vs net sales vs fees → margin, payback, best channel; a
  "make more of" list ranked by margin × velocity, which `opportunity-scan` reads.
- `product-analyst` agent writes the human-readable monthly note from the summary
  (haiku; no numbers invented — it only formats the tool's JSON).
- Automation `monthly-economics` (cron, 1st of month 07:00) → `fin` task; the result
  rides into the morning briefing.

### Commit
`feat(tools): sales import and per-product economics; data(automations): monthly-economics`

---

# Part P11 — Autonomous batch mode and the own storefront (later)

**Batch mode** is not new machinery: it is the `demand-to-product` chain triggered by an
automation (`weekly-opportunity-scan`, Monday 09:00) with the operator approving the
shortlist (P9 `review` gate) and each publication (P8 `prepare` gate). The ceilings are
data, not code: `ProjectBudget` caps on the `publishing` project (weekly cost cap),
`Marketplace.limits.newListingsPerWeek` enforced by `fit`, `maxConcurrent 1` on a 24 GB
machine, `economics` gate per run. A week with everything approved yields at most
`Σ newListingsPerWeek` editions — KDP alone caps at 2. Quality ceiling: `fit` refuses
any product whose `qa` has a `failed` or `skipped` entry.

**Own storefront** (`apps/store`, Next.js, reads `.zibby/data/products/**` + editions
with `marketplaceId: own-store`): catalog, cross-sell, SEO pages, checkout via a
merchant-of-record (§3.4 G: VAT OSS handled for us). Design only after the first
external channel has sales; it is a distribution channel like any other
(`own-store` adapter), not the HUD.

---

## Sequencing, waves, risks

```
Wave 1 (parallel, disjoint paths):  P0-01..03 (departments as data) │ P1-01..04 (engine) │ P2-01..03 (toolkit, mock)
Wave 2:                             P0-04 (D-022 + pub + dist) → P4-01..03 (Milestone 1, mock) │ P3-01..04 (local providers, bake-off) │ P7-01..02 (product model, marketplaces, economics tool)
Wave 3:                             P5-01..03 (chains, sub-pipeline) → P7-03..04 (gate + catalog in the pipeline) → P8-01..03 (edition pipeline, adapters, product-release chain)
Wave 4 (second night):              P9 (opportunity-scan) │ P10 (sales import, economics report)
Morning after each night:           bake-off pick, review PRs; P6 after Wave 2; P11 only after first external sales
```

Risks: (1) the P0 web sweep is the widest diff (~30 files) — keep it one commit, no
refactors beyond the swap; (2) `tool`-phase handoff relies on `:1097` promoting
`produces` for non-agent phases — covered by the P1-01 test; (3) mflux CLI flags drift
between versions — pin the version in `doctor`, wrap argv in one module; (4) a 24 GB
machine with ZIBBY api + web + Claude children + klein 4B + Qwen3-VL resident is at the
edge — the choreography (P3-03) is the mitigation, `doctor` the early warning;
(5) account risk at KDP (near-identical AI batches, missing disclosure, art in bleed)
is mitigated by `validate-plan`, editorial QA and the manual upload gate — not by code
alone; (6) the AI-content-spam trap: volume is capped by data (`newListingsPerWeek`,
weekly cost cap), and every product passes the same QA
regardless of how cheap it was; (7) Etsy API access needs an app approval with a
review queue — apply in the morning after Wave 1 so the key exists by Wave 3; until
then `etsy-api` runs in `prepare-only` mode; (8) EU VAT on digital goods sold directly
(own store) — use a merchant-of-record or stay on marketplaces that handle VAT.

## Definition of Done

**MVP (Milestone 1):** P4-03 green in CI with `mock`; one real 10-page book produced
locally on the M5 with `preflight.passed === true` and `spentUsd` under the cap; D-022
landed; `pub` and `dist` visible on the org map; no code path can publish anywhere
without an approval id.

**Factory (Milestone 3):** one product → `product.json` → ≥ 2 editions (KDP checklist +
one API channel in draft) through the `product-release` chain, each publication behind
its own Tier-3 approval; one month of `economics.md` with real cost and (possibly zero)
sales; `opportunity-scan` producing a shortlist the operator can accept.

## Orchestrator review addendum — to be written by the night-run orchestrator (BINDING)

Rulings go here before Wave 1 starts: accepted factual corrections, fixed constants
(`ALLOWED_IMAGE_MODELS`, default `breakEvenCopies`, `warnAtPct`), and the invariants
I-1..I-7 each mapped to a test file.

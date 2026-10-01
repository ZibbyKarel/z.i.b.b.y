# Publishing Factory — open questions

Every question has a default. A night run applies the default, records it in
`PROGRESS.md` under "Defaults applied", and continues. Levels: 🟥 confirm before the
night run · 🟨 confirm before Wave 2 · 🟩 non-blocking.

| # | Question | Default (night run applies) | Level | Affects |
|---|---|---|---|---|
| Q1 | KDP title-creation limit — is it 2 paperbacks/week (Sept 2026 sources) or still 10? | Plan for 2/week; no code depends on it | 🟩 | P6 throughput only |
| Q2 | Is Czech a supported KDP paperback language? First title in `en` for the US store? | `language: en` default; `cs` stays in the enum but `validate-plan` warns until Q2 is confirmed — **confirmed by operator 2026-10-01** | ✅ | P2-01, P4-01 agent prompts |
| Q3 | `breakEvenCopies` default (cap = 3.15 × N)? | 5 → cap $15.75, warn at 70 % | 🟨 | P1-03 default, P4-02 frontmatter |
| Q4 | Image model: FLUX.2 klein 4B vs Z-Image Turbo + Coloring-Book-Z LoRA | Both allowed; `flux2-klein-4b` default until the bake-off (P3-04) says otherwise; operator picks in the morning | 🟩 | P3-01 config |
| Q5 | May the night run install user-space tooling (`uv tool install mflux`, `ollama pull qwen3-vl:8b`, ~10 GB download)? | **No** — it writes the exact commands to `PROGRESS.md` "Operator action needed"; P3 tests use stubs — **confirmed by operator 2026-10-01** | ✅ | P3 |
| Q6 | May the night run write data files under `.zibby/data` (departments seed, `pub.json`, 6 agents, 3 skills, 6 employees, the pipeline, the chain)? | **Yes, additive only**; every write listed in `PROGRESS.md` "Data written"; no existing file rewritten — **confirmed by operator 2026-10-01** | ✅ | P0-02, P0-04, P4-01..02, P5-03 |
| Q7 | Who approves D-022 (departments as data, superseding D-004/D-016/D-021 closed-set clauses)? | Operator already stated the requirement (2026-10-01); the night run writes D-022 as "operator, 2026-10-01" | 🟩 | P0-04 |
| Q8 | Department creation from the UI only, or may an agent (`agent-factory` gap proposal) propose one? | UI/API only; agent proposals are out of scope | 🟩 | P0-02 |
| Q9 | Vision tie-breaker: Haiku via `claude -p` (subscription, shows in `total_cost_usd`) or Anthropic API key? | `claude -p --model haiku`; no new credential | 🟩 | P3-02 |
| Q10 | Generate at 1024² and upscale ×2.5 with sharp, or generate at print resolution (2550×3300) directly? | 1024² + upscale after threshold (vector-like edges survive); the bake-off measures both | 🟩 | P3-01 |
| Q11 | Mascot / recurring character in the first title? | **No** for title 1 (klein reference editing untested on this Mac); `mascot` stays optional in the brief | 🟨 | P4-01 prompts |
| Q12 | Where do finished books live on disk? | Run sandbox `book/` + vault `Publishing/<slug>/` (listing, economics); no separate project path | 🟩 | P4-02 outputs |
| Q13 | `tool` phase: new type (default) or extend `verify` to honour `consumes`/sandbox? | New type — `verify` keeps "checks the project" semantics | 🟩 | P1-01 |
| Q14 | Chain steps: keep chains derived from handoff rules (no store) when adding pipeline/agent targets? | Yes, extend `chainToRules`; no new store | 🟩 | P5-01 |
| Q15 | Does the operator have an Etsy shop and a Seller-App API key (needed for `etsy-api`; Czechia is Etsy-Payments eligible)? | Not yet; the operator will create it later. `etsy-api` ships in prepare-only mode and switches to full when the key appears in `project-secrets` — **confirmed by operator 2026-10-01** | ✅ | P8-02 |
| Q16 | Gumroad `POST /v2/products` — implemented or not (sources conflict)? | Treat as **not** implemented; `gumroad-api` is prepare-only until verified | 🟨 | P8-02 |
| Q17 | First external (non-KDP) channel? | Etsy (only verified listing + file-upload API; kids printables $1–3.50 → bundle to ≥ $4.99) — **confirmed by operator 2026-10-01** | ✅ | P7-02 seed `enabled`, P8 |
| Q18 | Human QA panel for the preschool line? | **Dropped by the operator 2026-10-01** — no external reviewer in the pipeline; QA is deterministic + agent + the operator's own gates | ✅ | — |
| Q19 | Czech-language products: which channels? | `cs` products target `own-store`, `ucitelnice-manual`, `fler-manual` (and Etsy if demand shows); never `kdp` until Q2 is resolved | 🟩 | P7-02 seed `languages` |
| Q20 | Own store: Stripe directly (VAT OSS ours) or merchant of record (Lemon Squeezy / Gumroad)? | Merchant of record; decision deferred to P11 after first external sales; ask an accountant about CZ VAT registration before any direct sale | 🟩 | P11 |
| Q21 | Weekly batch ceilings for autonomous mode? | `newListingsPerWeek`: kdp 2, etsy 5, others 3; `publishing` project weekly cost cap $50; `maxConcurrent 1` | 🟩 | P7-02 seed, P11 |

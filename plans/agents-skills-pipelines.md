# Plán: Agenti, Skilly & Pipeliny pro ZIBBY

> Cíl: rozšířit ZIBBY o kvalitní **skilly** a **agenty** z komunitních sbírek
> ([worldflowai/everything-claude-code](https://github.com/worldflowai/everything-claude-code),
> [affaan-m/ecc](https://github.com/affaan-m/ecc) — obě MIT) a z nich poskládat
> **pipeliny** pro hlavní use-casy: **koding, marketing, sales, výzkum, obsah,
> produkt**. Vše musí sednout do našich konvencí a schémat.

Zdrojové soubory se ukládají do `apps/api/data/{skills,agents,pipelines}` ve
formátu, který validují `libs/contracts/src/{skills,agents,pipelines}/*.schema.ts`.

---

## Zjištění z reconu (Fáze 0 — HOTOVO)

- **Agenti**: už 161 souborů ve 12 kategoriích. Koding / data / research / quality
  pokryté bohatě. **Mezery: marketing & sales** (chybí copywriter, stratég,
  outreach/SDR, social, e-mail, brand).
- **Skilly**: prakticky prázdné (`triage`, `demo-skill`). Největší příležitost.
- **Pipeliny**: jen `delivery` (koding) + demo. Marketing/sales/research/obsah chybí.
- **Schéma skill** (`<id>.md`): frontmatter `name, glyph, desc, category` + tělo =
  `instructions`. Jen `id` (= název souboru) a `instructions` povinné.
- **Schéma agent** (`<id>.md`): `name, description, glyph, model(opus|sonnet|haiku),
  thinking(high|medium|low), tools[], category` + tělo.
- **Schéma pipeline** (`<id>.pipeline.md`): `name, desc, phases[]`. `agent` fáze
  vyžaduje `agent, model, thinking, consumes, produces`; `verify` fáze běží shell
  checky bez LLM. `loop.to/then` musí ukazovat na existující `id` fáze / `fail` / `park`.
- **Glyphy** (uzavřená sada DS Icon): grid spark plug clock brain pulse cart film
  server doc play run wait ok edit bolt check x stop plus chevron dots file shield
  search gear bot flow compass code flask dollar branch pause retry checkpoint moon
  coffee link warn arrow butlerSign pin mic trash.
- **Kategorie** se drží v `_categories.json` v dané složce (volitelné).
- **Licence**: obě sbírky MIT → atribuce v `THIRD-PARTY-NOTICES.md`.

---

## Fáze 1 — Import skillů  ✅

Vybrané skilly (kurátorský výběr, ne mechanický dump) z `ecc/skills/<name>/SKILL.md`
a `everything-claude-code/skills/<name>/SKILL.md`. Transformace frontmatteru na náš
tvar (`name, glyph, desc, category`), tělo zachovat. Atribuce řádkem v těle.

- [x] **Výzkum & inteligence** (`category: Research`): deep-research, market-research,
  exa-search, iterative-retrieval, research-ops, scientific-literature-review
- [x] **Marketing & obsah** (`category: Marketing & Content`): brand-voice,
  content-engine, seo, article-writing, crosspost, social-publisher, marketing-campaign
- [x] **Sales & growth** (`category: Sales & Growth`): lead-intelligence,
  investor-outreach, investor-materials, product-lens, product-capability
- [x] **Koding & delivery** (`category: Coding & Delivery`): tdd-workflow,
  verification-loop, security-review, e2e-testing, codebase-onboarding, api-design,
  backend-patterns, frontend-patterns
- [x] **Agentic / meta** (`category: Agentic`): prompt-optimizer, plan-orchestrate
- [x] `apps/api/data/skills/_categories.json` s těmito kategoriemi
- [x] commit

## Fáze 2 — Doplnění agentů (marketing & sales)  ✅

Nové agenty v našem stylu (stručné, akční), kategorie `Business & Product`:

- [x] copywriter, marketing-strategist, social-media-manager, email-marketer,
  brand-strategist (marketing)
- [x] sdr (outreach), account-executive, lead-researcher (sales)
- [x] commit

## Fáze 3 — Pipeliny  ✅

Nové `*.pipeline.md` skládající existující + nové agenty. Lineární s volitelnou
review-smyčkou; bez `verify` fáze tam, kde nejde o kód.

- [x] **koding**: `code-audit` (security-auditor → code-reviewer → performance-engineer → dokumentator)
- [x] **výzkum**: `research` (search-specialist → research-analyst → competitive-analyst → data-researcher synthesis)
- [x] **marketing**: `content-campaign` (market-researcher → marketing-strategist → copywriter → seo-specialist → content-quality-editor)
- [x] **obsah**: `content-piece` (copywriter → seo-specialist → content-quality-editor)
- [x] **sales**: `sales-outreach` (lead-researcher → competitive-analyst → sdr → content-quality-editor)
- [x] **produkt**: `product-discovery` (market-researcher → ux-researcher → product-manager → architekt)
- [x] commit

## Fáze 4 — Validace  ✅

- [x] parse-check: každý nový soubor projde příslušným Zod schématem (skript)
- [x] `pnpm lint` / `pnpm typecheck` (žádné kódové změny → mělo by být beze změny)
- [x] commit (pokud něco)

## Fáze 5 — Atribuce & docs  ✅

- [x] `THIRD-PARTY-NOTICES.md` — záznam o obou MIT sbírkách
- [x] krátký přehled přidaného obsahu (tento plán + commit zprávy)
- [x] commit

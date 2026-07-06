# Fáze 10 — Self-knowledge ↔ graphify (bez duplicity)

## Nálezy z investigace (Fáze 0)

- **graphify není CLI ani npm script.** V repu neexistuje binárka, devDependency ani
  `package.json` script; graphify žije jen jako Claude skill
  `.claude/skills/graphify/SKILL.md` (trigger `/graphify`). Skill si při běhu
  pip-instaluje Python balík `graphifyy` a jednotlivé kroky řídí Claude — sémantická
  extrakce (Step 3B) běží přes LLM subagenty, ale **pro kód existuje AST-only cesta
  (Step 3A) bez LLM**; `--update` s čistě kódovými změnami běží celý bez LLM.
- **`graphify-out/` nikdy nevznikl** — CLAUDE.md o něm mluví, ale žádný běh neproběhl.
  Výstupy skillu: `graphify-out/graph.json` (node-link graf), `GRAPH_REPORT.md`
  (plain-language report: god nodes, komunity), volitelně `wiki/index.md`, HTML viz,
  manifest pro inkrementální `--update`.
- **Self-knowledge generátor existuje** (Fáze 1 v `docs/plans/phase-06.md`):
  `apps/api/src/self-knowledge/` — čistý composer (`self-knowledge.composer.ts`, žádné
  I/O) skládá vault notu `self-knowledge` z pěti AUTO bloků
  (`<!-- AUTO:<KEY>:START/END -->`: META, AGENTS, PIPELINES, GATES, CHANNELS), service
  (`self-knowledge.service.ts`) dělá I/O přes `VaultService`, CLI
  (`tools/self-knowledge/generate.ts` → `generate-cli.ts`) běží přes
  `pnpm self-knowledge:generate` / `:check`; `.githooks/pre-commit` volá `:check`
  (drift gate, tolerantní k chybějícím node_modules).
- **`VaultService.graph()`** je jiná doména (graf wikilinků osobní/projektové paměti)
  — zůstává beze změny.

## Rozhodnutí

1. **Jeden zdroj pravdy o tvaru kódu = graphify.** Self-knowledge generátor
   `graphify-out/GRAPH_REPORT.md` jen ČTE a cituje výtah; nikdy negeneruje vlastní
   popis architektury.
2. **`graphify update .` nejde zapojit jako shell krok** (potřebuje Claude). Poctivé
   zapojení: (a) jednorázově vygenerovat `graphify-out/` skillem (code-mode, AST-only,
   `--no-viz`) a commitnout `graph.json` + `GRAPH_REPORT.md`; (b) do pre-commit hooku
   přidat NEBLOKUJÍCÍ staleness warning; (c) CLAUDE.md už instruuje Claude spouštět
   `graphify update .` po změnách kódu — to zůstává mechanismem aktualizace.
3. **Graceful absence.** Chybějící/neparsovatelný `GRAPH_REPORT.md` nesmí rozbít
   generátor ani drift check — blok pak nese jednořádkovou zprávu „graphify-out
   chybí — spusť `/graphify . --no-viz`".

## Kroky

### 1. Seed `graphify-out/`

- Spustit graphify pipeline podle SKILL.md na repo (kódová část: `apps/`, `libs/`,
  AST-only, `--no-viz`), výstup `graphify-out/graph.json` + `GRAPH_REPORT.md` +
  manifest. Pokud pip install `graphifyy` v prostředí selže (proxy/offline), fázi
  dokončit bez seedu — implementace musí fungovat i bez `graphify-out/` (bod 3 výše)
  a seed se dožene lokálně.
- `graphify-out/` je už dnes celý v `.gitignore` (ř. 11: „regenerated via
  `graphify update .`, not versioned") — NIC z něj se necommituje; je to lokální,
  regenerovatelný artefakt (stejná kategorie jako `apps/api/data/`). Self-knowledge
  reader s tím počítá (graceful absence) a seed se na každém stroji dožene
  spuštěním skillu.

### 2. Kontrakt

- `libs/contracts/src/self-knowledge/self-knowledge.schema.ts`: do
  `SelfKnowledgeSections` přidat volitelnou sekci `codebaseShape` (počty: god nodes,
  komunity; nebo boolean `present`) tak, aby zůstala zpětně kompatibilní — řídit se
  tím, jak jsou modelované stávající sekce.

### 3. Composer (čistý, bez I/O)

- `self-knowledge.composer.ts`: přidat šestý blok `CODEBASE-SHAPE` do `BLOCK_KEYS`
  (pořadí: za CHANNELS). Vstup composeru rozšířit o
  `codebaseShape?: { generatedAt?: string; godNodes: Array<{ name: string; degree?: number }>; communities: Array<{ label: string; size?: number }> } | null`.
  - `null`/absent → blok renderuje hlášku o chybějícím graphify-out.
  - Jinak stručný výtah: top ~10 god nodes, seznam komunit (label + velikost),
    odkaz na `graphify-out/GRAPH_REPORT.md` jako plný zdroj. Výtah, ne celý report.
- Drift: blok se počítá do `computeDrift` stejně jako ostatní (META zůstává výjimka).

### 4. Parser + service

- Nový malý čistý modul `apps/api/src/self-knowledge/graph-report.parser.ts`:
  `parseGraphReport(markdown: string)` → tvar z bodu 3. Parsovat tolerantně nadpisy
  sekcí GRAPH_REPORT.md (god nodes / hubs, communities); cokoliv neparsovatelného →
  prázdná pole (nikdy throw). Unit testy na reálném vzorku reportu + na svinstvu.
- `self-knowledge.service.ts`: před kompozicí přečíst
  `<repoRoot>/graphify-out/GRAPH_REPORT.md` (`fs.readFile`, ENOENT → null). Cesta:
  nový DI token (default odvozený stejně jako ostatní `*_DIR` — pozor na CLI cwd
  `apps/api`, viz `pinRelativeDataDir` v `generate-cli.ts`; řešit přes `INIT_CWD`
  nebo hledáním repo rootu podle `pnpm-workspace.yaml`).

### 5. Pre-commit staleness (neblokující)

- `.githooks/pre-commit`: po self-knowledge checku přidat warning (exit 0 vždy):
  pokud `graphify-out/graph.json` chybí, vypsat nápovědu; pokud existuje a je starší
  než nejnovější změněný soubor v `apps/ libs/` ve staged změnách, vypsat
  „graphify-out může být zastaralý — spusť `graphify update .`". Čistý shell, žádný
  Python.

### 6. Testy

- composer: blok se renderuje s daty / s hláškou při absenci; drift reaguje na změnu
  bloku; existující testy bloků zůstávají zelené (nový klíč nesmí rozbít merge
  operátor-vlastněného obsahu).
- parser: viz bod 4.
- service: mock FS — report přítomen/nepřítomen.

## Definition of done

`pnpm lint && pnpm typecheck && pnpm test` zelené; `pnpm self-knowledge:generate`
proběhne s i bez `graphify-out/`; `VaultService.graph()` nedotčen.

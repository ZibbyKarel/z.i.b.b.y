# Audit projektu + vizuální review Chat UI — 2026-07-10

> Provedeno dvěma nezávislými audity (repo/roadmapa + vizuální review chat scény).
> Zdroje: `git`, `graphify-out/GRAPH_REPORT.md`, `knip`, `pnpm check:lint/types/test`,
> zdrojový kód WebGL scény a chat komponent, screenshoty přes Playwright.

---

## 1. Stav repozitáře — co doladit

- **Suita NENÍ zelená, jak tvrdí LOOP.md.** `pnpm test` právě teď: **2 selhávající soubory / 2 testy** ze
  3340 (3324 passing):
  - `apps/api/src/runner/runner-core.test.ts` — test "a paused-limit run with a pending spec
    survives a restart" očekává stav `'paused-limit'`, dostává `'interrupted'`.
  - `apps/api/test/pipelines.e2e.test.ts` — "runs pr.open autonomously (Tier-2, no gate)" timeoutuje
    v `until()` poll helperu.
  - Vypadá to na skutečné regrese, ne flaky testy — je potřeba je opravit dřív, než se na ně nabalí
    další fáze.
- **Nekomitnuté změny na `main`**: `.zibby/data/projects/_projects.json` a
  `.zibby/data/vault/projects/zibby-self.md` — commitnout nebo zahodit před další prací.
- **`LOOP.md` byl zastaralý a byl smazán** (2026-07-10) — jeho doporučení "otevřít PR z `north-star`
  → `main`" odkazovalo na branch, která je už dávno sloučená. `git branch -a` ale pořád ukazuje
  **44 nesloučených `claude/*` remote branchí** (např. `claude/chat-orb-wireframe-sphere`,
  `claude/design-system-state-unify`, `claude/docs-plans-implementation`) plus lokální
  `fix/ci-pnpm-overrides` a `phase-112-memory-import`. **Doporučení:** projít a roztřídit těch 44
  branchí (opuštěné vs. rozdělaná práce) dřív, než další chat-UI fáze začne kolidovat s něčím, co
  tam už čeká.
- **Knip: 58 nepoužitých souborů.** Většina je mrtvý referenční materiál
  (`design/Z.I.B.B.Y/**/*.jsx` mockupy — bezpečné smazat/přesunout mimo repo), ale pár je skutečný
  zdrojový kód mrtvý od NC2 sweepu (nebo přidaný po něm):
  - `apps/api/src/self-knowledge/generate-cli.ts`
  - `apps/web/features/subsystems/mutations/index.ts`
  - `apps/web/features/subsystems/queries/index.ts`
  - `apps/web/features/tasks/hooks/useTaskSchedule.ts`
- **Lint: 0 chyb, 9 warningů.** Dvě reálné: `EntityHero.tsx:128` a `IconTile.tsx:139` používají
  raw `<img>` místo `next/image` — buď opravit, nebo zdokumentovat záměrnou výjimku DS. Zbylých 6 je
  `_`-prefixované nepoužité test parametry (např. `ChatScreen.test.tsx:119`) — jednořádková oprava
  ESLint configu (`argsIgnorePattern: "^_"`) je všechny umlčí najednou.
- **`knip.json`** má 8 zastaralých config hintů ("remove redundant entry pattern") a 9 duplicitních
  export párů (`AgentSchema|CreateAgentSchema` apod.), které jsou legitimní ale měly by jít do
  ignore listu, ať se šum nevrací při každém sweepu.

## 2. Funkcionalita — co dál implementovat

- **Google Calendar je v ROADMAP.md označen "mocked, not live-verified"**, přesto je v sekci
  "Already Delivered". To je skrytá mezera na věci, co se tváří jako hotová — live-verifikace
  reálného OAuth/service-account čtení (a časem zápisu) je nejvyšší hodnota k dotažení.
- **N2 chain feature běžel jen v demo módu** (`nightly-research → build-feature` — "proven in e2e...
  demo mode"). Chybí důkaz, že operátor spustil reálný chain nad skutečnými projekty. Skutečný
  end-to-end běh je opravdový důkaz N2, ne fixture.
- **N3 `MonitorAdapter` seam je ověřen jen fake adaptérem** — GitHub Actions je jediný živý monitor.
  Postavit skutečný Sentry adaptér (avizovaný jako druhý plug) je reálná validace toho seamu.
- **Entity-id refaktor** byl v NC1 vědomě odložen "na čistou branch po merge" — teď, když se stejně
  řeší 44 nesloučených branchí, je to přirozený moment ho naplánovat, než zase zestárne.

---

## 3. Vizuální review Chat UI (WebGL scéna, animace, glassmorphism)

### Co funguje dobře

- Filozofie scény „alive, not animated" (`sceneController.ts`) — vše se dampuje/easuje, nic
  necvakne; dobře zdokumentováno a dodrženo.
- 8 barevně odlišených mini-orbů (subsystémy) je čitelných na první pohled; HUD scanline/grid
  overlay (`ChatScreen.tsx:381-398`) dobře podporuje „operator" estetiku.
- Staggered „mitosis" entry animace orbů je promyšlený detail, který stojí za zachováním.

### WebGL scéna — luminance, osvětlení, materiály

- **Žádné skutečné osvětlení ani bloom** — vše je fresnel + aditivní glow shader (`orbLayer.ts`).
  Bez post-processing (`UnrealBloomPass`) je strop jasu nízký; idle stav vypadá skoro jako plochá
  tmavě modrá plocha.
- **Centrální orb září MÉNĚ než mini-orby**: default `GLOW_STRENGTH=0.35`/`GLOW_SCALE=1.25`
  (`orbLayer.ts:28-29`), ale mini-orby dostávají `glowStrength=0.4`/`glowScale=1.35`
  (`sceneController.ts:313-316`) — hrdina scény by měl vizuálně dominovat i luminancí, ne jen
  velikostí. **Doporučení:** zvýšit centrální `GLOW_STRENGTH` na ~0.55–0.6.
- **Mlhovina má nízký barevný kontrast**: `cloudA`/`cloudB` v `backgroundLayer.ts:112-118` mísí
  `uNebulaA` (accent) a `uNebulaB` (run token) při síle jen 0.22/0.15 — obě spíš modro-tyrkysové.
  **Doporučení:** zvýšit koeficienty (~0.22→0.32, 0.15→0.22) nebo přidat teplejší/fialovější třetí
  odstín.
- Chybí `renderer.toneMapping`/`outputColorSpace` na `orbRenderer`/`bgRenderer`
  (`sceneController.ts:242-254`) — `THREE.ACESFilmicToneMapping` by pomohl s rolloffem jasů,
  zvlášť po přidání bloomu.
- Vedlejší nález: `THREE.Clock` je deprecated (console warning) — drobný tech-debt.

### Animace a přechody

- V celém `apps/web` není framer-motion (ověřeno grepem) — veškerý pohyb je buď WebGL, nebo dvě
  CSS `transition-colors` na tlačítkách (`ChatScreen.tsx:425,435`).
- **`SubsystemDrawer` i `ChatTaskDetailColumn` se objevují/mizí okamžitě** (`{selectedRun && <...>}`),
  bez jediné `transition`/`animate`/`duration` třídy — cvaknou dovnitř/ven, v přímém kontrastu s
  principem „nic nikdy necvakne", který dodržuje WebGL scéna. **Doporučení:** přidat
  `transition-[opacity,transform] duration-200 ease-out` (respektovat `usePrefersReducedMotion`
  stejně jako scéna).
- Příchozí zprávy v `ChatTranscript` se objevují bez fade-in — stálo by za drobné
  `animate-in fade-in` per zpráva.

### Průhlednost / glassmorphism

- DS už MÁ variantu `glass` (`Card.tsx:105`, `bg-surface-glass` = `rgba(16,21,28,0.5)`), ale
  **bez jakéhokoli `backdrop-blur`** — je to jen plochá 50% průhlednost, ne skutečný glassmorphism.
  Používá se jen v `EmptyState`/`LoadingState`/`LoadError` — nikde v chatu.
- **Všechny plovoucí panely v chatu jsou plně neprůhledné**: `ChatTasksPanel` (přes `HudPanel`),
  `ChatTaskDetailColumn` (`Panel`, default `background="surface"`), `SubsystemDrawer`'s `Panel` —
  všechny sedí přímo NA hrdinské WebGL scéně a úplně ji zakrývají. Panel „TASKY" a input composer
  jsou neprůhledné černé bloky přesně tam, kde by průhlednost nejvíc pomohla.
- Jediné místo se skutečným blurem: `SubsystemDrawer.tsx:234`, zavírací tlačítko
  (`bg-background/70 backdrop-blur-sm`) — dokazuje, že vzor technicky funguje, jen není aplikovaný
  na těla panelů.
- **Konkrétní doporučení:** přidat do `Card.tsx` k `glass` variantě `backdrop-blur-md`/`-lg`, pak
  přepnout `ChatTasksPanel`, `ChatTaskDetailColumn`, `SubsystemDrawer` na `background="glass"`.
  `ChatMessage.tsx:96` (`background={isUser ? "raised" : "accent"}`) by taky mohl dostat
  poloprůhlednou variantu, aby mlhovina prosvítala i skrz transkript.

### Screenshoty

Pořízeny 3 (idle stav s orbem, otevřený task-detail panel se skutečným logem běhu, pokus o
subsystem drawer). Swiftshader flakiness zmíněná v paměti projektu tu nehrála roli — nálezy o
luminanci jsou podložené shader/material zdrojovým kódem (`orbLayer.ts`, `backgroundLayer.ts`),
screenshoty slouží jen jako potvrzující důkaz.

---

## 4. Doporučené pořadí dalších kroků

1. **Opravit 2 červené testy** (`runner-core.test.ts`, `pipelines.e2e.test.ts`) — blokující, dřív než
   cokoliv dalšího.
2. **Dohledat/roztřídit 44 nesloučených `claude/*` branchí** — jinak hrozí kolize s další prací.
3. **Glassmorphism v chatu** — nejrychlejší vizuální dopad: `backdrop-blur` na `glass` variantu +
   přepnutí 3 panelů (`ChatTasksPanel`, `ChatTaskDetailColumn`, `SubsystemDrawer`).
4. **Přechody na drawer/detail panelech** — `transition-[opacity,transform] duration-200 ease-out`,
   respektovat `usePrefersReducedMotion`.
5. **WebGL luminance pass** — zesílit centrální orb glow, zvýšit kontrast mlhoviny, zvážit
   `ACESFilmicToneMapping` (případně bloom později).
6. **Knip cleanup** (58 nálezů, z toho ~4 reálné) + ESLint `argsIgnorePattern` fix — levné, rychlé.
7. **Live-verifikovat Google Calendar** a postavit skutečný Sentry monitor adaptér — dotáhnout věci
   označené jako hotové, ale ve skutečnosti mock/demo.
8. **Entity-id refaktor** — naplánovat na čerstvou branch, teď když se řeší branch situace stejně.

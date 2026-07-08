- [x] avatar u pipeline/agenta by neměl být inline v md souboru. Spíš jen uložený jako asset někde ve složce a v md souboru by měl být jen název toho souboru. Navrhuji přímo ve složkách .zibby/agents/assets a .zibby/pipelines/assets

- [x] stránka Orchestrace - v náhledu flow pipeliny nejsou vidět avataři agentů

- [x] Stránka detailu firmy - měl bych být schopný v sekci projektů přidat již existující projekt přes tlačítko "+" nebo vytvořit nový projekt, který bude rovnou propojený s firmou

- [ ] Projekty v ZIBBY jsou dnes vedené v centrálním registru (`_projects.json`, schema
`libs/contracts/src/projects/project.schema.ts`), který se synchronizuje mezi stroji.
Pole `path` je ale holá cesta na disku bez ověření existence a bez vazby na konkrétní
stroj — takže na novém stroji, kde projekt ještě nebyl naklonovaný, ho ZIBBY v UI
normálně nabízí, jen s cestou, která tam neexistuje. `ProjectsStorageService`
(`apps/api/src/projects/`) i UI (`ProjectCard.tsx`, `ProjectBasicsPanel.tsx`) dnes tenhle
stav nijak nerozlišují.

Zároveň `WorkspaceService.createWorktree()` (`apps/api/src/workspace/workspace.service.ts`)
při spuštění úkolu řízne worktree z aktuálního lokálního `HEAD` bez `fetch` — takže
pokud je lokální checkout zastaralý (typicky po práci na jiném stroji), run vychází ze
starého stavu místo z aktuální hlavní větve na originu.

Chceme:

1. **Per-machine nastavení kořenové složky pro klonování projektů** (Settings) —
   defaultně rodičovská složka instalace ZIBBY (`../` vůči rootu ZIBBY). Toto nastavení
   je lokální pro daný stroj, nesynchronizuje se v `_projects.json` spolu s identitou
   projektu.

2. **Detekce a řešení chybějícího lokálního klonu** — pokud `path` projektu na daném
   stroji neexistuje (nebo není git repo), UI to má zřetelně ukázat (ne tvářit se, že
   projekt je „tady") a nabídnout klonování z git remote do nakonfigurované kořenové
   složky. Projekt v registru dnes nemá pole s git remote URL — bude potřeba doplnit.

3. **Přehled a merge nesloučených PR na projektu** — v detailu/na kartě projektu
   zobrazit počet otevřených PR. Merge musí být vždy explicitní akce operátora v UI
   (tlačítko), nikdy automatický krok ZIBBY — drž se autonomy-kontraktu v CLAUDE.md
   (Tier 3 „surface and wait", Law „Never: Auto-merge").

4. **Vždy vycházet z aktuální hlavní větve originu při spuštění úkolu** — před cutnutím
   worktree v `createWorktree()` udělat `git fetch origin` a větev řízout z
   `origin/<default-branch>` místo z lokálního `HEAD`. Lokální checkout/branch se tím
   nesmí modifikovat (žádný `checkout`/`reset` v operátorově hlavním working tree —
   worktree izolace musí zůstat zachovaná). Pokud lokální klon vůbec neexistuje, nejdřív
   ho naklonovat (viz bod 2) a pak pokračovat.

Cíl: aby stejný projekt fungoval konzistentně napříč více stroji, aniž by hrozilo, že
run vychází ze zastaralé nebo neexistující lokální kopie, a aniž by ZIBBY kdy sama
mergovala PR.

- [ ] V top panelu chci vidět že je Zibby aktuální. Pokud je main větev pozadu chci vidět o kolik commitů je pozadu a případně mít tlačítko "Aktualizovat", které stáhne nejnovější změny. Chtělo by to taky po najetí myši vidět třeba počet otevřených PR které čekají na zamergování a mít je jako odkaz který mě rovnou přesměruje abych to mohl mergnout
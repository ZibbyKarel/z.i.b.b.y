# TODO

1. [x] widgety - pokud widget načítá nějaká data poprvé, měl bych vidět loader aby DOM nebyl prázdný (widget pull-requests) (main@a66a40d7)
2. [x] widget právě běží a ukončené - musíme předělat animaci když widget pracuje. Měl bych vidět progressbar odpovídající procentům fází, které jsou hotové. Pokud se jedná o single agent run tak musíme něco vymyslet tam nejsme schopni odhadnout jak dlouho bude práce trvat nebo kolik procent je již hotovo. (main@96488552)
3. [x] detail pull requestu (main@32c0c169)
   - tlačítka jako rebase, fix CI, merge, zapracovat komentáře, merge na githubu musejí být zobrazena jen pro MOJE PRs. Pullrequesty ostatních můžeme jen dělat code-review.
   - panel s detaily je redundantní. Všechny informace už máme v hlavičce.
   - title bude odkaz a povede na github na novém tabu (stejně tak uděláme i title u Issue v detailu - ten povede na JIRU v novém tabu) a můžeme smazat tlačítka otevírající github protože už máme title jako proklik
   - seznam změněných souborů váme jako sidepanel vedle diffu souborů tak jako to má github. Klik na soubor automaticky sescroluje diff souborů k danému souboru. Sidebar se soubory jde sbalit do úzkého proužku
   - sekce kontroly je také zbytečná a už to máme v hlavičce
   - akční tlačítka přesuneme nahoru tak jak to máme v detailu behu třeba
4. [x] Detail běhu (main@41333769)
   - je málo výrazná fáze, která zrovna běží. Můžná by to chtělo výraznější border v běrve running a nebo výraznější kontrast pozadí
5. [x] Learn from operator rework notes: distil recurring revised-gate notes (approval reason, <phase>.note.md, book/rejections.md) into rules via review-learning (2nd occurrence → approval → vault note grounded into illustrator/creative-director/kids-book-qa); add a workflow source next to the GitHub PR fetcher. Example: coloring-book_1792627255797 (three eyes, malformed animals, unfinished lines) (main@a073456f)
6. [x] stránku Agenti změníme na stránku AI a v subMenu pak budou Agenti, a Skills, Commands a MCPs, které přesuneme ze záložky System. Záložka System se pak stává záložkou nastavení kde se položky z tabů (Obecné, runtime, aktivita, stav) posunou o level výše a budou tedy v submenu. V topPanelu úplně nahoře v pravo můžeme odstranit ozubené kolečko směřující na stránku nastavení (main@bd38c744)
7. [x] widget issues - ikonka zdroje (jira) zabírá dva řádky a je vycentrovaná vertikálně na střed těch dvou řádků
8. [x] Widget TODO na dashboardu: rychlé přidávání položek k implementaci s přiřazením cíle (main@99e130b8)
       a. [ ] Úložiště: seznam TODO jako verzované soubory v repu (jedna položka = jeden soubor nebo JSONL, human-readable, bez UI-only stavu); contract-first v libs/contracts, resource todos s CRUD + SSE nebo invalidace
       b. [ ] Widget: seznam položek + dole input s výběrem cílů (firmy, projekty, týmy, agenti, workflows), krátký text, Enter nebo tlačítko přidá položku; edit vpravo nahoře dle interaction grammar
       c. [ ] U položky tlačítko, které otevře New task dialog s předvyplněným textem a cílem delegace (jde změnit); po spuštění se položka naváže na run/task a označí se jako delegovaná
       d. [ ] Testy: contract/e2e pro API, komponentové testy widgetu s test-id, i18n klíče cs/en
9. [x] Widget QuickActions: úlohy spustitelné jedním tlačítkem, které se rovnou zařadí do fronty (main@225766d4)
    a. [ ] Definice akce stejným formulářem jako nová automatizace (název, popis, prompt, volitelně workflow, agent, cíl: firma/projekt/tým a další pole); sdílet formulářové komponenty a schema s automatizacemi, ne duplikovat
    b. [ ] Úložiště: akce jako verzované soubory v repu (stejně jako TODO a automatizace), contract-first v libs/contracts, CRUD
    c. [ ] Widget: mřížka tlačítek s názvem a popisem; klik vytvoří task a zařadí ho do fronty bez dialogu, s potvrzením a odkazem na run; edit vpravo nahoře, přidání nové akce dle interaction grammar
    d. [ ] Explicitní workflow nebo agent v akci přebíjí klasifikátor; bez nich se akce routuje jako běžný popsaný task; gate a tier pravidla platí stejně jako u ručně zadaného úkolu
<!-- 10. [ ] Profily strojů: oddělení pracovního a osobního účtu (projekty per stroj zapnuté/vypnuté bez sdílení stavu mezi stroji)
        a. [ ] Strojově lokální konfigurace (mimo verzované soubory, např. data/machine.json): identita stroje, účet a pro každý projekt/firmu příznaky enabled/sync/implementace; projekt může být přidán, ale na daném stroji vypnutý
        b. [ ] Vypnutý projekt: žádný ingest kanálů, žádné autonomní runy, žádný zápis do paměti z jeho dat; UI to jasně ukazuje (štítek, bez akcí)
        c. [ ] Ochrana proti prolínání: poznatky v paměti označené firmou/účtem; ingest na stroji nikdy nenačte do paměti data projektu, který je tam vypnutý
        d. [ ] Vlastnictví kanálů/úkolů mezi stroji (lease se zápisem do sdíleného místa a expirací), aby oba stroje neodpověděly na stejnou zprávu nebo neotevřely duplicitní PR; widget stavu strojů (kdo žije, co běží, poslední sync) -->
10. [x] Self-edit + upgrade: ZIBBY upravuje sám sebe přes worktree a PR, tlačítko Upgrade vedle limitů aktualizuje větev (main@394ab9a8)
        a. [ ] Projekt ZIBBY jako vlastní cíl: úkol běží ve worktree repa, otevře PR, merge zůstává na operátorovi (Tier-3); nahradí duplicitní projekt ZIBBY Copy
        b. [ ] Periodický check main (git fetch) a stav: běžíme na aktuální/zaostáváme o N commitů; tlačítko Upgrade vedle limitů se zobrazí jen pokud je main novější
        c. [ ] Upgrade akce přes gate: kontrola čistého working tree a běžících runů, fast-forward, reinstall závislostí při změně lockfile, restart dev serveru; nikdy nepřepsat lokální necommitnuté změny (včetně paměti)
        d. [ ] Bezpečnostní síť: rollback na předchozí commit, pokud se systém po upgradu nenastartuje; záznam do activity logu
11. [x] Monitoring per projekt: health endpoint se periodicky volá, při chybě notifikace a tlačítko Analyzovat (main@13be31b3)
        a. [ ] Konfigurace projektu: health URL (volitelně metoda, očekávaný status, interval, timeout); nový druh monitoru přes existující MonitorAdapter, stav jako STATE, ne událost
        b. [ ] Sonda: periodické volání, debounce (N selhání po sobě), detekce recovery; historie výsledků v souborech, latence a uptime
        c. [ ] Notifikace při chybě (jen když je to opravdu relevantní) + widget monitoringu s aktuálním stavem projektů
        d. [ ] Tlačítko Analyzovat: spustí read-only analytický run (logy, poslední změny, CI, deploy) a výsledek uloží jako artefakt; žádná autonomní oprava bez schválení
12. [x] Týmy a scope widgetů: entita Team a týmový widget znalostní báze (otevřené otázky a dohody) (main@90440914)
    a. [ ] Entita Team (členové, zdroje: Jira/GitHub projekt, Slack kanál) vedle Company; contract + soubory + UI správy dle interaction grammar
    b. [ ] Společný model widget scope (osobní / tým / firma) + filtr zdroje v nastavení widgetu; ingest strop zůstává mine-and-mentions
    c. [ ] KB widget: otevřené otázky a dohody týmu čtené z týmové znalostní báze (zdroj upřesnit: Confluence/Notion), s odkazem na zdrojovou stránku
    d. [ ] Extrakce rozhodnutí a otevřených otázek z komunikace do paměti, ať se KB nemusí udržovat ručně
<!-- 13. [ ] Runner adaptér: abstrakce nad Claude Code, obecné tiery best/standard/cheap místo názvů modelů
        a. [ ] Rozhraní runneru (run(task, tier, tools, cwd) → stream událostí, výsledek, spotřeba) a přesun současné Claude implementace za něj beze změny chování
        b. [ ] Tier mapping v konfiguraci providera; odstranit pojmenování modelů z doménové vrstvy, UI a logů
        c. [ ] Zachovat approval gate: každý adaptér musí garantovat schválení před akcí (jinak jen read-only nebo se nepoužije); capability matrix per adaptér
        d. [ ] Druhý adaptér (OpenCode jako první kandidát; ověřit podmínky použití předplatného) a fallback řetězec při vyčerpání limitu s viditelným přepnutím v briefingu a respektem k rozpočtu
        e. [ ] Srovnávací sada zlatých úkolů pro porovnání kvality adaptérů a tierů -->
13. [x] Inventář MCP, skills a pluginů na stroji + katalog vlastních skills ZIBBY k instalaci (main@4c13e173)
        a. [ ] Inventář: co je nainstalováno a kde (user/projekt/plugin), zdravé/nefunkční, kdo to používá; zobrazit v sekci AI
        b. [ ] Katalog vlastních skills s verzemi a akce Nainstalovat na tento stroj (přes gate s náhledem změny)
    <!-- 15. [ ] Widget Slack: probíhající konverzace s kolegy a návrhy odpovědí (Socket Mode/Events API, jen mine-and-mentions; odeslání zůstává Tier-3; bez konkrétní odpovědi jen notify-only), nice to have -->
    <!-- 16. [ ] Sentry jako druhý MonitorAdapter a živé metriky nasazených webů ve widgetu monitoringu -->
14. [x] Revize Návrhy: widget co zobrazí systémové návrhy vzniklé z automatizací, s možností zamítnout nebo upravit poznatek (provenance, jistota, expirace) - například z automatizace Továrna agentů, Návrhy na automatizaci, Extrakce vzorů a dalších (main@742a0718)
15. [x] Widget co zobrazuje budgety a limity per project / firmu a zvýraznuje ty, které se blíží k vyčerpání nebo jsou vyčerpány (main@73a4b2b7)
16. [x] Automatické review a zpracování komentářů u PR per firma/projekt (vedle auto synchronizace a auto implementace), s výběrem workflow podle obsahu PR (main@f3192391)
        a. [ ] Přepínače autoReview a autoComments na firmě i projektu (dědění firma → projekt, přepis na projektu), stejný model a UI jako autoPlay a sync; respektují zapnutí projektu na daném stroji
        b. [ ] Triage PR přes Claude: přečte PR (velikost diffu, dotčené soubory, riziko, autor, stav CI) a vybere workflow a hloubku review (rychlý průchod / standardní code-review / důkladné s bezpečnostním a architektonickým pohledem); volba i zdůvodnění se uloží k PR
        c. [ ] Autonomní review jako Tier-2: komentáře se zveřejní a hlásí se v briefingu; schvalování a merge zůstává na operátorovi; explicitní workflow zadané ručně vždy přebije triage
        d. [ ] Zpracování komentářů: sledovat nové komentáře a review na vlastních PR (jen moje), Claude rozhodne zda jde o změnu kódu, dotaz nebo nesouhlas; změny kódu jdou přes stejné workflow jako když uživatel klikne na tlačítko "zpracovat komentáře" s omezeným počtem kol, dotazy se zodpoví konkrétně, jinak jen notifikace
        e. [ ] Ochrany: deduplikace (stejný commit se nereviewuje dvakrát), limit hloubky review dle rozpočtu, komentáře od bota se neberou jako příkazy (Law 4), nepřepisovat cizí větve
17. [x] Widget TODO (main@668b2d8b)
        a. [ ] odstraníme selector na projekty a v inputu musí jít označovat všechno - projekty, firmy, agenti, workflows,... stejně jako v chatu.
        b. [ ] nemám možnost přidané položky smazat
        c. [ ] klik na tlačítko implementace musí otevřít stránku work/tasks/new s předvyplněnými hodnotami podle todo položky
        d. [ ] pokud se z TODO položky stane už běžící task (nebo task ve frontě) tak je z TODO seznamu automaticky smazána
        e. [ ] seznam přidaných položek by se měl zobrazit nad inputem
18. [x] stránka Agenti bude rozdělená do kategorií. KAtegorie = oddělení agenta. Každý agent musí být v oddělení a bude reprezentován kartou s jeho glyphem (main@1bb6f6a5)
19. [x] PullRequest detail - seznam souborů by měl být možný dragand dropem rozšířit a zúžit. Defaultní šířka bude 25% (main@5579357d)
20. [x] Detail běhu - u každé fáze jako první musím vidět jaký o model se jedná. (main@32f591ab)
21. [x] u Pull requestů, které jsou ke schválení musíme rozllišit zde čeká na schválení ode mě (případně mého týmu) nebo zda čeká na schválení od někoho jiného a já (případně můj tým) už code-review udělal a dal na pull request aproove nebo require-changes (main@62b42707)
22. [x] Widgety musí jít zmenšovat a zvětšovat z každého rohu a né jen z pravého spodního (main@ff323b1b)
23. [x] Widgety je možné editovat vždy. Smažeme možnost přechodu do editačního režumu a widgety pujdou vždy přesouvat a zvětšovat/zmenšovat (main@873f8f65)
24. [x] Výchozí layout pujde v dialogu správy layoutů přesunout pod čaru + v dialogu smažeme čipky na přesun a layoouty pujdou vždy jen přesouvat pomocí drag and dropu (main@40341c5c)
25. [x] na detailu PR smažeme tlačítko "Metge na githubu" (main@38eb974e)
26. [x] widget běhy - smažeme progress bary tam kde není stav runnyng. Potřebuju progress bar jen když běh reálně běží. U ostatních stavů zobrazíme místo progress baru ikonku v barvě stavu - error, waiting, success a další (main@c4acb451)
27. [x] coloring-book workflow - ve fázi produkce nemám žádný log. Chci vidět průběh produkce (co se zrovna generuje, výstupy, chyby) v detailu běhu. (main@16341b89)
28. [x] pokud ve workflow existuje zpětný krok kdy se práce vrací z fáze B do fáze A na přepracování - musím pak u fáze A vidět v logu dvě sekce "Kolo 1" a "Kolo 2" kde defaultně bude vždy poslední kolo rozbalené a ostatní kola budou v accordion komponentě sbalené. Accordion bude vždy mít rozbalenou jen jedno kolo (main@9cb1e6a2)
29. [x] Nová feature - ChatAboutThis - idea je taková, že u čehoholiv v systému můžu kliknout na ikonku chatu u toho a můžu mluvit v chatu o tom. Musíme tedy zajistit předání správného contextu do okna chatu. Zkus to zatím udělat u detailu PR. U detailu PR tedy přibude tlačítko "Chat" - zkus to nějak odlišit aby to nebylo jen jako ikonka chatu ale působilo to opravdu jako "pojďme si o tomto promluvit v chatu" a po kliku se otevře chatovací okno, kde bude načten kontext. Chceme to udělat obecně protože tuto fíčuru budeme chtít používat napříč webem a ani teď sáme nevím u čeho všeho ji budeme chtít. (main@8151f5e6)
30. [x] v chatovacím okně jdou měnit modely Haiku/Sonnet/Opus/Fable tak jak je to u claude code normální (main@0e0108bd)
31. [ ] Add "Mentions" widget: list of mentions from all sources (JIRA, GitHub, other channels), list only first, replying later

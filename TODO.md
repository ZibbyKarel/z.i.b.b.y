- [x] sbalovací log u běhu tasku (potřebujeme mít defaultně sbalenou část logu, která je o tom který nástroj se použil nebo který script běžel) — fáze 06

- [x] u projektů chceme mít možnost místo glyphu nahrát logo a zobrazit ho na kartě projektu. Glyp bude jako fallback — fáze 07

- [x] možnost skrýt pravý boční panel — fáze 08

- [x] v prabém bočním panelu jsou špatné časy. Jsou o dvě hodiny posunuté dozadu — fáze 09

- [x] Dropdown nemá props size (Language switcher v topBaru je větší než ostatní prvky v topBaru) — fáze 10

- [x] převést Chat UI na samostatnou stránku místo toho aby to byl jen Overlay — fáze 23

- [x] úplně oddělené kontexty pro projekty — fáze 24. Momentálně máme přepínátko projektů v top baru. To by mělo zajistit to, že vždy budu vidět jen globální informace (agenty, skilly, pipeliny, paměť) a project-specific věci jako běhy tásků. Nechci pak vidět běhy tasků z jiných projektů. Selector projektu v topBaru by pak měl být jediným selectorem. stejný selector z New task dialogu odstraníme a hodnotu vezmeme ze selektoru v topBaru. Zíroveň musí být vždy vyplněn některý projekt. Neexistuje možnost "všechny projekty". Ale můžu mít tasky, které nejsou spojeny s žádným projektem jako třeba výzkumy atp. Přidáme tedy možnost "bez projektu" a u takových běhů chci mít možnost zařadit je do určitého projektu.

- [x] při změně projektu se změní i logo systému z.i.b.b.y na logo, které je uložené u projektu aby to zdůraznilo scope projektu. — fáze 25

- [x] implementovat CommandLine komponentu ke spouštění tasků — fáze 26. Momentálně to máme přes NewTaskDialog ale to je moc neintuitivní UI. Měli bychom jít cestou, kterou máme již v chat UI - "Jeden input zvládne vše". Musím být schopný popsat co chci do jednoho inputu, přes "@" vyhledávat agenty/pipeliny na přiřažení. Do inputu musím být schopný přes tlačítko "+" (či jinou ikonku) přidávat soubory (nebo je tam dropnout přes drag and drop). U inputu bude pak DropDownButton který task spustí (defaultně hned ale budeme moci přes options vybrat za 1h nebo "až se resetují limity"). CommandLine komponenta bude moci být libovolně vysoká ale defaultn bude jen jeden řádek. Vyhledávání agentů by se mělo provádeť inline místo jiného searchboxu který se objeví. New Task Dialog se pak velmi zjednoduší a jedinné co tam budeme potřebovat je pak roztažená CommandLine komponenta na 10řádků třeba.

- [x] sladit desing podle auditu. Stále nám nesedí desing jazyk který máme naimplementovaný a který je v claude design (design je momentálně stažený aktuální ve složce design - soubor ZIBBY Design Audit.html) — fáze 42 (objektivní pravidla auditu: light=life-only, color=state, focus-visible ring, radius 6/10, odstraněn forked state map; subjektivní per-screen redesign type-scale/approval-unifikace/right-rail ponechán operátorovi ke co-designu)

- [x] implementovat /runs podle designu (design je momentálně stažený aktuální ve složce design). Zejména hlavička tasku a log pipeliny musejí sedět — fáze 29

- [x] chat ui - constalace by měla zobrazovat primářně připnuté agenty/pipeliny/řetězce a pak preferuji zobrazovat jen agenty s obrázky

- [x] editace agenta - výběr kategorie bude přes komponentu Select — fáze 11

- [x] avatary agentů na kartách uděláme větší — fáze 22

- [x] na stránce chatu zrušíme by se MainLayout měl lišit. Celé tělo chat stránky musí být fullscreen. Jedná se o "paralelní UI s HUD UI" takže je rovnocenné a né vnořené do HUD UI. — fáze 27

- [x] na stránce /chat nefunguje cmd+k zkratka — fáze 30

- [x] upravme CommandLine komponentu aby sedělat s designem viz velin-b.jsx v design složce. Toto komponentu pak použijeme v NewTaskDialog, na Overview (viz design) a v rámci chat UI — fáze 40

- [x] (fáze 32) nahrával jsem image 184Kb jako avatara pro delivery pipeline a dostal jsem chybu - [api] [Nest] 9038 - 07/07/2026, 10:40:03 AM ERROR [Exception] ✗ PATCH /api/pipelines/delivery 500 {"err":"request entity too large","stack":"PayloadTooLargeError: request entity too large\n at readStream (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/raw-body@3.0.2/node_modules/raw-body/index.js:163:17)\n at getRawBody (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/raw-body@3.0.2/node_modules/raw-body/index.js:116:12)\n at read (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/body-parser@2.2.2/node_modules/body-parser/lib/read.js:113:3)\n at jsonParser (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/body-...(+775)"}
      [api] PayloadTooLargeError: request entity too large
      [api] at readStream (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/raw-body@3.0.2/node_modules/raw-body/index.js:163:17)
      [api] at getRawBody (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/raw-body@3.0.2/node_modules/raw-body/index.js:116:12)
      [api] at read (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/body-parser@2.2.2/node_modules/body-parser/lib/read.js:113:3)
      [api] at jsonParser (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/body-parser@2.2.2/node_modules/body-parser/lib/types/json.js:88:5)
      [api] at Layer.handleRequest (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/router@2.2.0/node_modules/router/lib/layer.js:152:17)
      [api] at trimPrefix (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/router@2.2.0/node_modules/router/index.js:342:13)
      [api] at /Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/router@2.2.0/node_modules/router/index.js:297:9
      [api] at processParams (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/router@2.2.0/node_modules/router/index.js:582:12)
      [api] at next (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/router@2.2.0/node_modules/router/index.js:291:5)
      [api] at cors (/Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/cors@2.8.6/node_modules/cors/lib/index.js:188:7)
      to musíme opravit. Je to velmi malý obrázek. Obrázky do 2Mb by měly být možné nahrávat v pořádku

- [x] (fáze 34) editační dialog pro pipeline mi přijde zbytečný. Můžeme ho zrušit a jeho obsah zobrazit v rámci detail view pipeliny (jen sidepanel s agenty zrušíme a zobrazíme ho jen když uživatel klikne na nové tlačítko + se záměrem přidat agenta. Po přidání agenta se side panel zase zavře případně bude mít uživatel možnost zavřít ho manuálně )

- [x] v chat ui mi chybí přepínátko projektů - dejme do topbaru — fáze 33

- [x] máme moc logů Overview - Nedávná aktivita, pravý side panel v HUD ui a Aktivita panel v Chat UI. chce to sjednotit a nechat na jednom místě — fáze 39 (ponechán HUD pravý rail + /runs; odstraněna Overview karta a chat panel)

- [x] chat ui - místo psaní "Zibby" s buřinkou nad každou zprávou, kterou ZIBBY psal jen barevně oddělíme pozadí zpráv — fáze 33

- [x] chat ui - musíme nějak vizuálně odlišit agenty a pipeliny, které jsou na orbitě. Pipeliny by měly být určitě výraznější než agenti. — fáze 35

- [x] k chat UI musíme vytvořit storybook. Rád bych viděl všechny možné stavy "pozadí" chatu — fáze 37

- [x] stránka běhy a aktivita hlavně pak log fází běhu pipeline nevypadá jako v designu (stránka "Tasky" v designu). Pořádně to předělej podle designu. — fáze 36

- [x] stránka běhy a aktivita - výstup tasku (pokud se jedná o soubor) není formátovaný markdown — fáze 41

- [x] stránka běhy a aktivita - tlačítko "Zastavit běh" na běžícím tasku nic nedělá. Z potvrzovacího dialogu se neodešle žádný request na backend — fáze 43

- [x] na stránce chatu nevidím běžící tasky pokud byly spuštěny z HUD UI. Měl bych vidět na levé straně aktivní tasky — fáze 50 (levý rail "Běží" v ChatScreen, data z useRunsQuery, scoped na aktivní projekt)

- [x] na stránce chatu není použita CommandLine komponenta — fáze 38 (ChatScreen renderuje CommandLine v send-delegation módu)

- [x] vyhledávání agentů a pipeline v CommandLine komponentě nefunguje inline. Zobrazí se externí vyhledávací políčko což je špatné UX. Pokud napíšu "@" měla by se automaticky pod kurzorem zobrazit plachta s výsledky vyhledávání tak jak je to v design — fáze 45

- [x] v souboru PipelineStageTimeline odstraníme tlačítko "log" které zobrazuje log fáze a funkcionalitu nahradíme komponentou Accordion kde bude stačit kliknout na celý řádek fáze aby se log zobrazil/schoval — fáze 46

- [x] stránka běhy a aktivita - na detailu tasku v headeru bych místo klasického glyphu v levo nahoře zobrazil avatara (s fallbackem na glyph) přiřazeného agenta nebo pipeliny. Avatar by měl být vpravo — fáze 48

- [x] stránka běhy a aktivita - na detailu tasku, který skončil chybou mi chybí tlačítko "resume", které pustí task znova (ideálně tak aby se nemusel znovu celý opakovat a načítat context) — fáze 49 (--resume session, fallback fresh re-run; jen agent runs)

- [x] DropdownButton v CommandLine nemá asi správný disabled stav. stále vypadá že je aktivní jen na něj nejde kliknout — fáze 47

- [x] inline vyhledávání v komponentě CommandLine má několik problémů 1. Nezobrazuje se pod kurzorem ale pod inputem coš je divné UX pokud je COmmandLine roztažená přes více řádků 2. v HUD UI na Overview stránce je plachta s výsledky překrytá obalovým divem celé komponenty CommandLine 3. v Chat UI kde je CommandLine vykreslena ve spodu stránky se plachta s výsledky vůbec nevejde, V takovém případě by se měla vykreslit nad kurzorem místo pod ním — fáze 51 (portál na body, caret-anchor přes mirror-div, flip nad kurzor)

- [x] CommandLine componenta - tlačítko odeslání i tlačítka na přidání souborů by měla být pozicována "uvnitř inputu". Je potřeba ale zajistit aby text inputut nezasahoval do tlačítek — fáze 51 (absolutní controls uvnitř inputu + rezervovaný paddingBottom)

- [ ] stránka běhy a aktivita - log běhu nesedí s designem. Měl by být obalen v CodeBlock componentě

- [ ] stránka běhy a aktivita - avatar přiřazeného agenta nebo pipeliny by měl být dělaný stejně jako v HeroEntity komponentě - čili jako roztažené pozadí

- [x] stránka Projekty - na kartě projektu zobrazíme ve footeru stejné statistiky jako máme v detailu projektu ohledně úkolů (mimo "Celkem"). Opěd budou jednotlivé ásti možné prokliknout na vyfiltrovanou stránku běhy a aktivita — fáze 52 (sdílený useProjectTaskStats, deep-link na /runs?filter)

- [ ] CosmicScene - ringsLayer je moc výrazná. Zkus místo toho vymyslet nějakou jinou variantu vizualizace stavu, které momentálně využívají rigns

- [ ] CosmicScene - Error stav a stav waiting for aprooval je poměrně stejný. Waiting for approval bych dal jako "warning tone"

- [ ] Chat UI - momentálně vidím jen běžící tasky ale měl bych vidět všechny tasky ve vybraném projektu (nebo bez projektů) v panelu tasků na levo. Chat UI by mělo být plnohodnoté UI.

- [ ] Chat UI - musím být schopný přes cmd-k zkratku si zobrazit detail vybraného výsledku v dialogu a né ho jen přidat do kontextu inputu dole (tohle chování je duplicitní s inline searchem komponenty CommandLine)

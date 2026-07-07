- [x] sbalovací log u běhu tasku (potřebujeme mít defaultně sbalenou část logu, která je o tom který nástroj se použil nebo který script běžel) — fáze 06

- [x] u projektů chceme mít možnost místo glyphu nahrát logo a zobrazit ho na kartě projektu. Glyp bude jako fallback — fáze 07

- [x] možnost skrýt pravý boční panel — fáze 08

- [x] v prabém bočním panelu jsou špatné časy. Jsou o dvě hodiny posunuté dozadu — fáze 09

- [x] Dropdown nemá props size (Language switcher v topBaru je větší než ostatní prvky v topBaru) — fáze 10

- [x] převést Chat UI na samostatnou stránku místo toho aby to byl jen Overlay — fáze 23

- [x] úplně oddělené kontexty pro projekty — fáze 24. Momentálně máme přepínátko projektů v top baru. To by mělo zajistit to, že vždy budu vidět jen globální informace (agenty, skilly, pipeliny, paměť) a project-specific věci jako běhy tásků. Nechci pak vidět běhy tasků z jiných projektů. Selector projektu v topBaru by pak měl být jediným selectorem. stejný selector z New task dialogu odstraníme a hodnotu vezmeme ze selektoru v topBaru. Zíroveň musí být vždy vyplněn některý projekt. Neexistuje možnost "všechny projekty". Ale můžu mít tasky, které nejsou spojeny s žádným projektem jako třeba výzkumy atp. Přidáme tedy možnost "bez projektu" a u takových běhů chci mít možnost zařadit je do určitého projektu.

- [x] při změně projektu se změní i logo systému z.i.b.b.y na logo, které je uložené u projektu aby to zdůraznilo scope projektu. — fáze 25

- [x] implementovat CommandLine komponentu ke spouštění tasků — fáze 26. Momentálně to máme přes NewTaskDialog ale to je moc neintuitivní UI. Měli bychom jít cestou, kterou máme již v chat UI - "Jeden input zvládne vše". Musím být schopný popsat co chci do jednoho inputu, přes "@" vyhledávat agenty/pipeliny na přiřažení. Do inputu musím být schopný přes tlačítko "+" (či jinou ikonku) přidávat soubory (nebo je tam dropnout přes drag and drop). U inputu bude pak DropDownButton který task spustí (defaultně hned ale budeme moci přes options vybrat za 1h nebo "až se resetují limity"). CommandLine komponenta bude moci být libovolně vysoká ale defaultn bude jen jeden řádek. Vyhledávání agentů by se mělo provádeť inline místo jiného searchboxu který se objeví. New Task Dialog se pak velmi zjednoduší a jedinné co tam budeme potřebovat je pak roztažená CommandLine komponenta na 10řádků třeba.

- [ ] sladit desing podle auditu. Stále nám nesedí desing jazyk který máme naimplementovaný a který je v claude design (design je momentálně stažený aktuální ve složce design - soubor ZIBBY Design Audit.html)

- [ ] implementovat /runs podle designu (design je momentálně stažený aktuální ve složce design). Zejména hlavička tasku a log pipeliny musejí sedět

- [x] chat ui - constalace by měla zobrazovat primářně připnuté agenty/pipeliny/řetězce a pak preferuji zobrazovat jen agenty s obrázky

- [x] editace agenta - výběr kategorie bude přes komponentu Select — fáze 11

- [x] avatary agentů na kartách uděláme větší — fáze 22

- [x] na stránce chatu zrušíme by se MainLayout měl lišit. Celé tělo chat stránky musí být fullscreen. Jedná se o "paralelní UI s HUD UI" takže je rovnocenné a né vnořené do HUD UI. — fáze 27

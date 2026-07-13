BATCH: web-memory

[SEVERITY: Medium] [FILE: apps/web/features/memory/filterGraph.ts:27] [CATEGORY: Dead code]
`filterGraphByProject` je exportovaná funkce testovaná ve `filterGraph.test.ts`, ale nikde v aplikaci se nepoužívá — Screen.tsx filtruje graf jen podle `tier`, project-scope byl dle poznámky "Phase 108" odstraněn.
Doporučení: odstranit `filterGraphByProject` (a příslušné testy), nebo pokud je plánovaný návrat project-scope filtru, přidat komentář/TODO odkazující na plán.

[SEVERITY: Medium] [FILE: apps/web/features/memory/components/NoteEditorDialog.tsx:34-58, apps/web/features/memory/components/QuickCapture.tsx:29-58] [CATEGORY: Duplicitní vzor]
Obě komponenty nezávisle implementují stejnou logiku "auto-slug title→id", každá s mírně odlišným chováním (NoteEditorDialog trackuje `idDirty`, QuickCapture generuje timestamp fallback) — riziko rozjetí chování při budoucí úpravě jednoho místa.
Doporučení: extrahovat sdílený hook (např. `useAutoSlugId`) do sdíleného modulu.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/NoteEditorDialog.tsx:76-91, apps/web/features/memory/components/ImportDialog.tsx:57-72] [CATEGORY: Duplicitní vzor]
Obě dialogová okna staví téměř identický `actions` blok (Cancel ghost tlačítko + primary submit s `loading`/`disabled`) — stejný vzor se opakuje i v jiných feature dialozích napříč apps/web (NewTaskDialog, NewChainDialog aj.), takže jde o širší duplicitu.
Doporučení: zvážit DS-level `DialogActions`/`ConfirmActions` primitivum pro pár Cancel+Submit tlačítek s loading stavem.

[SEVERITY: Medium] [FILE: apps/web/features/memory/Screen.tsx] [CATEGORY: Chybějící pokrytí testy]
Screen.tsx (237 řádků, nejrozsáhlejší soubor v batchi) orchestruje loading/error/empty stavy, tier filtr, search filtr a tři dialogy, ale neexistuje `Screen.test.tsx`.
Doporučení: přidat test na loading/error/empty state a na filtrování search hitů podle tier.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/MemoryGraph.tsx] [CATEGORY: Chybějící pokrytí testy]
Existuje pouze `MemoryGraph.simulate.test.ts` pro čistou simulační funkci; samotná komponenta (render SVG uzlů/hran, klik → `onSelect`, zvýraznění `selectedId`) nemá vlastní test.
Doporučení: doplnit lehký render test ověřující, že klik na uzel volá `onSelect` se správným id.

[SEVERITY: Low] [FILE: apps/web/features/memory/Screen.tsx:38-237] [CATEGORY: Komponenta na míru / kompozice]
Screen.tsx skládá header/toolbar/quickCapturePanel/editorDialog/importDialog jako lokální JSX proměnné uvnitř jedné funkce místo menších pojmenovaných subkomponent — zatím pod hranicí 300 řádků, ale vzor roste s každou fází.
Doporučení: při další fázi extrahovat `SearchResultsPanel` (řádky 186-213) a `MemoryToolbar` (řádky 122-135) do samostatných souborů.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/QuickCapture.tsx:29-31] [CATEGORY: Business logika v komponentě]
`untitledId()` je modulová čistá funkce, ale generování id (timestamp-based slug) je byznys pravidlo duplicitní se slug logikou v `NoteEditorDialog`.
Doporučení: sloučit s navrhovaným `useAutoSlugId` hookem.

STATS: 20 souborů (source + testy), 1584 řádků celkem. Top 3: Screen.tsx (237), NoteView.tsx (202), MemoryGraph.tsx (184).

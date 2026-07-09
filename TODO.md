# TODO — follow-ups

## Fáze 90 (hero art) — vědomě osekaná kvůli limitům, dodělat:

- [x] **Testy k hero artu**: drawer-header test na image větev + fallback; registry fs check, že soubor reálně leží. _(Fáze 103)_
- [ ] **Konzistenční pass přes rodinu**: vygenerován jen 1 kandidát na subsystém (plán chtěl 2–3 + výběr). Udělat contact-sheet všech 8, vyřadit/regenerovat outliery, sladit měřítko figury a hustotu efektů. _(ODLOŽENO — image-generation taste work, vyžaduje lidský výběr kandidátů; není součástí autonomního code PR.)_
- [x] **Výška hero bandu v draweru**: band vyšší, ať art dýchá. _(Fáze 103: `minHeight` 168→224 + posun pozice.)_
- [x] **Optimalizace assetů**: PNG/JPG → WebP + fallback. _(Fáze 103: 8× WebP, 58–64 % úspora, `image-set(webp, jpg)` v `heroBandStyle`.)_
- [ ] **Oficiální Forge boss art**: zvážit crop originálu z `design/Z.I.B.B.Y/uploads/Forge.png` místo re-generace. _(ODLOŽENO — brand/taste rozhodnutí operátora.)_
- [ ] **Finální barvy subsystémů**: registry barvy jsou pořád provizorní. _(ODLOŽENO — čeká na rozhodnutí o paletě; regrade artu až potom.)_

## Otevřené otázky z federation arc (PR #49, rozhodnutí operátora):

- [ ] Per-project gate rules — re-homing globálního katalogu na projekt + precedence; do té doby je odložené i sentence-builder AUTHORING UI (renderování vět už je). _(ODLOŽENO — velká architektonická změna vlastnictví/precedence pravidel; vyžaduje design rozhodnutí před implementací.)_
- [ ] Drawer na mobilu + více draverů najednou (v1: sheet pod lg, jeden drawer). _(ODLOŽENO — UX design úloha navazující na Fázi 99; vědomý v1 scope.)_
- [x] Rim particles (node→node) — chain-runs SSE scope na API. _(Fáze 104: `chain-runs` scope zapojen do `/api/events` (`ChainRunnerService.onRunStatus`) + web invalidace; reálný datový tok. Samotné vykreslování rim particles zůstává odloženou vizuální polish na tomto reálném feedu — už ne fake.)_
- [x] `.playwright-mcp/*.png` historicky trackované v gitu (před gitignore). _(Fáze 104: untrackováno přes `git rm --cached`.)_

## Další nalezené věci

- [x] Detail projektu - odstranit z projektu pole "Cesta k rootu". _(Fáze 98: `path` je nyní volitelný v kontraktu — machine-local, odvozený ze Settings clone-base; pole odstraněno. Preferovaný model „naklonovat duplicitní repo vedle" zůstává v platnosti.)_
- [x] Detail projektu - Kategorie se bude vybírat přes Selector _(Fáze 98: DS `SelectField`)_
- [x] Detail projektu - Tlačítko "Klonovat" by mělo být ve stavu loading když se klonuje a né disabled. _(Fáze 98)_
- [x] Chat UI - detail subsystému by měl být širší aby se tam všely všechny informace v pohodě _(Fáze 99: `lg:w-[520px]`)_
- [x] Chat UI - detail subsystému nejde zavřít _(Fáze 99: drawer vyzvednut z z-10 stacking kontextu na z-30 — close/Escape teď fungují)_
- [x] Chat UI - detail subsystému - Tlačítko přidat pravidlo nelze zmáčknout _(Fáze 99: stejný stacking fix + Panel maxHeight 100 %)_
- [x] Chat UI - kliknutí na kartu tasku nalevo by mělo otevřít detail tasku přímo hned vedle karty nikoliv přesměrovat na stránku "/runs" _(Fáze 100: inline `ChatTaskDetailColumn` vedle gutteru, sdílený `useRunActions`)_
- [x] Chat UI - orby subsystémů by měly být obalené vlastním oktagonem, který bude spojený s oktagonem okolo hlavního Orbu krátkou čarou místo toho aby vedla čára od centrálního oktagonu do středu orbu sub systému _(Fáze 101)_
- [x] Odstraníme globální selector projektu jak v HUD tak v Chat UI - projekt se bude vybírat přes inline selector v CommandLine komponentě _(Fáze 102: sdílený `ProjectSelect` chip v control řádku CommandLine; `ProjectSwitcher` odmountován, `projectSlot` plumbing odstraněn)_

# TODO — follow-ups

## Fáze 90 (hero art) — vědomě osekaná kvůli limitům, dodělat:

- [ ] **Testy k hero artu**: drawer-header test na image větev (heroImage set → background obsahuje url(), fallback větev bez obrázku zůstává pokrytá); registry test rozšířit z „cesta existuje" na kontrolu, že soubor v `apps/web/public/subsystems/` reálně leží (build-time check nebo aspoň vitest fs check).
- [ ] **Konzistenční pass přes rodinu**: vygenerován jen 1 kandidát na subsystém (plán chtěl 2–3 + výběr). Udělat contact-sheet všech 8, vyřadit/regenerovat outliery, sladit měřítko figury a hustotu efektů.
- [ ] **Výška hero bandu v draweru**: band je content-driven (~120 px) — portrét je jen proužek. Zvážit vyšší band (min-height) nebo aspect-ratio variantu, ať art dýchá; případně `EntityHero imageBleed` idiom z run-detailu.
- [ ] **Optimalizace assetů**: PNG → WebP/AVIF + srcset; teď jen sips komprese na ~×00 kB.
- [ ] **Oficiální Forge boss art**: zvážit crop originálu z `design/Z.I.B.B.Y/uploads/Forge.png` (bez textového panelu) místo re-generace, pokud regenerovaná verze neladí s brandem.
- [ ] **Finální barvy subsystémů**: registry barvy jsou pořád provizorní (deferred design item) — až padne rozhodnutí, přegenerovat/přebarvit art podle finální palety.

## Otevřené otázky z federation arc (PR #49, rozhodnutí operátora):

- [ ] Per-project gate rules — re-homing globálního katalogu na projekt + precedence; do té doby je odložené i sentence-builder AUTHORING UI (renderování vět už je).
- [ ] Drawer na mobilu + více draverů najednou (v1: sheet pod lg, jeden drawer).
- [ ] Rim particles (node→node) — potřebují chain-runs SSE scope na API (`ChainRunnerService.onRunStatus` není zapojený do `/api/events`); bez něj by byly fake.
- [ ] `.playwright-mcp/*.png` historicky trackované v gitu (před gitignore) — rozhodnout, jestli vyčistit.

## Další nalezené věci

- [x] Detail projektu - odstranit z projektu pole "Cesta k rootu". _(Fáze 98: `path` je nyní volitelný v kontraktu — machine-local, odvozený ze Settings clone-base; pole odstraněno. Preferovaný model „naklonovat duplicitní repo vedle" zůstává v platnosti.)_
- [x] Detail projektu - Kategorie se bude vybírat přes Selector _(Fáze 98: DS `SelectField`)_
- [x] Detail projektu - Tlačítko "Klonovat" by mělo být ve stavu loading když se klonuje a né disabled. _(Fáze 98)_
- [x] Chat UI - detail subsystému by měl být širší aby se tam všely všechny informace v pohodě _(Fáze 99: `lg:w-[520px]`)_
- [x] Chat UI - detail subsystému nejde zavřít _(Fáze 99: drawer vyzvednut z z-10 stacking kontextu na z-30 — close/Escape teď fungují)_
- [x] Chat UI - detail subsystému - Tlačítko přidat pravidlo nelze zmáčknout _(Fáze 99: stejný stacking fix + Panel maxHeight 100 %)_
- [x] Chat UI - kliknutí na kartu tasku nalevo by mělo otevřít detail tasku přímo hned vedle karty nikoliv přesměrovat na stránku "/runs" _(Fáze 100: inline `ChatTaskDetailColumn` vedle gutteru, sdílený `useRunActions`)_
- [x] Chat UI - orby subsystémů by měly být obalené vlastním oktagonem, který bude spojený s oktagonem okolo hlavního Orbu krátkou čarou místo toho aby vedla čára od centrálního oktagonu do středu orbu sub systému _(Fáze 101)_
- [ ] Odstraníme globální selector projektu jak v HUD tak v Chat UI - projekt se bude vybírat přes inline selector v CommandLine komponentě

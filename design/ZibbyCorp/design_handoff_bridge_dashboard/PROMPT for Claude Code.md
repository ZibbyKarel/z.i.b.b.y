Přidej do aplikace novou stránku **Bridge / Můstek** vedle stávajícího dashboardu. Stávající dashboard nemaž ani neměň; jen do navigace přidej položku „Bridge" (route `/bridge`, v češtině „Můstek", pokud je UI česky).

## Zdroj designu
Do repa jsem stáhl celý design projekt. Použij tyto soubory:
- `design_handoff_bridge_dashboard/README.md` – přesná specifikace (čti celé, než začneš).
- `Bridge Dashboard v2.dc.html` (kopie je i v `design_handoff_bridge_dashboard/reference/`) – **zdroj pravdy**. Při rozporu s README vyhrává tento soubor.
- `zc-data.js`, `zc-inbox.js` – tvar dat (`window.ZC`, `window.ZI`).
Ostatní `*.dc.html` jsou jiné obrazovky nebo starší verze. Ignoruj je. Nekopíruj `support.js` ani žádný `.dc.html` do produkčního kódu.

## Úkol
1. Prozkoumej repo: stack, routing, komponenty, způsob stylování, stávající dashboard, datovou vrstvu. Drž se existujících konvencí.
2. Vytvoř stránku Bridge, která je **1:1 s referencí**: 12sloupcový board s absolutně pozicovanými widgety, 4 hustoty (default Airy), layout presety DEFAULT/REVIEW/INCIDENT, edit mód (drag, resize, katalog widgetů, SAVE AS, RESET), detailní panel ukotvený k vybranému řádku, klávesy J/K/Esc, widgety Briefing, Issues, Pull Requests, Tasks, Running Now, Incidents, Errors, Alerts.
3. Přenes logiku tak, jak je (`compact()`, `measure()`, `TS()`, `mergeReady()`, `rowBase()`, hustotní tabulka `VAR`, výchozí layouty). Rozděl ji do čistých modulů/komponent v našem stacku.
4. Data: pokud existují skutečné zdroje, napoj je a namapuj na tvar z `zc-data.js`/`zc-inbox.js`. Pokud ne, vlož mock data za tenké rozhraní, které se dá snadno nahradit. Napiš mi, co zůstalo na mocku.
5. Perzistenci (localStorage `zc-bridge-v2`) nech zatím v localStorage.

## Pravidla pro věrnost (důležité)
- Hodnoty přepisuj **doslova** z reference (px, barvy, letter-spacing, fonty Geist + Geist Mono). Nepřevádět na Tailwind škálu, nepoužívat výchozí hodnoty UI knihovny tam, kde se liší.
- Žádné zaoblení, stíny (kromě hustoty Open), gradienty, emoji ani ikonová knihovna. Glyfy `▾ ▸ × ↗ →` jsou text.
- Nic „nevylepšuj" a nepřidávej, co v designu není.
- Min-width 1440px, respektuj `prefers-reduced-motion`.

## Ověření (povinné)
Spusť aplikaci a Playwrightem udělej screenshoty referenčního HTML i své stránky ve stejných stavech a rozlišeních (1440×900, 1920×1080): výchozí board, každá hustota, edit mód, katalog, detail issue/task/PR/approval, vybraný řádek, sbalený a prázdný widget, každý preset. Porovnej a opravuj, dokud nezůstanou jen zanedbatelné rozdíly. Nehlas hotovo na základě „vypadá podobně".

Na konci vypiš: co je hotové, kde jsou odchylky od reference a proč, co je na mocku.

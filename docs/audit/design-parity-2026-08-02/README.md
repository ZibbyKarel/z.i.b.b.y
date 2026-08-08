# Design parity audit — delta pass, 2026-08-02

Toto **není** nový nezávislý audit celého systému proti celému designu — je to
**delta pass** nad `docs/audit/design-parity-2026-08-01/system-only.md`. Od
2026-08-01 přibylo v `design/Z.I.B.B.Y/` sedm nových/aktualizovaných zdrojů
(commit `3f221fc8`, "various changes"):

- šest **net-new mockupů**, každý explicitně označený komentářem `P0 #N` a
  citující přesně ty systémové soubory, které minulý audit označil jako
  chybějící: `ZIBBY Commands.html` (P0 #1), `ZIBBY Companies.html` (P0 #2),
  `ZIBBY Hooks.html` (P0 #3), `ZIBBY MCP servery.html` (P0 #4), `ZIBBY
  Signály.html` (P0 #5), `ZIBBY Handoff.html` (P0 #6)
- dva **aktualizované komponentní zdroje** beze svého vlastního mockupu:
  `zibby/pipeline-graph.jsx` + `zibby/pipelines.jsx` (verify/qualify uzly,
  `ownerSubsystem`, `sinks`) a `zibby/automations.jsx` (systémové cíle,
  systémová vs. operátorská automatizace, edit dialog, honest next-run)
- jeden nový mockup beze změny obsahu: `ZIBBY Agenti.html` — reuses
  nezměněný `agents.jsx`, nepřidává nic nad rámec toho, co už minulý audit
  poznamenal (Agenty mají koncept v doku, jen ne vlastní obrazovku)

## Metoda

8 nezávislých subagentů (Sonnet), každý na jeden nový design zdroj proti
přesně těm systémovým souborům, které cituje odpovídající `P0 #N` komentář
(nebo, u Pipelines/Automations, proti původním nálezům v sekcích Pipelines a
Agenty/Automatizace). Každý agent posoudil: je nález RESOLVED (zavřít),
PARTIAL (zúžit na to, co designu skutečně ještě chybí), nebo STILL OPEN.
Stejná pravidla jako minule — mock/hardcoded data se nepočítá jako mezera,
kosmetika taky ne.

**Kontrola dosažitelnosti.** Pro Pipelines a Automations agenti navíc ověřili,
jestli aktualizovaný jsx skutečně vykresluje nějaký in-scope mockup, nebo jen
sedí v souboru, který nikdo neimportuje jako obrazovku. Výsledek: **ani jeden
z nich není dosažitelný** — `pipeline-graph.jsx` i `automations.jsx` táhne
pořád jen `ZIBBY Velin.html`, kterou předchozí audit (viz jeho `README.md`)
explicitně vyřadil jako celou obrazovku mimo rozsah; `pipelines.jsx` je sice
odkazován i ze dvou in-scope mockupů (`ZIBBY Agenti.html`, `ZIBBY Pravidla
schvalování.html`), ale ani v jednom se `PipelinesBody`/`PipelineCard`
skutečně nemountuje — jen se z něj importují sdílené helpery. Podle vlastní
metodiky předchozího auditu se tedy obsah v těchto dvou souborech (byť
reálný a věcně relevantní) **nepočítá jako "už nadesignováno"**, dokud
nedostane vlastní in-scope mockup. Nálezy v sekcích Pipelines a
Automatizace proto zůstávají v `system-only.md` otevřené, jen s dated
poznámkou u těch, kterých se update obsahově týká.

## Co tento pass NEdělá

- **Nere-auditoval `design-only.md`** — nekontroloval, jestli nějaký nový
  mockup omylem přidal UI/stav, který v systému neexistuje (kromě jednoho
  vedlejšího nálezu u MCP serverů, viz níže — zaznamenán jen jako poznámka
  v `system-only.md`, ne jako formální položka v `design-only.md`).
- **Neprocházel znovu celý systém** — jen ty konkrétní nálezy z
  `system-only.md`, ke kterým teď existuje nový design.
- Sekce beze změny (Roadmap, Chat UI/Velin-D, zbytek Tasks/Archive kromě
  Commands, Projects, Integrations, matcher „context"/gate-rule
  `ownerSubsystem`/`Approval.ownerSubsystem`, Overview/Voice/Briefing,
  Standalone Orb, Velin-B) nebyly nijak revidovány — v designu k nim od
  2026-08-01 nic nepřibylo.

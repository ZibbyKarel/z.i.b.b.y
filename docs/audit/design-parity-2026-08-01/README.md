# Design parity audit — 2026-08-01

Celý web (`apps/web`) porovnaný s celým designem (`design/Z.I.B.B.Y/`). Dva výstupy:

- **`system-only.md`** — co je v systému, ale chybí v designu
- **`design-only.md`** — co je v designu, ale není implementováno v systému

Toto je **inventura funkcí/obsahu, ne pixelový diff** — barva/mezera/font se
neposuzuje; jen skutečně chybějící/navíc obrazovky, panely, tlačítka, pole, stavy a
toky. Roadmap má vlastní krátkou sekci v obou souborech, doplněnou přímo z předchozí
`/design-match` session (ne subagentem) — jde o rozdíly, které jsi tehdy vědomě
nevybral k dorovnání.

## Rozsah — co bylo (a nebylo) porovnáváno

Zadání znělo „v designu neprocházej velín a -c". Design v repu má dvě generace
plošných HUD mockupů před dnešním chat-centrickým „Velin-D": obyčejný **„Velín"**
(`ZIBBY Velin.html`, plná stará HUD obrazovka s postranní navigací) a **„Velín-C"**
(component-rodina `velin-c-*.jsx`, mezistupeň mezi Velín a Velin-D). Žádný mockup
`ZIBBY Velin-C.html` v repu neexistuje — jen ty jsx komponenty.

Rozhodl jsem se pro toto čtení, ověřené skutečnou strukturou `<script>` odkazů v
mockupech (`grep -o 'zibby/[a-zA-Z0-9_.-]*\.jsx' design/Z.I.B.B.Y/*.html`):

- **`ZIBBY Velin.html` jako celek je mimo rozsah** — nebyl porovnáván jako vlastní
  obrazovka. Jeho vlastní jsx soubory (`app.jsx`, `overview.jsx`, `agents.jsx`,
  `automations.jsx`, `pipelines.jsx`, `projects.jsx`, `runs.jsx`, `settings.jsx`,
  `skills.jsx`, `tasks.jsx`, `task-detail.jsx`, `new-task.jsx`, `memory.jsx`,
  `integrations.jsx`, `definitions.jsx`, `approvals.jsx`, `gate-rules-*.jsx`,
  `voice.jsx`, `markdown.jsx`, `entity-hero.jsx`, `pipeline-graph.jsx`) jsem AŽ na
  výjimku níže nečetl jako design cíl pro dané trasy.
- **Výjimka:** několik z těch stejných jsx souborů je zároveň skutečně vykreslováno
  jiným, IN-SCOPE mockupem (`ZIBBY Redesign Canvas.html` táhne `overview.jsx`,
  `overview-cards.jsx`, `approvals.jsx`, `voice.jsx`; `ZIBBY Pravidla schvalování.html`
  táhne `gate-rules-*.jsx`, `approvals.jsx`). V těch případech JSOU čtené a
  porovnávané — ale jen v kontextu toho mockupu, ne jako by to byl „Velín".
- **`velin-c.jsx`** (router/shell Velín-C) a **`velin-c-map.jsx`** (systémová mapa
  jen pro Velín-C) jsou mimo rozsah — žádný in-scope mockup je nevyužívá.
- **`velin-c-data.jsx`, `velin-c-tasks.jsx`, `velin-c-pipelines.jsx`,
  `velin-c-detail.jsx`** JSOU v rozsahu — jsou to živé závislosti dnešního
  `ZIBBY Velin-D.html` (aktuální chat UI) a `ZIBBY Archiv úloh.html`, ne pozůstatek.
- **`design/Z.I.B.B.Y/before/`, `redesign/`, `scraps/`** — historické/exploratorní
  podadresáře, nenavázané `<script>` odkazem z žádného aktuálního `.html` mockupu;
  vynechány jako mimo rozsah.

Pokud jsi „velín a -c" myslel/a jinak, dej vědět — je to jediné místo v tomto auditu,
kde jsem se musel/a rozhodnout bez tvého potvrzení.

**V rozsahu byly:** `ZIBBY Roadmap.html` (Task 1, samostatně), `ZIBBY Velin-D.html`
(+ velin-c-data/tasks/pipelines/detail), `ZIBBY Velin-B.html`, `ZIBBY Archiv úloh.html`,
`ZIBBY Pravidla schvalování.html`, `ZIBBY Redesign Canvas.html`, `ZIBBY Design
Audit.html`, `ZIBBY Implementace - Changelog.html`, `ZIBBY Loading Screen.html`,
`ZIBBY Orb.html`.

## Metoda

8 nezávislých subagentů (Sonnet), každý na jednu koherentní feature oblast, čtoucí
design jsx (co skutečně vykreslují — ne jen název souboru) proti reálnému kódu v
`apps/web` + `libs/design-system`. Mock/hardcoded data v designu vs. reálná data v
systému se nepočítá jako nález (stejná funkce, jiný zdroj dat); kosmetické rozdíly v
pojmenování taky ne — jen strukturální/obsahové mezery.

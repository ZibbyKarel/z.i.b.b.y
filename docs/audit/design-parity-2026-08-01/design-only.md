# Design parity audit — 2026-08-01

## V designu, ale ne v systému

Rozsah a metoda: viz `README.md` ve stejné složce. Toto je inventura funkcí/obsahu, ne
pixelový diff — barvy/mezery/fonty se neposuzují.

---

### Roadmap

_(zjištěno přímo v předchozí `/design-match` session, ne subagentem — jde o rozdíly,
které operátor v té session vědomě NEVYBRAL k dorovnání s designem, takže zůstávají
platné dodnes)._

- **Nadpis "Roadmap" + podtitulek v levém railu** — design má nad seznamem epiků
  vlastní titulní řádek, systém rail vede rovnou epiky.
- **"Nový epik" jako vyplněné accent tlačítko** — design ho kreslí jako primární
  (filled) akci, systém jako ghost/intent tlačítko.
- **Kruhový vs. zaoblený čtvercový tvar ikonové dlaždice epiku**.
- **Malé inline "+" tlačítko rychlého přidání přímo v hlavičce sloupce TO DO** — design
  ho má vedle popisky sloupce, systém nabízí jen "Nový task" v horní liště panelu.
- **`SysTag` (subsystémový štítek vedle jména epiku)** — design ho zobrazuje, systém
  nemá na `RoadmapItem` žádné pole pro vlastnící subsystém.

### Chat UI (Velin-D)

- **Sekce "Hlášení" (report) ve status pilulce je hoverovatelná** — v designu najetí otevře plachtu se seznamem hlášení; v systému je "report" jen statický nehoverovatelný počet. `design/Z.I.B.B.Y/zibby/velin-d.jsx:54-71,187-191` vs `apps/web/features/chat/components/StatusPill.tsx`
- **Ikony pravého doku se při najetí rozbalí do náhledové plachty s živým seznamem** — systémový dok jsou jen odkazy s tooltipem. `design/Z.I.B.B.Y/zibby/velin-d-dock.jsx:34-92` vs `apps/web/features/chat/components/ChatToolDock.tsx`
- **Klik na centrální orb otevírá modál "Nastavení systému"** (Jazyk / Hlasový režim / Vzhled / Účet & limity) — systém po kliknutí na jádro tento seznam nikde nezobrazuje. `design/Z.I.B.B.Y/zibby/velin-d.jsx:89-123,242`
- **"@" nápověda umí zmínit projekt** — systémový mention picker zná jen `agent | pipeline | subsystem`. `design/Z.I.B.B.Y/zibby/velin-d-chat.jsx:12-27` vs `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:180-186`
- **Přepínač na alternativní pohled "Velín-C" (klasické orby) v top baru** — systém tento přepínač záměrně nemá (potvrzeno komentářem v kódu). `design/Z.I.B.B.Y/zibby/velin-d.jsx:226-228`

### Tasks / Archive / Commands

- **Časové skupiny v archivním seznamu** (Dnes / Včera / Tento týden / Starší s počty) — systémová `/archiv` je plochý nekonečně dotahovaný seznam (seskupování bylo v systému zrušeno). `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html:354-361` vs `apps/web/features/archive/Screen.tsx:195-213`
- **Rozbalovací quick-pick vyhledávací overlay v topbaru** s přímým výběrem z výsledkové plachty — systém má jen prostý `SearchInput`. `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html:92-160` vs `apps/web/features/archive/Screen.tsx:150-158`
- **Periodicita při zakládání úlohy** (Jednorázově / Každý den / Každý týden / Na událost) — systémový composer nabízí jen jednorázové naplánování. `design/Z.I.B.B.Y/zibby/velin-c-detail.jsx:126-138,304-309` vs `apps/web/features/tasks/task.ts:261`
- **Zobrazení gate/tier v potvrzení založení úlohy** — systémový ack řádek to nezobrazuje. `design/Z.I.B.B.Y/zibby/velin-c-detail.jsx:108-151` vs `apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:355-375`
- **Bohatší blok PR výstupu** (číslo PR, název, branch → base, diff, stav CI s ikonou) — systémová `PrOutputCard` ukazuje jen odkaz a barevné +/− součty. `design/Z.I.B.B.Y/zibby/velin-c-tasks.jsx:218-241` vs `apps/web/features/runs/components/RunDetail.tsx:203-244`
- **Tlačítko "Otevřít soubory" v patičce detailu dokončené úlohy** — systém tuto jednotnou akci nemá. `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html:319`, `velin-c-tasks.jsx:384-386`
- **Odlehčený stav "úloha nemá uložený plný průběh"** pro archivní položky bez fází/logu — systémový `RunDetail` tento degradovaný stav nerozlišuje. `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html:252-267`

### Pipelines

- **Volné textové pole "Routování" na pipeli**ně (např. "bugfix, feature → tato pipeline") — reálné schéma toto pole nemá, routování je plně automatické. `design/Z.I.B.B.Y/zibby/velin-c-pipelines.jsx:26,185-188` vs `libs/contracts/src/pipelines/pipeline.schema.ts`
- **Tlačítko "Smazat pipeline" v detailu** — systémová obrazovka nabízí Edit/Duplicate/Run, ale žádné mazání (endpoint existuje, UI hook chybí). `design/Z.I.B.B.Y/zibby/velin-c-pipelines.jsx:201` vs `apps/web/features/pipelines/Screen.tsx`
- **Textové vysvětlivky "kontrola prošla / kontrola selhala"** pod grafem fází — systémový canvas ukazuje jen kompaktní plovoucí štítek. `design/Z.I.B.B.Y/zibby/velin-c-pipelines.jsx:154-171` vs `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx`

### Gate rules / Approvals

- **Přehled schválení podle typu rizika v hlavičce fronty** — design zobrazuje odznaky s počtem čekajících za typ rizika, systém jen celkový počet. `design/Z.I.B.B.Y/zibby/approvals.jsx` vs `apps/web/features/chat/components/StatusFlyoutPanel.tsx`
- **Zobrazení `actorKind` u položky fronty** (skill/agent/pipeline) — systém pole parsuje, ale nikde nevykresluje. `apps/web/features/approvals/approval.ts` vs `FlyoutApprovalRow.tsx`, `ApprovalCard.tsx`
- **Živý náhled pravidla v modalu "Přidat/upravit pravidlo"**, aktualizovaný s každou změnou formuláře — systémový `RuleModal.tsx` ho nemá. `design/Z.I.B.B.Y/zibby/gate-rules-modal.jsx`
- **Přeuspořádání vlastních pravidel agenta drag-and-drop** — systémová `AgentRulesSection` u vlastních pravidel agenta žádné přeuspořádání nenabízí (na rozdíl od globálního katalogu). `design/Z.I.B.B.Y/zibby/gate-rules-section.jsx` vs `apps/web/features/agents/components/AgentRulesSection.tsx`
- **Přepínač "Aktivní" v hlavičce editoru pravidel agenta** (pozastavení/aktivace agenta) — systém obecné pauznutí agenta nemá. `design/Z.I.B.B.Y/zibby/gate-rules-frame.jsx` vs `apps/web/features/agents/DetailScreen.tsx`

### Overview / Voice / Briefing

- **Samostatná HUD/Overview obrazovka (velín)** — celá plocha Sidebar+TopBar+tělo+pravý rail. Smazáno; `/` teď redirectuje na `/chat`. `design/Z.I.B.B.Y/zibby/overview.jsx` vs `apps/web/app/page.tsx`
- **Kliknutím simulovaný výpadek démona + tlačítko "Restartovat démona"** — systém ukazuje jen kompaktní degraded/offline popisek bez restart akce. `design/Z.I.B.B.Y/zibby/overview.jsx:86-107`
- **Inline akce přímo v řádcích ranního brífinku** (Otevřít PR / Retry+Zahodit / Schválit+Zamítnout) — systémový `NeedsYouRow` je jen odkaz na `/archiv`. `design/Z.I.B.B.Y/zibby/overview.jsx` vs `apps/web/features/briefing/components/BriefingRows.tsx`
- **"Limity" jako vždy viditelný panel v postranním railu Overview** — dashboard, kde žil, už neexistuje. `design/Z.I.B.B.Y/zibby/overview.jsx`
- **Quick-launch dlaždice dovednosti (SkillTile) v přehledu** — žádná obdoba mimo vlastní `/skills` stránky. `design/Z.I.B.B.Y/zibby/overview-cards.jsx`
- **Samostatná stránka "Schválení" s frontou a master-detail** (breakdown podle rizika, "Vrátit do fronty") — systém řeší schválení jen v kompaktním flyoutu nebo inline na detailu běhu. `design/Z.I.B.B.Y/zibby/approvals.jsx` vs `apps/web/features/chat/components/FlyoutApprovalRow.tsx`, `apps/web/features/runs/components/RunApprovalGate.tsx`
- **Plnohodnotná orb-scéna hlasového UI s 5 stavy** (`ZtOrb`, chybový stav s "Zkusit znovu"/"Přejít do HUD") — dnešní voice mód v Chatu žádnou takovou animaci nemá, jen textový stavový pruh. `design/Z.I.B.B.Y/zibby/voice.jsx`

### Velin-B (starší HUD "Přehled", částečně přenesený do Chatu)

- **Souhrnná noční lišta se 4 čísly** (Tier 1/2/3 + naučené vzorce) — systém nic takového jako jeden souhrnný pruh nemá. `design/Z.I.B.B.Y/zibby/velin-b.jsx:383-410`
- **Třísloupcový board podle tieru autonomie** s konkrétními položkami — systém drží jen souhrnné počty jako text na řádku subsystému. `velin-b.jsx:465-495`
- **Panel sebeučení s návrhem povýšení tieru** (Tier 3 → Tier 1, "Ano, dělej to sám / Ptej se dál") — v systému neexistuje žádná UI pro schvalování povýšení autonomie. `velin-b.jsx:498-552`
- **Mřížka standup taháků napříč projekty s kopírováním** — systém má standup jen per jeden projekt na jeho detailu. `velin-b.jsx:595-605` vs `apps/web/features/projects/queries/useProjectStandupQuery.ts`
- **Self-modification karta s inline schválením merge** (PR/diff, "Schválit merge") — systémový self-status je jen read-only ukazatel čerstvosti repa. `velin-b.jsx:608-644`
- **Akční tlačítka přímo u položek brífinku** ("Otevřít PR", "Retry") — systémový `NeedsYouRow` je jen obecný odkaz. `velin-b.jsx:413-427` vs `apps/web/features/briefing/components/BriefingRows.tsx`

### Standalone mockupy

- **Obrazovka "Design audit" report** (P0/P1/P2 nálezy, tabulka tokenů, typografická specifikace) — v `apps/web` neexistuje žádná odpovídající obrazovka pro operátora (developerský `.claude/skills/design-match/` se nepočítá). `design/Z.I.B.B.Y/ZIBBY Design Audit.html`
- **Obrazovka "Implementace auditu · changelog"** (souhrnné statistiky, stavové badge, sekce "Nezapracováno") — v `apps/web` neexistuje changelog/release-notes obrazovka ani `CHANGELOG.md` v repu. `design/Z.I.B.B.Y/ZIBBY Implementace - Changelog.html`
- **Vícefázový stavový text během bootu** (8 fází vázaných na % progressu) — i18n klíče (`loading.init`/`registry`/`channel`/`orchestrator`/`knowledge`/`gates`/`inference`/`ready`) už existují v `cs.json`/`en.json`, ale `BootSplash.tsx:92` posílá jen statický `t("common.loading")` po celou dobu, takže se hláška nikdy nemění. **Nejlevnější nález k dotažení v celém auditu — jen zapojit již existující klíče.** `design/Z.I.B.B.Y/ZIBBY Loading Screen.html` vs `apps/web/components/layout/BootSplash/BootSplash.tsx`

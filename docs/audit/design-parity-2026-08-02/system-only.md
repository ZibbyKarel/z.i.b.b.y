# Design parity audit — delta pass, 2026-08-02

## V systému, ale ne v designu

Rozsah a metoda: viz `README.md` ve stejné složce. Toto je delta pass nad
`docs/audit/design-parity-2026-08-01/system-only.md` — jen sekce, ke kterým od
2026-08-01 přibyl nový design, byly revidovány; zbytek je beze změny přejatý
z předchozí verze.

---

## Změny od 2026-08-01 — souhrn

| Oblast | Nový design | Stav |
| --- | --- | --- |
| Commands | `ZIBBY Commands.html` (P0 #1) | **částečně vyřešeno** — katalog/detail/create existuje, chybí pár polí a stavů |
| Companies — super-entita + tým | `ZIBBY Companies.html` (P0 #2) | **částečně vyřešeno** — zjednodušený rozpočet, chybí inline editace týmu |
| Companies — link/unlink projektů | `ZIBBY Companies.html` (P0 #2) | **vyřešeno** — bullet smazán |
| Hooks | `ZIBBY Hooks.html` (P0 #3) | **částečně vyřešeno** — chybí 3 eventy, id pole, podmíněný matcher |
| MCP servery | `ZIBBY MCP servery.html` (P0 #4) | **částečně vyřešeno** — chybí `args`/`headers`/auth token; navíc přidává fiktivní scope/test-connection |
| Signály | `ZIBBY Signály.html` (P0 #5) | **částečně vyřešeno** — jiný datový model druhu signálu než reálný registr |
| Handoff | `ZIBBY Handoff.html` (P0 #6) | **částečně vyřešeno** — chybí severity dropdown, popisky, aktivní/neaktivní toggle |
| Pipelines (9 nálezů) | `pipeline-graph.jsx`/`pipelines.jsx` update | **beze změny stavu** — obsah existuje, ale nedosažitelný (jen mimo-rozsahové `ZIBBY Velin.html`) |
| Automatizace (8 nálezů) | `automations.jsx` update | **beze změny stavu** — obsah existuje (3 nálezy by šly zavřít), ale nedosažitelný (jen `ZIBBY Velin.html`) |

Šest ze sedmi nových zdrojů (Commands/Companies/Hooks/MCP/Signály/Handoff) má
**vlastní dedikovaný mockup**, který je skutečně vykresluje jako scénu — tyto
nálezy jsou legitimně posunuté. Zbylé dva (Pipelines, Automatizace) jsou
komponentní updaty schované v souboru, který žádný in-scope mockup skutečně
nemountuje — viz `README.md`. Jejich nálezy proto zůstávají v inventuři beze
změny, jen s dated poznámkou u těch bodů, kterých se update obsahově týká.

---

### Roadmap

_(zjištěno přímo v předchozí `/design-match` session, ne subagentem — jde o rozdíly,
které operátor v té session vědomě NEVYBRAL k dorovnání s designem, takže zůstávají
platné)._

- Nic — všechny funkční prvky Roadmapu, které systém má navíc, byly v `/design-match`
  session posouzeny a buď sladěny s designem, nebo ponechány jako platný systémový
  nadstavek bez zaznamenané námitky.

### Chat UI (Velin-D)

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Tool-dispatch a živé run karty v transkriptu** — asistentovy zprávy umí vykreslit odkazované řádky nástrojových volání a rozbalitelnou "živou" run kartu s časovou osou fází pipeline; design's `VcChatMsg` zná jen prostou textovou bublinu. `apps/web/features/chat/components/ChatMessage.tsx:51-86`, `apps/web/features/chat/components/ChatRunCard.tsx`
- **Strukturovaná karta briefingu v chatu** — vygenerovaný butlerovský briefing se v transkriptu vykresluje jako vlastní karta (needs-you řádky, subsystémové řádky, engagement souhrny), místo prostého textu. `apps/web/features/chat/components/BriefingMessageCard.tsx`
- **Tlačítko "přečíst nahlas" (TTS) u zpráv** — u každé dokončené asistentovy zprávy lze spustit/zastavit hlasové přehrání; v designu žádný takový ovládací prvek u zpráv není. `apps/web/features/chat/components/ChatMessage.tsx:103-135`
- **Klik na centrální orb otevírá celkový přehled federace** — `CoreOverviewDialog` ukazuje součty stavů (running/error/report/waiting/idle) a klikatelný rozpis všech subsystémů; design po kliknutí na jádro otevírá modál Nastavení, ne přehledová data. `apps/web/features/chat/components/CoreOverviewDialog.tsx`
- **Čtyři navíc destinace v pravém doku** — vedle designových 7 položek (firmy/projekty/agenty/skilly/commandy/MCP/paměť) systém přidává pipeliny, hooks, signály a automatizace. `apps/web/features/chat/components/ChatToolDock.tsx:34-46`
- **Tři subsystémy navíc v rosteru** — systémový registr má 11 subsystémů (Forge/Puls/Sentinel/Maestro/Beacon/Scout/Herald/Loom + Codex, Ledger, Hearth), design zná jen 8. `libs/contracts/src/subsystems/subsystem.schema.ts:113-128`
- **Odkaz "Archiv · N" pod seznamem úloh** — panel úloh vlevo skrývá dokončené/uzavřené úlohy za odkaz na samostatnou archivní stránku; design's `VcTaskRail` žádný koncept archivu nemá. `apps/web/features/chat/components/ChatTasksPanel.tsx:163-175`
- **Akce "vygenerovat briefing" v ⌘K vyhledávání** — systémové vyhledávání obsahuje syntetický řádek akce, který spustí generování briefingu; designový vyhledávací index žádný typ "action" nemá. `apps/web/features/chat/components/ChatSearch.tsx:238-250`
- **Status pilulka odráží skutečný stav backendu a má navíc segmenty working/error** — reálné stavy connecting/nominal/degraded/offline (s detailním řádkem) plus samostatné počty "working"/"error"; design's `VcStatusLineD` ukazuje jen statický text stavu a dva počty. `apps/web/features/chat/components/StatusPill.tsx:55-71,218-237`

### Tasks / Archive / Commands

- **Commands formulář: chybí `disableModelInvocation`/`enabled` toggle, id není zamčené při editu, model je omezen na 3 tlačítka místo volného textu, chybí prázdný/loading/error stav katalogu** — nový mockup (`ZIBBY Commands.html`, P0 #1) zavádí katalog, detail a create/edit modal, kde předtím nebylo vůbec nic — hlavní gap z 2026-08-01 je zavřený. Ale reálný formulář má navíc `disableModelInvocation` a `enabled` toggle, které design nemá; reálný `DetailScreen` zamyká `id` (a tedy název) při editu, design ho nechává editovatelný; reálný model je volný text, design ho omezuje na 3 tlačítka (opus/sonnet/haiku); a design nikdy neukazuje prázdný/loading/error stav katalogu. `apps/web/features/commands/components/CommandFormFields.tsx:69-80`, `DetailScreen.tsx:131`, `Screen.tsx:39-51` vs `design/Z.I.B.B.Y/zibby/commands.jsx:30-87,119-156`.
- **Archiv obsahuje i neúspěšné/přerušené/zaparkované běhy**, ne jen dokončené — design's `ArRow` má natvrdo ikonu `ok` a chip vždy `hotovo`. `apps/api/src/tasks/archive.ts:10-15` vs `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html:85,284`.
- **@-mention picker s živým autocomplete** pro přiřazení agenta/pipeline/subsystému přímo v textu composeru — design's `VcNewTask` je jen prostý textarea. `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:168-260,761-1050`.
- **Přílohy souborů** (drag&drop, vkládané dlaždice, upload s chybovým stavem) v task composeru — design nemá žádnou obdobu. `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:823-933`, `TaskAttachments.tsx`.
- **Živý náhled "ZIBBY will…" (PlanPreview)** s indikací nízké jistoty a nejednoznačnosti — design's ack je jen statická zpráva PO odeslání. `apps/web/features/tasks/components/PlanPreview.tsx`.
- **Plnohodnotný Loop/Goal editor** — objective, výběr makera, typ verifikace, max iterací, dodatečné instrukce — design má jen 4 tlačítka periodicity bez konfigurace. `apps/web/features/tasks/components/LoopComposer.tsx`.
- **Volba výstupu úlohy** (auto/PR/soubor s cílem projekt-vs-vault a názvem/void) a **editovatelné tool-grant checkboxy** — v designu nic obdobného. `apps/web/features/tasks/components/TaskOutputField.tsx`, `ToolGrantsField.tsx`.
- **Přiřazení projektu k úloze + rozvržené spuštění** (nyní / za 1 h / při obnovení limitu) a samostatná obrazovka **ScheduledConfirmation**. `apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx`, `ScheduledConfirmation.tsx`.
- **Panel "pokračovat v nové úloze"** (`TaskContextPanel`), který předvyplní novou úlohu výstupem předchozího běhu. `apps/web/features/tasks/components/TaskContextPanel.tsx`.
- **Podstatně bohatší metadata v detailu běhu**: náklady, doba trvání, klasifikační stopa, odkazy na projekt/roadmap položku, checkpointy, časová osa iterací cíle, retry/eskalační bloky pipeline fází, menu Stop/Resume/Smazat — design's `ArDetailPane` u dokončené úlohy ukazuje jen "Otevřít soubory" a čas dokončení. `apps/web/features/runs/components/RunDetail.tsx`, `PipelineStageTimeline.tsx`, `GoalDetailPanel.tsx`.
- **Volba "bez subsystému" v archivním filtru subsystémů** — design's `ArSysMultiSelect` nabízí jen 8 pojmenovaných subsystémů + "Všechny subsystémy". `apps/web/features/archive/components/ArchiveSubsystemFilter.tsx:199-221`.

### Pipelines

_(Aktualizace 2026-08-02: `zibby/pipeline-graph.jsx` a `zibby/pipelines.jsx`
dostaly rozsáhlý update — nové uzly „verify"/„qualify", `ownerSubsystem`
select a editovatelné `sinks`. Ale **žádný in-scope mockup je nevykresluje**:
`pipeline-graph.jsx` táhne jen `ZIBBY Velin.html` (mimo rozsah), a
`pipelines.jsx` je sice odkazován i z in-scope `ZIBBY Agenti.html`/`ZIBBY
Pravidla schvalování.html`, ale ani tam se `PipelinesBody`/`PipelineCard`
nikdy nemountuje — jen se z něj importují sdílené helpery (`Pill`,
`ModelBadge`, `ThinkBadge`, `pipelinesUsingAgent`). Podle vlastní metodiky
tohoto auditu se tedy nic z updatu nepočítá jako "už nadesignováno" — nálezy
níže zůstávají beze změny, jen s poznámkou u těch, kterých se update
obsahově týká.)_

- **Volný graf pipeline s tažením uzlů** — plnohodnotné canvas plátno s porty a paletou agentů; design má jen pevný lineární řetěz karet fází. `apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx`, `AgentNode.tsx`
  → *obsahově existovalo už předtím v `pipeline-graph.jsx`, tímto updatem nedotčeno; pořád nedosažitelné (viz poznámka výše).*
- **Samostatný typ fáze "verify"** — deterministická fáze se shell-příkazy, bez agenta. `apps/web/features/pipelines/components/PipelineDialog/pipeline-graph.ts`
  → *2026-08-02: `PG_KIND_META.verify` přidán tímto updatem — obsahově vyřešeno, ale nedosažitelné.*
- **Verdikt/"qualify" fáze s driftTo routováním**. `libs/contracts/src/pipelines/pipeline.schema.ts`
  → *2026-08-02: `qualify` uzel s jedním "top portem" (drift routing) přidán, ale modeluje jen jeden cíl, ne oddělené `to`/`driftTo` jako reálný `pipeline.schema.ts:41-42` — a je nedosažitelný.*
- **Eskalace úsilí a "then" cíl po vyčerpání retry**. `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx`
  → *tímto updatem nedotčeno (existovalo už dřív jako `escalate`/`then: 'park_for_review'`); nedosažitelné.*
- **Editovatelné handoff soubory (consumes/produces) na hranách**. `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx`
  → *tímto updatem nedotčeno; nedosažitelné.*
- **Vlastnící subsystém pipeline**. `apps/web/features/pipelines/components/PipelineCard/PipelineOwnerChip.tsx`
  → *2026-08-02: `ownerSubsystem` select + badge přidány tímto updatem — obsahově vyřešeno, ale nedosažitelné.*
- **Duplikace pipeline**. `apps/web/features/pipelines/mutations/useDuplicatePipelineMutation.ts`
  → *existovalo už dřív ("Duplikovat"), tímto updatem nedotčeno; nedosažitelné.*
- **Nahrání obrázku pipeline, tlačítko "Spustit pipeline" a živý čítač pokusů (n/m)**. `apps/web/features/pipelines/Screen.tsx`
  → *upload a run button existovaly už dřív; nově přidaný blok čítače pokusů v `PipelineRunModal` odkazuje na proměnné (`loopPhase`/`attempt`), které v daném scope nejsou deklarované — rozbitý/mrtvý kód, ne funkční doplněk. I kdyby fungoval, je nedosažitelný.*
- **Výstupy/sinky (PR nebo soubor do projektu/vaultu)** na úrovni celé pipeline. `libs/contracts/src/pipelines/pipeline.schema.ts`
  → *2026-08-02: `sinks`/`addSink` UI (PR/soubor → projekt/vault + název) přidáno tímto updatem, odpovídá `pipeline.schema.ts:155` — obsahově vyřešeno, ale nedosažitelné.*

### Projects

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Vlastní kategorie projektů** s ikonou, seskupené sekce, mazání prázdné kategorie, sekce "nezařazené". `apps/web/features/projects/Screen.tsx`
- **Rozpočet na projekt** (denní/týdenní/měsíční limity + cost cap), vlastní i "efektivní" (sloučený s firmou). `apps/web/features/projects/components/ProjectCompanyPanel.tsx`
- **Vícezáložkový detail projektu** — overview/profile/secrets/integrations/roadmap. `apps/web/features/projects/ProfileScreen.tsx`
- **Tým s komunikačním stylem, VIP příznakem a politikou autonomie projektu**. `apps/web/features/projects/ProfileScreen.tsx`
- **Denní rytmus a generovaný standup text**. `apps/web/features/projects/ProfileScreen.tsx`
- **Správa tajemství projektu (write-only secrets)**. `apps/web/features/projects/components/ProjectSecretsPanel.tsx`
- **Stav lokálního klonu + klonování**, **CI zdravotní chip**, **přehled otevřených PR s gatovaným sloučením**. `ProfileScreen.tsx`, `ProjectCiStatusChip.tsx`, `ProjectPullRequestsPanel.tsx`
- **Souhrn běhů projektu s prokliky do archivu** a **14denní feed zpracování integrací**. `ProjectRunSummary.tsx`, `ProjectIntegrationActivityPanel.tsx`

### Companies

- **Firma: model výchozího rozpočtu je zjednodušený a chybí inline editace týmu** — nový mockup (`ZIBBY Companies.html`, P0 #2) má plnohodnotný katalog, detail a kanonický tým — hlavní gap z 2026-08-01 je zavřený. Ale výchozí rozpočet je jen 4 dolarová pole (daily/weekly/monthly + cost cap), zatímco reálný systém má 7 samostatných polí ve dvou kategoriích: 3× limit počtu běhů (`budgetDailyRuns`/`WeeklyRuns`/`MonthlyRuns`), samostatný `maxConcurrent`, a 3× oddělený dolarový cost cap. Design taky neumožňuje inline editaci existujícího člena týmu (role/komunikační styl/VIP) — jen add/remove; a nemá prázdný stav katalogu firem (0 firem). `apps/web/features/companies/components/CompanyBasicsPanel.tsx:13-21`, `libs/contracts/src/projects/project.schema.ts:174-192`, `apps/web/features/companies/DetailScreen.tsx:58-115`, `Screen.tsx:44-52` vs `design/Z.I.B.B.Y/zibby/companies.jsx:188-197`.

  ~~**Propojení/odpojení projektů k firmě**~~ — **vyřešeno.** Design nyní ukazuje jak link (checkbox dialog s indikací, u které jiné firmy je projekt už zavěšený), tak unlink (tlačítko "Odpojit projekt" na každém propojeném řádku), přímo na detailu firmy — jde dokonce nad rámec reálného systému, kde unlink existuje jen z pohledu projektu (`ProjectCompanyPanel.tsx:73-77`), ne z `LinkProjectDialog.tsx` na firmě; to je ale chybějící symetrie v systému, ne mezera v designu. `design/Z.I.B.B.Y/zibby/companies.jsx:102-140,226-244`.

### Integrations

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Test připojení integrace** s výsledkovým hlášením. `apps/web/features/integrations/DetailScreen.tsx`
- **Samostatná stránka detailu integrace vnořená pod projektem** s uzamčeným typem, Save/Test/Delete. `DetailScreen.tsx`
- **Autonomie na úrovni jednoho kanálu**. `apps/web/features/integrations/components/IntegrationAutonomyPanel.tsx`
- **Značková loga podle typu integrace** (GitHub/Jira/Kalendář/Sentry). `apps/web/features/integrations/components/IntegrationCard.tsx`
- **Inbox a "vyžaduje pozornost" feed**. `InboxPanel.tsx`, `NeedsAttentionPanel.tsx`

### Gate rules / Approvals / Hooks / MCP / Signály / Handoff

- **Matcher typu „context"** — pátý typ podmínky pravidla vedle designových čtyř (`tool`/`action`/`threshold`/`scope`). `libs/contracts/src/gates/gate.schema.ts`, `apps/web/features/gates/gate.ts`
- **Subsystémové přiřazení pravidel (`ownerSubsystem`) a Gates tab podsystému** — třetí vyhodnocovací "bucket" mezi vlastními pravidly agenta a systémovým floorem. `libs/contracts/src/gates/gate.schema.ts`, `apps/web/features/subsystems/components/SubsystemDrawer/GatesTab.tsx`, `apps/web/features/gates/components/GlobalRuleCard.tsx`
- **Subsystémové přiřazení schválení (`Approval.ownerSubsystem`)**. `libs/contracts/src/approvals/approval.schema.ts`
- **Hooks formulář: chybí 3 lifecycle eventy, žádné `id` pole, matcher není podmíněný, chybí prázdný/error/loading stav** — nový mockup (`ZIBBY Hooks.html`, P0 #3) má plnou CRUD kostru (list/create/edit/delete) — hlavní gap z 2026-08-01 je zavřený. Ale `HOOK_EVENTS` v designu má jen 6 z 9 reálných eventů (chybí `PreCompact`/`SessionStart`/`SessionEnd`); design nemá pole pro entity `id` (tiše ho odvozuje slugem ze jména a nikde ho nezamyká); matcher pole se renderuje vždy, zatímco reálný systém ho ukazuje jen pro tool-scoped eventy (`PreToolUse`/`PostToolUse`); a design nemá prázdný/error/loading stav seznamu. `libs/contracts/src/hooks/hook.schema.ts:21-31`, `apps/web/features/hooks/components/HookFormFields.tsx:28-41,80,144-178`, `apps/web/features/hooks/Screen.tsx:37-57` vs `design/Z.I.B.B.Y/zibby/hooks.jsx:5,71,136`.
- **MCP servery: formulář nemodeluje `args`/`headers`, žádné pole pro auth token, a přidává fiktivní „scope"/„Test připojení", které backend nemá** — nový mockup (`ZIBBY MCP servery.html`, P0 #4) má CRUD kostru a správně tři reálné transporty (stdio/sse/http) — hlavní gap z 2026-08-01 je zavřený. Ale stdio formulář nemá oddělené pole pro `args` (jen "Příkaz"), http/sse formulář nemá `headers` (jen "URL"), a chybí write-only `authToken` pole — design místo toho na detailu vykresluje `env` páry jako čitelná data, v rozporu s write-only modelem (systém exponuje jen `hasCredentials`). Design navíc zavádí pole „scope" (user/project) a tlačítko „Test připojení", pro které kontrakt (`McpServerSchema`/`mcp.contract.ts`) nemá vůbec oporu — riziko, že se odsouhlasí UI pro schopnost, kterou backend nemá. `apps/web/features/mcp/components/McpServerFormFields.tsx:218-263`, `libs/contracts/src/mcp/mcp.schema.ts:17,39-40,97-104` vs `design/Z.I.B.B.Y/zibby/mcp.jsx:57,77-98,134-143`. _(Poznámka: fiktivní scope/test-connection je svou podstatou nález pro `design-only.md`, ne pro tento soubor — zaznamenáno tady jen jako vedlejší zjištění, `design-only.md` nebyl v tomto passu revidován.)_
- **Signály: mockup nesedí s reálným modelem registru druhů signálu** — nový mockup (`ZIBBY Signály.html`, P0 #5) strukturálně pokrývá všechny tři trasy (list/create/detail) — hlavní gap z 2026-08-01 je zavřený. Ale design zavádí fixní pětici obecných typů (`SIGNAL_KINDS`: event/threshold/schedule/webhook/manual) a druhou vrstvu instancí se stavem `active`/`paused`, zatímco reálný systém má plochý registr `HandoffSignalKind` s producentským subsystémem (`from`), `severityBearing` přepínačem a `status: builtin|pending|active` jako životním cyklem *registrace druhu*, ne přepínatelným stavem instance. Create formulář designu nemá producer/subsystem picker ani `severityBearing`; detail designu nemá odkaz na Forge build task ani rozlišení built-in vs. operátorský druh signálu. `libs/contracts/src/handoff/handoff.schema.ts:141-155`, `apps/web/features/signals/components/SignalCreateForm.tsx:186-219`, `SignalDetailScreen.tsx:173-204` vs `design/Z.I.B.B.Y/zibby/signals.jsx`.
- **Inline editor pravidel předávání (Handoff): mockup jen částečně pokrývá reálný editor** — nový mockup (`ZIBBY Handoff.html`, P0 #6) ukazuje mad-libs řádek „signál → cíl → tier" inline v simulovaném drawer podsystému (ne modal) — strukturálně sedí na reálné umístění (Subsystem drawer, tab „Předávání"), hlavní gap z 2026-08-01 je zavřený. Ale chybí dropdown závažnosti `(≥ severity)` mezi signálem a cílem, popisky/„pending" badge u signal-kind pickeru, a přepínač aktivní/neaktivní u každého pravidla (design má jen mazání). Design navíc míchá agenty do cílového pickeru, což reálný `HandoffTarget` typ (jen `subsystem`/`pipeline`) nepodporuje. `apps/web/features/handoff/components/HandoffRuleEditor.tsx:116-127,199-222`, `HandoffRuleRow.tsx:75-103` vs `design/Z.I.B.B.Y/zibby/handoff.jsx:47-62`.

### Overview / Voice / Briefing

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Voice jako trvalý přepínač uvnitř Chatu, ne samostatná scéna** — mikrofon, stavový pruh s živým přepisem a turn-taking logika zabudované do `/chat`. `apps/web/features/chat/components/VoiceToggleButton.tsx`, `VoiceStatusStrip.tsx`, `apps/web/features/chat/hooks/useVoiceMode.ts`
- **Status Pill s hover/klávesovým flyoutem** (focus management, hover grace, aria). `apps/web/features/chat/components/StatusPill.tsx`, `StatusFlyoutPanel.tsx`
- **Subsystem-level a per-projektový breakdown v brífinku**. `apps/web/features/briefing/components/BriefingRows.tsx`, `apps/web/features/chat/components/BriefingMessageCard.tsx`
- **Třetí zdravotní stav "degraded"** (Claude preflight nedostupné) vedle nominal/offline. `apps/web/features/health/healthPresentation.ts`
- **Approval gate zabudovaný přímo na detailu běhu** (`awaiting-approval` řeší se inline na stránce běhu). `apps/web/features/runs/components/RunApprovalGate.tsx`

### Standalone (Orb)

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Samostatný stav „working" odlišný od „thinking"** — design zná jen 5 stavů, systém navíc rozlišuje `thinking` od `working`. `libs/design-system/src/immersive/orbState.ts`
- **Dedikovaný „attention ping" prstenec** pro await/incident/report navíc k halo. `libs/design-system/src/immersive/OrbNode/OrbNode.tsx`

### Agenty / Automatizace / Skilly / Paměť / Nastavení

_Poznámka: Agenty, Skilly, Paměť a Nastavení mají svůj koncept přítomný v `velin-d-dock.jsx`
(hover panely doku) — reálné trasy jsou jen hlubší/plnější (CRUD, detail stránky, více
tabů), což je otázka hloubky provedení, ne chybějícího konceptu v designu, takže zde
nejsou vypsány jako nálezy. Nový `ZIBBY Agenti.html` (samostatný mockup, reuses
nezměněný `agents.jsx`) na tom nic nemění — nepřidává obsah nad rámec toho, co dock
panel už naznačoval. Automatizace v doku ani v mapě subsystémů pořád chybí zcela —
proto má vlastní plný seznam:_

_(Aktualizace 2026-08-02: `zibby/automations.jsx` dostal rozsáhlý update —
přesná shoda `SYS_TARGETS`, „systémová" badge, honest next-run, edit dialog
pro existující automatizace. Ale `automations.jsx` je pořád tažen jen z
`ZIBBY Velin.html`, kterou README předchozího auditu řadí mimo rozsah jako
celou obrazovku — dokud se nenamountuje ve vlastním in-scope mockupu (jako
to udělaly Commands/Companies/Hooks/MCP/Signály/Handoff), nálezy níže
zůstávají otevřené, jen s dated poznámkou u těch, kterých se update
obsahově týká.)_

- **Dva druhy spouštěče vedle sebe** — "Time triggers · cron" a "Event triggers · event", každý s vlastním editorem. `apps/web/features/automations/Screen.tsx:95-96,124-151`, `TriggerFields.tsx`
  → *2026-08-02: cron/event přepínač přidán, ale editor je pořád jeden text `spec` input pro oba typy — reál má strukturovaný `ScheduleField` (den/čas) pro cron vs. uzavřený multi-select `AUTOMATION_EVENTS` pro event. Částečně vyřešeno, a nedosažitelné.*
- **Bohatá množina systémových cílů automatizace** (`memory-distill`, `self-knowledge`, `sentinel-scan`, `loom-audit`, `post-merge-watch`, `review-learn`, `pattern-extract`, `gap-detect`, `agent-factory`). `apps/web/features/automations/components/AutomationCard.tsx:30-53,277-322`
  → *2026-08-02: `SYS_TARGETS` (přesná shoda všech 9 jmen) + glyphy přidány — obsahově vyřešeno, ale nedosažitelné.*
- **„Task" automatizace se stejným composerem jako zadání úlohy**. `apps/web/features/automations/DetailScreen.tsx:92-112,166-178`
  → *tímto updatem nedotčeno — design nemá cílový typ „task" vůbec (jen agent/pipeline/briefing/system).*
- **Systémové vs. operátorovy automatizace s různými právy** (server-owned = jen rozvrh, bez mazání). `DetailScreen.tsx:40-52,73,128-138`
  → *2026-08-02: badge „systémová" + zamčená pole (cíl/gate/prompt) přidány, ale design nikde nemá delete affordance vůbec — kontrast „operátor smí mazat, systémová ne" tedy chybí. Částečně vyřešeno, a nedosažitelné.*
- **Poctivé zobrazení dalšího běhu** — vypnutá automatizace nikdy neukazuje fantomový „příští běh", žádný syrový cron výraz. `AutomationCard.tsx:106-118`
  → *2026-08-02: `honestNextRun` (`— (vypnuto)` když je off) přidán — obsahově vyřešeno, ale nedosažitelné.*
- **Ruční spuštění nezávisle na rozvrhu** ("Run now"). `AutomationCard.tsx:214-224`, `DetailScreen.tsx:118-127`
  → *2026-08-02: tlačítko „Spustit teď" na kartě přidáno — strukturálně vyřešeno, a nedosažitelné.*
- **Banner o autonomii nad seznamem**. `apps/web/features/automations/Screen.tsx:106-112`
  → *2026-08-02: banner přidán — obsahově vyřešeno, ale nedosažitelné.*
- **Gramatika vytvoření vs. úpravy oddělená napříč obrazovkami**. `Screen.tsx:63-75`
  → *tímto updatem nedotčeno — potvrzeno beze změny. Design jde spíš opačným směrem: jeden `AutomationDialog` s `editing` propem řeší create i edit v jednom modalu, zatímco reál odděluje create-dialog od samostatné edit-page.*

### Velin-B (starší HUD "Přehled", částečně přenesený do Chatu)

_(beze změny od 2026-08-01 — design k této sekci nic nového nepřidal)._

- **Sjednocený task panel napříč projekty** — `ChatTasksPanel` v jednom feedu, Velin-B měl tři oddělené boxy. `apps/web/features/chat/components/ChatTasksPanel.tsx`
- **@-mention na subsystémy** v `CommandLine` (Velin-B mapoval jen agenty a pipeliny). `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:761-789`
- **CoreOverviewDialog — cross-subsystémový přehled federace**. `apps/web/features/chat/components/CoreOverviewDialog.tsx`
- **Skutečný upload souborů s náhledem/odebráním** (Velin-B jen vkládal `@filename` token bez reálného přenosu). `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:697-740`
- **Self-status freshness widget** (repo vs. origin, otevřená PR). `apps/web/features/self/queries/useSelfStatusQuery.ts`

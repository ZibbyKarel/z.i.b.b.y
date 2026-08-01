# Design parity audit — 2026-08-01

## V systému, ale ne v designu

Rozsah a metoda: viz `README.md` ve stejné složce. Toto je inventura funkcí/obsahu, ne
pixelový diff — barvy/mezery/fonty se neposuzují.

---

### Roadmap

_(zjištěno přímo v předchozí `/design-match` session, ne subagentem — jde o rozdíly,
které operátor v té session vědomě NEVYBRAL k dorovnání s designem, takže zůstávají
platné)._

- Nic — všechny funkční prvky Roadmapu, které systém má navíc, byly v `/design-match`
  session posouzeny a buď sladěny s designem, nebo ponechány jako platný systémový
  nadstavek bez zaznamenané námitky.

### Chat UI (Velin-D)

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

- **Celý katalog Commands** — stránka se seznamem vlastních slash-příkazů, detail/edit obrazovka a create modal nemá v designu vůbec žádný protějšek. `apps/web/features/commands/Screen.tsx`, `DetailScreen.tsx`, `components/AddCommandModal/AddCommandModal.tsx`, `CommandFormFields.tsx`.
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

- **Volný graf pipeline s tažením uzlů** — plnohodnotné canvas plátno s porty a paletou agentů; design má jen pevný lineární řetěz karet fází. `apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx`, `AgentNode.tsx`
- **Samostatný typ fáze "verify"** — deterministická fáze se shell-příkazy, bez agenta. `apps/web/features/pipelines/components/PipelineDialog/pipeline-graph.ts`
- **Verdikt/"qualify" fáze s driftTo routováním**. `libs/contracts/src/pipelines/pipeline.schema.ts`
- **Eskalace úsilí a "then" cíl po vyčerpání retry**. `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx`
- **Editovatelné handoff soubory (consumes/produces) na hranách**. `apps/web/features/pipelines/components/PipelineDialog/EdgeControls.tsx`
- **Vlastnící subsystém pipeline**. `apps/web/features/pipelines/components/PipelineCard/PipelineOwnerChip.tsx`
- **Duplikace pipeline**. `apps/web/features/pipelines/mutations/useDuplicatePipelineMutation.ts`
- **Nahrání obrázku pipeline, tlačítko "Spustit pipeline" a živý čítač pokusů (n/m)**. `apps/web/features/pipelines/Screen.tsx`
- **Výstupy/sinks (PR nebo soubor do projektu/vaultu)** na úrovni celé pipeline. `libs/contracts/src/pipelines/pipeline.schema.ts`

### Projects

- **Vlastní kategorie projektů** s ikonou, seskupené sekce, mazání prázdné kategorie, sekce "nezařazené". `apps/web/features/projects/Screen.tsx`
- **Rozpočet na projekt** (denní/týdenní/měsíční limity + cost cap), vlastní i "efektivní" (sloučený s firmou). `apps/web/features/projects/components/ProjectCompanyPanel.tsx`
- **Vícezáložkový detail projektu** — overview/profile/secrets/integrations/roadmap. `apps/web/features/projects/ProfileScreen.tsx`
- **Tým s komunikačním stylem, VIP příznakem a politikou autonomie projektu**. `apps/web/features/projects/ProfileScreen.tsx`
- **Denní rytmus a generovaný standup text**. `apps/web/features/projects/ProfileScreen.tsx`
- **Správa tajemství projektu (write-only secrets)**. `apps/web/features/projects/components/ProjectSecretsPanel.tsx`
- **Stav lokálního klonu + klonování**, **CI zdravotní chip**, **přehled otevřených PR s gatovaným sloučením**. `ProfileScreen.tsx`, `ProjectCiStatusChip.tsx`, `ProjectPullRequestsPanel.tsx`
- **Souhrn běhů projektu s prokliky do archivu** a **14denní feed zpracování integrací**. `ProjectRunSummary.tsx`, `ProjectIntegrationActivityPanel.tsx`

### Companies

- **Firma (Company) jako samostatná super-entita nad projekty** — vlastní katalog/detail, kanonický tým lidí a výchozí rozpočet, dědí se do projektů. `apps/web/features/companies/Screen.tsx`, `DetailScreen.tsx`
- **Propojení/odpojení projektů k firmě**. `apps/web/features/companies/components/LinkProjectDialog.tsx`

### Integrations

- **Test připojení integrace** s výsledkovým hlášením. `apps/web/features/integrations/DetailScreen.tsx`
- **Samostatná stránka detailu integrace vnořená pod projektem** s uzamčeným typem, Save/Test/Delete. `DetailScreen.tsx`
- **Autonomie na úrovni jednoho kanálu**. `apps/web/features/integrations/components/IntegrationAutonomyPanel.tsx`
- **Značková loga podle typu integrace** (GitHub/Jira/Kalendář/Sentry). `apps/web/features/integrations/components/IntegrationCard.tsx`
- **Inbox a "vyžaduje pozornost" feed**. `InboxPanel.tsx`, `NeedsAttentionPanel.tsx`

### Gate rules / Approvals / Hooks / MCP / Signály / Handoff

- **Matcher typu „context"** — pátý typ podmínky pravidla vedle designových čtyř (`tool`/`action`/`threshold`/`scope`). `libs/contracts/src/gates/gate.schema.ts`, `apps/web/features/gates/gate.ts`
- **Subsystémové přiřazení pravidel (`ownerSubsystem`) a Gates tab podsystému** — třetí vyhodnocovací "bucket" mezi vlastními pravidly agenta a systémovým floorem. `libs/contracts/src/gates/gate.schema.ts`, `apps/web/features/subsystems/components/SubsystemDrawer/GatesTab.tsx`, `apps/web/features/gates/components/GlobalRuleCard.tsx`
- **Subsystémové přiřazení schválení (`Approval.ownerSubsystem`)**. `libs/contracts/src/approvals/approval.schema.ts`
- **Screen „Hooks" (`/hooks`)** — kompletní CRUD pro Claude Code lifecycle hooky. `apps/web/app/(dashboard)/hooks/page.tsx`, `[id]/page.tsx`, `apps/web/features/hooks/components/HookFormFields.tsx`
- **Screen „MCP servery" (`/mcp`)** — CRUD pro registraci MCP serverů. `apps/web/app/(dashboard)/mcp/page.tsx`, `apps/web/features/mcp/components/McpServerFormFields.tsx`
- **Screeny „Signály" (`/signals`, `/signals/new`, `/signals/[id]`)**. `apps/web/app/(dashboard)/signals/*`, `apps/web/features/signals/components/SignalCreateForm.tsx`
- **Inline editor pravidel předávání (Handoff)** — mad-libs řádkový editor „signál → cíl → tier" v drawer podsystému. `apps/web/features/handoff/components/HandoffRuleEditor.tsx`, `HandoffRulesSection.tsx`

### Overview / Voice / Briefing

- **Voice jako trvalý přepínač uvnitř Chatu, ne samostatná scéna** — mikrofon, stavový pruh s živým přepisem a turn-taking logika zabudované do `/chat`. `apps/web/features/chat/components/VoiceToggleButton.tsx`, `VoiceStatusStrip.tsx`, `apps/web/features/chat/hooks/useVoiceMode.ts`
- **Status Pill s hover/klávesovým flyoutem** (focus management, hover grace, aria). `apps/web/features/chat/components/StatusPill.tsx`, `StatusFlyoutPanel.tsx`
- **Subsystem-level a per-projektový breakdown v brífinku**. `apps/web/features/briefing/components/BriefingRows.tsx`, `apps/web/features/chat/components/BriefingMessageCard.tsx`
- **Třetí zdravotní stav "degraded"** (Claude preflight nedostupné) vedle nominal/offline. `apps/web/features/health/healthPresentation.ts`
- **Approval gate zabudovaný přímo na detailu běhu** (`awaiting-approval` řeší se inline na stránce běhu). `apps/web/features/runs/components/RunApprovalGate.tsx`

### Standalone (Orb)

- **Samostatný stav „working" odlišný od „thinking"** — design zná jen 5 stavů, systém navíc rozlišuje `thinking` od `working`. `libs/design-system/src/immersive/orbState.ts`
- **Dedikovaný „attention ping" prstenec** pro await/incident/report navíc k halo. `libs/design-system/src/immersive/OrbNode/OrbNode.tsx`

### Agenty / Automatizace / Skilly / Paměť / Nastavení

_Poznámka: Agenty, Skilly, Paměť a Nastavení mají svůj koncept přítomný v `velin-d-dock.jsx`
(hover panely doku) — reálné trasy jsou jen hlubší/plnější (CRUD, detail stránky, více
tabů), což je otázka hloubky provedení, ne chybějícího konceptu v designu, takže zde
nejsou vypsány jako nálezy. Automatizace v doku ani v mapě subsystémů chybí zcela —
proto má vlastní plný seznam:_

- **Dva druhy spouštěče vedle sebe** — "Time triggers · cron" a "Event triggers · event", každý s vlastním editorem. `apps/web/features/automations/Screen.tsx:95-96,124-151`, `TriggerFields.tsx`
- **Bohatá množina systémových cílů automatizace** (`memory-distill`, `self-knowledge`, `sentinel-scan`, `loom-audit`, `post-merge-watch`, `review-learn`, `pattern-extract`, `gap-detect`, `agent-factory`). `apps/web/features/automations/components/AutomationCard.tsx:30-53,277-322`
- **„Task" automatizace se stejným composerem jako zadání úlohy**. `apps/web/features/automations/DetailScreen.tsx:92-112,166-178`
- **Systémové vs. operátorovy automatizace s různými právy** (server-owned = jen rozvrh, bez mazání). `DetailScreen.tsx:40-52,73,128-138`
- **Poctivé zobrazení dalšího běhu** — vypnutá automatizace nikdy neukazuje fantomový „příští běh", žádný syrový cron výraz. `AutomationCard.tsx:106-118`
- **Ruční spuštění nezávisle na rozvrhu** ("Run now"). `AutomationCard.tsx:214-224`, `DetailScreen.tsx:118-127`
- **Banner o autonomii nad seznamem**. `apps/web/features/automations/Screen.tsx:106-112`
- **Gramatika vytvoření vs. úpravy oddělená napříč obrazovkami**. `Screen.tsx:63-75`

### Velin-B (starší HUD "Přehled", částečně přenesený do Chatu)

- **Sjednocený task panel napříč projekty** — `ChatTasksPanel` v jednom feedu, Velin-B měl tři oddělené boxy. `apps/web/features/chat/components/ChatTasksPanel.tsx`
- **@-mention na subsystémy** v `CommandLine` (Velin-B mapoval jen agenty a pipeliny). `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:761-789`
- **CoreOverviewDialog — cross-subsystémový přehled federace**. `apps/web/features/chat/components/CoreOverviewDialog.tsx`
- **Skutečný upload souborů s náhledem/odebráním** (Velin-B jen vkládal `@filename` token bez reálného přenosu). `apps/web/features/tasks/components/CommandLine/CommandLine.tsx:697-740`
- **Self-status freshness widget** (repo vs. origin, otevřená PR). `apps/web/features/self/queries/useSelfStatusQuery.ts`

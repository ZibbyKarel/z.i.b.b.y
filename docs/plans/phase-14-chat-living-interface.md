# Fáze 14 — Chat-UI jako živé rozhraní (Trillion-inspired, bez orbitálních avatarů)

Rozsah: POUZE `apps/web/features/chat/` + nutné kontrakt/API seamy. HUD se nesahá.
Cíl: existující JARVIS-styl ChatScreen/ChatOrb přestává být dekorace — orb zrcadlí
skutečný stav konverzace, každá zpráva/tool-call nese identitu agenta, dispatch
pipeline/chain se v transkriptu vizualizuje živou run kartou a chat dostává první
"panelové" přístupy ke zbytku systému (activity, quick-switcher). Orbitující
avatarová konstelace se NEpřenáší (16 agentů ⇒ přeplnění); přenáší se princip
"systém ukazuje, co dělá".

## Nálezy z investigace (Fáze 0)

- **ChatOrb je render-only** (`components/ChatOrb.tsx`, prop `thinking?: boolean`),
  řízený z `ChatScreen.tsx` binárně: `thinking = sendMessage.isPending || stream.streaming`.
  Dva stavy (idle/thinking) — žádné rozlišení streamování × tool-call × čekání.
- **`useChatStream`** (`hooks/useChatStream.ts`) už rozlišuje eventy
  `delta | tool | done | error` a drží `toolEvents: ChatToolEvent[]` s
  `status: started|ok|error` — stav orbu jde odvodit ČISTĚ z něj, žádný nový state strom.
- **`ChatToolEvent.href` je hardcoded `/runs`** — `chat-session.service.ts#describeTool`
  vidí jen NÁZEV toolu ze stream parseru, ne výsledek. Run id, které `create_task`
  vyprodukoval, je uvězněné v českém textu návratu
  (`ChatToolsService.createTask` → `"…Běh: ${result.runRef}."`). Strukturovaná data
  (runRef, target s name+glyph) se k UI dnes NEdostanou. To je hlavní seam fází 2–3.
- **`scheduler.createTask` už umí explicitní target**
  (`createTask(input, now?, trustedProjectId?, explicitTarget?, background?)`;
  `explicitTarget ?? input.target` přeskočí klasifikaci) a `CreateTaskInputSchema`
  už nese volitelný `target?: TaskTarget`. @mention tedy NEvyžaduje nový
  klasifikátorový mechanismus — jen dopravit target z chatu do toolu.
- **Klasifikátor nemá žádnou @mention syntax** — routing je keyword/LLM;
  `ORCHESTRATOR_TARGET = { kind:"orchestrator", name:"Orchestrator", glyph:"compass" }`
  je fallback pod prahem 0.5.
- **Runs komponenty jsou prezentační** a znovupoužitelné:
  - `PipelineStageTimeline { pipelineRunId, owner, stageRuns, currentStage?, live? }`
    (logy si per-stage dofetchuje samo),
  - `ChainStepsPanel { run: RunView }` (kroky čte z `run.steps`, otevřený krok si
    dofetchuje přes `usePipelineRunQuery`),
  - `RunStateBadge { status, label, canonTitle?, size? }` (pure).
  - `usePipelineRunQuery(id|null)` = GET `/tasks/runs/:runId` → **`TaskRun`**
    (nese `stageRuns`, `currentStage`, `steps`), queryKey `["pipelineRun", id]`,
    SSE-invalidované + 1s fallback poll. Jedna query tedy uživí pipeline i chain kartu.
  - `runRef` je holé run id (např. `delivery_1`); deep-link vzor v aplikaci je
    `/runs?run=<runRef>` (žádná `/runs/[id]` route neexistuje — karta linkuje na
    skutečnou route).
- **`RunEventsProvider`** (`features/runs/runEvents.tsx`, mount v `app/providers.tsx`,
  tedy NAD chat overlayem) je invalidační bus `GET /api/events`:
  scope `pipeline-runs` invaliduje `getPipelineRunQueryKey(runId)`;
  scope `agent-runs` invaliduje jen seznamové klíče — single-run klíč pro
  agent-run refy dnes NEinvaliduje (doplnit ve Fázi 4).
- **DS**: `IconTile { glyph, size sm(30)/md(34)/lg/xl, tone, glow, interactive, as }`,
  `SearchBar` je trigger-BUTTON, `SearchMenu` je řízené filtrovací menu
  (`sections: {id,label,items:{id,title,subtitle?,glyph?}[]}`, filtrování dodává rodič),
  `MenuSurface { align?, placement?: "anchored"|"fixed", scroll? }`, `Chip`, `Tag`,
  `OrbitLoader`. **Žádný Drawer/Sheet neexistuje** — panel nad chatem se složí
  z `MenuSurface`/`Panel` (lokální composite, do DS se nový primitiv nezavádí —
  rozhodnutí viz níže).
- **`ActivityFeed`** (`features/overview/components/ActivityFeed/`) je čistě
  prezentační: `{ items: ActivityEntry[], limit? }` — lze mountnout kamkoliv,
  data dodá `useActivityQuery` (overview).
- **Agenti ve web**: `useAgentsQuery()` → `Agent[]` (`glyph?` volný string,
  render vzor `(agent.glyph as IconName) ?? "bot"`).
- Keyframes v `libs/design-system/src/theme/globals.css` (ověřeno): `v-breath`,
  `v-glow-idle`, `v-glow-hot`, `v-think-spin`, `v-ripple`, `v-orbit-cw/ccw`,
  `ring-pulse`, `logo-breathe`, `zpulse`, `fade-in`, `scale-in`, `status-in`, …
  Žádná animační knihovna se nezavádí.
- Testy: `renderWithProviders`, mock query hooků přes `vi.hoisted` + `vi.mock`,
  selektory přes exportované `*TestId` enumy; role/ARIA jen jako asserty.
- i18n: namespace `chat.*` má 13 klíčů (cs+en), flat klíče, default `cs`.

## Rozhodnutí

1. **Stav orbu = odvozený union, ne nový store.** `ChatOrbMode =
   "idle" | "listening" | "thinking" | "streaming" | "tool"` se počítá v ChatScreen
   z `useChatStream` + `sendMessage.isPending` + aktivity composeru. Stav
   „čeká na schválení" se doplní až ve Fázi 3, kdy tool event ponese strukturovaný
   výsledek (`parked`/approval) — dřív by to byl odhad z textu, to nedělat.
2. **Strukturovaný tool-result kanál na backendu** (seam fází 2+3): chat tooly
   přestanou vracet jen český string. `ChatToolsService.createTask` vrátí
   `{ text, meta: { runRef?, taskId, target } }`; MCP controller pošle modelu dál
   jen `text` (chování modelu se nemění) a `meta` uloží do in-memory
   `ChatToolResultRegistry` (per conversation). `chat-session.service` při emitu
   `tool` eventu registry vyčte a obohatí `ChatToolEvent` — kontrakt-first:
   `ChatToolEventSchema` dostane volitelná pole `runRef?`, `taskId?`,
   `target?: TaskTargetSchema`. `href` se změní z `/runs` na `/runs?run=<runRef>`.
   (Implementátor ověří, jak se conversationId dostane do MCP controlleru — pokud
   tam dnes není, protáhne se query paramem MCP URL při spawnnutí `claude` CLI.)
3. **@mention = explicitní target na wire.** `SendChatMessageBodySchema` dostane
   volitelný `target?: TaskTarget` (reuse existujícího schématu). Backend ho podrží
   per-conversation pro běžící turn; `create_task` ho použije jako `explicitTarget`
   pro `scheduler.createTask` (⇒ klasifikátor přeskočen — naplňuje zákon „Explicit
   target overrides the classifier") a do system promptu turnu se přidá věta, že
   operátor oslovil konkrétní jednotku. Target se po turnu zahodí (jednorázový).
4. **Identita = malý `IconTile` chip, žádný nový avatar komponent.** Assistant
   bublina nese identitu ZIBBY (glyph `butlerSign`); tool/dispatch řádek nese
   identitu targetu z `ChatToolEvent.target` (name + glyph z CreateTaskResult —
   žádný klientský lookup). Orchestrátor se renderuje jako řetězec
   `orchestrátor → sub-agent`, jakmile je sub-agent znám; dokud znám není,
   ukazuje se samotný orchestrátor (poctivé — delegace uvnitř běhu se do chatu
   nepromítá, dokud ji backend nenese).
5. **Run karta reuse-uje runs komponenty, žádná paralelní vizualizace.**
   `ChatRunCard` (chat composite) = collapsed hlavička (`RunStateBadge` + identita
   + aktuální fáze/krok + `/runs?run=` link) + rozbalený detail
   (`PipelineStageTimeline` pro stageRuns, `ChainStepsPanel` pro steps). Data přes
   existující `usePipelineRunQuery(runRef)`.
6. **Real-time = varianta (a).** Chat stream (`/api/chat/stream`) zůstává vlastní
   kanál pro delta/tool/done/error; run karta žije z `usePipelineRunQuery`, kterou
   už invaliduje sdílený `RunEventsProvider` (mount výš než chat overlay, funguje
   i uvnitř). Menší zásah, nulová změna chování mimo chat; jediný doplněk je
   invalidace single-run klíče i pro `agent-runs` scope. Zdůvodnění patří do PR
   popisu.
7. **Panel nad chatem = lokální composite z `MenuSurface`, ne nový DS Drawer.**
   Explicitní rozhodnutí dle CLAUDE.md: jde o chat-specifické overlay chování,
   dokud ho nepotřebuje druhá obrazovka, do DS se primitiv nezavádí.

## Kroky

### Fáze 14.1 — ChatOrb řízený reálným stavem

- `ChatOrb.tsx`: prop `thinking?: boolean` → `mode?: ChatOrbMode`
  (`"idle" | "listening" | "thinking" | "streaming" | "tool"`, default `"idle"`).
  Mapování na EXISTUJÍCÍ keyframes (žádné nové barvy/animace mimo tokeny):
  - `idle` — dnešní klid: `v-breath` + `v-glow-idle`, pomalé orbity.
  - `listening` — klid + zrychlený dech / `ring-pulse` na vnějším orbitu
    (operátor píše — orb „poslouchá").
  - `thinking` — dnešní `thinking` vizuál (v-glow-hot, think arc, rychlé orbity):
    request odeslán, tokeny ještě netečou.
  - `streaming` — jako thinking + o stupeň živější orbity (tokeny tečou).
  - `tool` — thinking + `v-ripple` rings (dnes už existují) — běží akce v systému.
- `ChatScreen.tsx`: odvodit mode čistě z existujících signálů:
  `tool` když poslední živý toolEvent má `status === "started"`; jinak `streaming`
  když `stream.streaming && stream.text`; jinak `thinking` když
  `sendMessage.isPending || stream.streaming`; jinak `listening` když composer má
  neprázdný draft; jinak `idle`. Composer aktivitu předá `ChatComposer` novým
  volitelným callbackem (`onDraftChange?: (hasDraft: boolean) => void`) — žádný
  nový provider.
- Testy: ChatOrb renderuje odlišné vizuální příznaky per mode (testId enum na
  root + `data-mode` atribut), ChatScreen odvození modu (mock stream hooku).
- i18n beze změn. Backend beze změn.

### Fáze 14.2 — Identita agenta + @mention picker

**Kontrakt (`libs/contracts/src/chat/chat.schema.ts`):**
- `ChatToolEventSchema` += `target?: TaskTargetSchema`, `runRef?: z.string()`,
  `taskId?: z.string()` (všechno optional — zpětně kompatibilní JSONL transcript).
- `SendChatMessageBodySchema` += `target?: TaskTargetSchema`.

**Backend (`apps/api/src/chat/`):**
- Nový `ChatToolResultRegistry` (in-memory, per conversationId, FIFO per tool
  name): `ChatToolsService.createTask` vrací `{ text, meta }`, controller pošle
  modelu `text`, meta uloží. Ověřit/protáhnout conversationId do MCP controlleru
  (query param MCP URL při spawnu CLI, pokud tam dnes není).
- `chat-session.service#describeTool` → čte registry: `create_task` event dostane
  `target`, `runRef`, `taskId` a `href = runRef ? \`/runs?run=${runRef}\` : "/runs"`.
- Explicitní target: `sendMessage` body.target se podrží pro turn
  (tatáž registry třída), `createTask` ho předá scheduleru jako `explicitTarget`
  a do promptu turnu se přidá jednořádková instrukce o oslovení. Po `done`/`error`
  se target zahodí.
- Testy: registry (uloží/vyčte/zahodí), describeTool obohacení, createTask
  s explicitním targetem volá scheduler s `explicitTarget` (mock).

**Frontend (`apps/web/features/chat/`):**
- `AgentIdentity` mini-composite v `ChatMessage.tsx` (ne nový soubor komponenty
  v DS): `IconTile size="sm"` + `Typography mono xs` jméno. Assistant bublina:
  ZIBBY (glyph `butlerSign`). ToolEventRow s `target`: řetězec identit —
  `target.kind === "orchestrator"` → orchestrátor chip; jinak target chip;
  (řetězec `orchestrátor → sub-agent` renderovat, jakmile event ponese obojí —
  render podporuje pole identit).
- `ChatComposer.tsx`: detekce `@` na začátku slova → `SearchMenu` v `MenuSurface`
  (anchored nad textarea) se sekcemi Agenti (`useAgentsQuery`) a Pipelines
  (`usePipelinesQuery` — implementátor ověří přesný název hooku ve
  `features/pipelines/queries`), filtrování dodá composer (substring na
  name/id). Výběr: vloží `@Jméno` do textu + nastaví vybraný target; nad
  composerem se ukáže odstranitelný `Chip` s targetem. `onSend` nově
  `(text, target?) => void`; ChatScreen ho pošle v body.
- Testy: mention picker (otevření na `@`, filtrace, výběr → chip + target
  v onSend), identita u zpráv/tool řádků (testId).
- i18n: nové klíče (`chat.mention.*`, `chat.identity.*`) v cs+en.

### Fáze 14.3 — Inline run karta pipeline/chain

- `ChatRunCard.tsx` (features/chat/components): props
  `{ runRef: string, target?: TaskTarget }`.
  - Data: `usePipelineRunQuery(runRef)` → `TaskRun`.
  - Collapsed (default): `RunStateBadge` + identita targetu + kompaktní progres
    (pro pipeline: `currentStage` + hotové/celkem stages; pro chain:
    `currentStep`/steps) + link `/runs?run=<runRef>` (ikona, vždy viditelný).
  - Expanded (klik na hlavičku): `run.steps?.length` → `ChainStepsPanel {run}`;
    jinak `run.stageRuns` → `PipelineStageTimeline` (`live` z běžícího stavu);
    agent-run bez stages → jen badge + link (žádná paralelní vizualizace logů,
    od toho je runs stránka).
- `ChatMessage.tsx#ToolEventRow`: event s `runRef` renderuje `ChatRunCard`
  místo plochého řádku (StatusDot řádek zůstává pro ostatní tooly).
- Testy: collapsed/expanded, volba timeline × chain panel (mock
  `usePipelineRunQuery`), link na `/runs?run=`.
- i18n: `chat.runCard.*` klíče.

### Fáze 14.4 — Živý stav run karty (souběžně s 14.3)

- Rozhodnutí (a) — viz Rozhodnutí 6. Práce:
  - `runEvents.tsx`: scope `agent-runs` s `runId` invaliduje i
    `getPipelineRunQueryKey(runId)` (dnes jen seznamy) — jinak by karta
    agent-runu zamrzla.
  - Ověřit, že `usePipelineRunQuery` fallback poll drží kartu živou i bez SSE
    (má 1s poll — jen otestovat, že query je `enabled` po dobu mountu karty).
  - Test: invalidace single-run klíče na agent-runs event; komentář v
    `useChatStream.ts`/`runEvents.tsx` + PR popis se zdůvodněním varianty (a).

### Fáze 14.5 — Snadný přístup ke zbytku systému z chatu

- `ChatSidePanel.tsx` (chat composite, `MenuSurface placement="fixed"` ukotvený
  k pravé hraně overlaye, `scale-in`/`fade-in` keyframes, Esc zavírá panel dřív
  než overlay): obsah `ActivityFeed items={data ?? []} limit={12}` z
  `useActivityQuery` (import z features/overview — stejný cross-feature vzor jako
  ChainStepsPanel → pipelines). Toggle button v top baru ChatScreen.
- Quick-switcher: `SearchBar` (trigger, shortcut ⌘K — jen uvnitř otevřeného
  chatu, nekoliduje s globálním ⌘J) + `SearchMenu` se sekcemi:
  - Agenti (`useAgentsQuery`) → výběr vloží @mention do composeru (Fáze 14.2),
  - Pipelines → totéž (explicitní target),
  - Gates/approvals (`useApprovalsQuery` z features/approvals — implementátor
    ověří název) → položka linkuje na `/gates` (navigace jako fallback; panel-first
    varianta se doplní, až bude gates list prezentační),
  - Memory (existující memory search query, ověřit ve features/memory) → link na
    notu.
  Filtrování dodá rodič (substring), loading přes `loading` prop SearchMenu.
- Vše žije UVNITŘ chat overlaye (panel nad chatem, ne navigace pryč) — výjimkou
  je klik na gate/memory detail, který naviguje (a zavře overlay) — zapsat do PR
  jako vědomý fallback.
- Testy: toggle panelu, palette otevření/filtr/akce per sekce (mock queries).
- i18n: `chat.panel.*`, `chat.palette.*`.

## Pořadí, verifikace, reporting

- 14.1 → 14.2 → 14.3 (+14.4 souběžně) → 14.5; každá fáze samostatný commit
  „phase 14.x: …".
- Po každé fázi: `pnpm lint && pnpm typecheck && pnpm test` zelené + vizuální
  ověření přes běžící dev server (web + api, chat overlay ⌘J) — screenshot/popis
  výsledku, ne jen typecheck.
- Žádná dokumentace navíc; HUD nedotčen.

## Definition of done

Orb má ≥5 odvozených stavů řízených streamem; každá assistant zpráva a dispatch
řádek nese identitu (IconTile chip), @mention v composeru posílá explicitní
`target` a backend s ním přeskakuje klasifikátor; dispatch pipeline/chain se
v transkriptu ukazuje jako sbalitelná živá karta reuse-ující runs komponenty
s deep-linkem `/runs?run=`; karta se aktualizuje ze sdíleného invalidačního busu
(varianta (a) zdůvodněná v PR); z chatu je dosažitelná activity a quick-switcher
bez opuštění overlaye. `pnpm lint && pnpm typecheck && pnpm test` zelené po každé
fázi.

# ZIBBY — Detailní roadmapa (Fáze 2b → 6)

> **Pro koho:** handoff pro Claude Code v repu `ZibbyKarel/z.i.b.b.y`.
> **Co s tím:** tohle je **spec**, ne implementační plán. Claude Code z toho má
> vyrobit konkrétní implementační plán / posloupnost ticketů. Prózu mám česky,
> všechny identifikátory, cesty, kontrakty, frontmatter klíče a akceptační
> kritéria záměrně anglicky — kopíruje to bilingvní konvenci repa (kód EN,
> uvažování CS).

---

## 0. Výchozí stav (ground truth z repa)

Co **reálně existuje na backendu** (`apps/api/src`): `agents` (CRUD, Markdown
storage), `categories`, `agent-runs` (spawn child procesu + log + sidecar +
restart-rekonstrukce), `health`, `limits`. **Nic jiného backend nemá.**

Co existuje **jen na frontendu** a jede z mock store (`apps/web/state/store.tsx`,
`useCatalog`): `skills`, `pipelines`, `integrations`, `ApprovalCard`,
`ActivityFeed`. Tvary jsou už definované v `apps/web/domain.ts` — **kontrakty se
mají sjednotit s nimi, ne vymýšlet nové.** Konkrétně `domain.ts` už nese finální
návrh exekuce:

- `PipelinePhase = { agent, consumes, produces, model, thinking, loop? }` →
  `consumes`/`produces` **jsou handoff soubory**.
- `PhaseLoop = { to, maxRetries, escalate, then }` → **tester loop** (zpětná
  hrana se stropem iterací + eskalace).
- `Approval = { id, skill, action, detail, risk }`, `Skill = { id, name, glyph,
desc, file }`, `PipelineState = done | parked | failed | running` (`parked` ≈
  čeká na rozhodnutí).

**Invarianty, které platí napříč všemi fázemi (nelze porušit):**

1. **Contract-first.** `libs/contracts` je jediný zdroj pravdy: Zod schéma →
   `c.router` → implementace v `apps/api` přes `@ts-rest/nest`, **žádný codegen**.
   Postup „How to add a whole new resource" v `libs/contracts/README.md` je
   mechanický recept — `health` je referenční příklad. Každý nový resource =
   `*.schema.ts` + `*.contract.ts` + `index.ts` export + NestJS controller +
   module + registrace v `app.module.ts` + zařazení do `apiContract` v `main.ts`
   (kvůli `/docs`) + contract test (`libs/contracts`) + e2e test
   (`apps/api/test`).
2. **Storage-service pattern.** Markdown soubor = perzistence (frontmatter +
   body). Vzor je `agents.storage.service.ts`: `resolveFile` se dvěma guardy
   (regex + path-containment), `writeAtomic` (tmp + rename), `tryParse` tolerantní
   k jednomu vadnému poli (zahodí pole, ne celou entitu). **Žádná databáze.**
3. **Runner pattern.** `AgentRunnerService`: spawn child procesu do per-run
   sandboxu (`cwd`), stdout/stderr → `<runId>.log`, metadata → `<runId>.json`
   sidecar, progress přes `PROGRESS <n>` řádky, restart rekonstruuje registr ze
   sidecarů. Demo mód (`demo-task.mjs`) vs `AGENT_RUNNER_MODE=claude`.
4. **ZIBBY nikdy autonomně nedokončí transakční akci.** Approval gate (Fáze 3) je
   jádro identity, ne nice-to-have.
5. **DS-first frontend.** Komponenty skládat z `@zibby/design-system`, appka
   nepíše vlastní Tailwind. Query hooky per-doména v `apps/web/features/<d>/`,
   `select: selectApiResponseBody`, query vrací `useQuery` přímo. React 19 →
   **žádný `forwardRef`**, **žádný `any`**.
6. **Po každé generaci kódu:** `npm run lint && npm run typecheck && npm run test`
   — všechno zelené, než se task označí za hotový.
7. **Polling, ne SSE.** Logy se čtou byte-offsetem (`getRunLogs`). SSE je vědomě
   odložené; nezavádět ho v rámci téhle roadmapy, dokud to fáze explicitně
   nevyžádá.

---

## ⭐ Klíčové cross-cutting rozhodnutí — vyřešit HNED na začátku 2b

Tohle rozhodnutí ovlivní fáze 2b, 3, 5 i 6. **Doporučení: generalizovat jádro
runneru.**

Vyčlenit z `AgentRunnerService` sdílené jádro — `RunnerCore` (spawn + log +
sidecar + restart-rekonstrukce + pgid/heartbeat z Fáze 6) — a nad ním tenké
per-entity wrappery (`agent` run, `skill` run, `pipeline-stage` run). Run model
sjednotit přes diskriminátor `kind: "agent" | "skill" | "pipeline-stage"`, ne
duplikovat tři skoro stejné runnery.

**Proč:** robustnost executoru (Fáze 6: orphan procesy, reconnect po restartu,
concurrent-safety) i approval pauza (Fáze 3) se jinak musí implementovat N×.
Jedno místo = jedna implementace liveness/restart/approval logiky.

Claude Code: tohle posoudit jako první ticket Fáze 2b a rozhodnout
explicitně (generalizace vs. duplikace), protože z toho vychází tvar všech
dalších kontraktů.

---

## Fáze 2b — Dotáhnout exekuci na `skills` a `pipelines`

### Cíl

Dostat `skills` a `pipelines` na úroveň `agents`: ts-rest kontrakt + storage
service + runner. Pipeline runner řetězí fáze přes handoff soubory; tester loop
(zpětná hrana) je součást.

### Scope

**Kontrakty (`libs/contracts`)**

- `skill.schema.ts` + `skills.contract.ts` — sjednotit se `Skill` z `domain.ts`
  (`id, name, glyph, desc, file`) + `instructions`/body. Skill = SKILL.md soubor
  (frontmatter + tělo), stejný formát jako agent, blízko user-skills v
  `/mnt/skills/user`.
- `pipeline.schema.ts` + `pipelines.contract.ts` — sjednotit s `Pipeline` +
  `PipelinePhase` + `PhaseLoop` z `domain.ts`. **Tvar phase přebrat 1:1:**
  `{ agent, consumes, produces, model, thinking, loop? }`, `loop = { to,
maxRetries, escalate, then }`.
- `pipeline-run.schema.ts` (analogie `agent-run.schema.ts`) — `PipelineRun`
  agreguje `stageRuns` (run id per fáze) + `currentStage` + celkový `status`
  (mapovat na `PipelineState`: `done | parked | failed | running`).
- Run status pro skills — buď sdílený `RunStatus` enum (viz cross-cutting), nebo
  reuse `AgentRunStatusSchema`.

**Backend (`apps/api`)**

- `skills/` modul — controller + `skills.storage.service.ts` (klon agents
  storage, formát SKILL.md) + `skills.errors.ts`. Skill run = reuse runneru
  (přes `RunnerCore`).
- `pipelines/` modul — controller + `pipelines.storage.service.ts` +
  `pipeline-runner.service.ts`.

**Pipeline runner — netriviální jádro:**

- Spustí fáze v pořadí. Výstup fáze N (`produces`) = soubor v run sandboxu;
  fáze N+1 ho dostane jako vstup (`consumes`) — handoff přes disk, ne přes paměť.
- Per-fáze run = jeden child proces (reuse `RunnerCore`), takže byte-offset log
  polling funguje per fáze.
- **Tester loop / zpětná hrana:** když fáze definuje `loop = { to, maxRetries,
escalate, then }` a neuspěje, runner se vrátí na fázi `to` s kontextem selhání
  jako handoff vstupem. **Strop `maxRetries` je tvrdá pojistka proti nekonečné
  smyčce.** Po vyčerpání → `escalate` (eskalace, nepokračuj tiše) → `then`.
- `PipelineRun.status`: `running` během exekuce, `done`/`failed` na konci,
  `parked` rezervovat pro Fázi 3 (čeká na approval).

**Frontend (`apps/web`)**

- Migrovat `skills` a `pipelines` z `useCatalog` mocku na TanStack Query:
  `useSkillsQuery`, `useCreateSkillMutation`, `useStartSkillRunMutation`,
  `usePipelinesQuery`, `useCreatePipelineMutation`, `useStartPipelineRunMutation`,
  `usePipelineRunQuery` (poll). DS komponenty (`PhaseChain`, `PipelineCard`,
  `SkillTile`, `RunModal`) **zůstávají** — mění se jen zdroj dat.
- `PhaseChain` napojit na reálné `PipelineRun.stageRuns` (vizualizuje řetěz fází).

### Akceptační kritéria

- Given SKILL.md soubor ve skills dir, when `GET /api/skills`, then se objeví s
  rozparsovaným frontmatterem; vadné pole se zahodí, soubor nezmizí.
- Given pipeline se stage A→B, when start, then A doběhne, zapíše `produces`
  soubor, B startuje s tím souborem přítomným ve svém `cwd`, a `PipelineRun.status`
  reflektuje postup.
- Given B selže a má `loop.to = A` s `maxRetries = 2`, then se A znovu spustí s
  kontextem selhání B; po 2 marných pokusech `escalate` a přechod na `then`,
  **nikdy nekonečně**.
- Given restart backendu během běžící pipeline, then se `PipelineRun`
  rekonstruuje ze sidecarů konzistentně (stejná logika jako agent-runs).

### Testy

Contract testy (`libs/contracts`), storage unit testy (klon
`agents.storage.service.test.ts`), e2e (`apps/api/test`) — spustit malou demo
pipeline, ověřit existenci handoff souboru + finální status + že loop respektuje
`maxRetries`.

### Rizika / otevřené otázky

- Sdílený run model vs. tři runnery (viz cross-cutting — vyřešit první).
- Kde žije handoff soubor: v run sandboxu (`cwd`) ano, ale jak ho fáze N+1 najde
  — konvence názvu (`<phaseId>.out`) vs. explicitní `produces`/`consumes` cesty
  z kontraktu. Doporučení: explicitní z kontraktu.

---

## Fáze 3 — Approval gate naživo (priorita, jádro identity)

> Dělat **hned po 2b**, ne později. Bez tohohle je „autonomní JARVIS" jen loose
> cannon — tohle tě odlišuje od OpenClawu.

### Cíl

Runner se umí pozastavit ve stavu `awaiting-approval` a čekat na rozhodnutí.
SKILL.md frontmatter rozšířit o `requires_approval` + `risk`. Frontend approval
card (Schválit/Zamítnout, risk badge) na to napojit.

### Scope

**Status enum (contract change!)**

- Přidat `awaiting-approval` do `AgentRunStatusSchema` (resp. sdíleného
  `RunStatus`). Pořadí vedle `running / done / error / interrupted`. **Tohle je
  breaking contract change** → všichni konzumenti se přetypují (to je ta záruka,
  proto sekvencovat vědomě).

**Frontmatter rozšíření**

- `AgentSchema` (a skill schéma) dostane `requires_approval: boolean` a
  `risk: z.enum(["low","medium","high"])`. Parse tolerantní (neznámou hodnotu
  zahodit, jako `model`/`thinking`). Promítnout do `parse`/`serialize` v storage.

**Approvals resource (`libs/contracts` + `apps/api`)**

- `approval.schema.ts` — sjednotit s `Approval` z `domain.ts` rozšířeným o
  `runId`, `status: pending | approved | rejected`, `requestedAt`, `decidedAt?`.
- `approvals.contract.ts` — `listPending`, `getApproval`, `approve`, `reject`.
- `approvals/` modul — controller + storage (perzistovat durably; approval
  přežije polling i restart — `.json` sidecar/dir konzistentně s run sidecary).

**Runner — schopnost pauzy**

Dvě varianty, **explicitně k rozhodnutí pro Claude Code:**

- **Varianta A (gate na hranici fáze) — doporučená jako první.** Fáze/run
  označená `requires_approval` se **nespustí**, dokud není schválena. Runner před
  startem akce: vytvoří `Approval(pending)`, run → `awaiting-approval`, čeká. Po
  `approve` → pokračuje (`running`); po `reject` → terminuje bez provedení akce.
  Pokrývá pipelines i běžný případ, jednoduché.
- **Varianta B (sentinel uvnitř procesu) — bohatší follow-up.** Child proces emituje
  `APPROVAL_REQUEST {json}` na stdout (runner už takhle parsuje `PROGRESS <n>`),
  runner přepne run na `awaiting-approval`, child **blokuje** čekáním na rozhodovací
  soubor/signál. Umí gatovat akci uprostřed jednoho běhu agenta.

Doporučení: A první (hranice fáze), protokol B navrhnout jako rozšíření.

**Restart sémantika (důležitý detail!)**

- `awaiting-approval` je **bezpečný pauznutý stav bez živého childu** → na rozdíl
  od `running` (které se po restartu rekonciluje na `interrupted`) **přežije
  restart beze změny**. Approval zůstane `pending`, run zůstane
  `awaiting-approval`. Tohle explicitně ošetřit v `onModuleInit`.

**Frontend**

- `ApprovalCard` (už existuje) napojit na `useApprovalsQuery` (poll) +
  `useApproveMutation` / `useRejectMutation`. Risk badge už v kartě je. Pending
  approvals vypíchnout do ActivityFeedu / vlastní approval lane.

### Akceptační kritéria

- Given agent s `requires_approval: true`, when run dorazí na gatovanou akci,
  then `run.status → awaiting-approval`, existuje `Approval(pending)`, a **žádná
  akce s vnějším efektem se neprovedla.**
- Given pending approval, when approve, then run pokračuje (`→ running`); when
  reject, then run terminuje bez provedení akce.
- Given restart backendu během `awaiting-approval`, then approval je pořád
  `pending` a run pořád `awaiting-approval` (nic se neztratí, nic se neprovede).

### Testy

Contract + e2e: demo agent s `requires_approval`, ověřit pauzu, approve→pokračuje,
reject→neprovede; restart-during-awaiting test.

### Rizika

- Varianta A vs B (rozhodnout).
- Co je „akce s vnějším efektem" — definice musí být konzervativní (default:
  cokoli mimo čtení/zápis do sandboxu a vault `daily/`).

---

## Fáze 3.5 — Gate policy engine (pravidla místo příznaku)

> **Zařadit mezi Fázi 3 a Fázi 4.** Zobecňuje approval gate z F3: F3 dodá
> _mechaniku_ (pauza, approval resource, restart sémantika), 3.5 dodá _policy
> vrstvu_ nad ní — kdy se má pauznout a jak se gate vyčistí. Vstupní artefakty
> už existují: `gate.schema.ts` + `gate.contract.ts`.

### Proč samostatná fáze (a co to dělá s F3)

F3 gatuje přes `requires_approval: boolean` + `risk: low/medium/high` ve
frontmatteru. To je stejný anti-pattern jako „risk je vlastnost nástroje":
příznak na entitě je moc hrubý (blokuje i bezpečné použití) i moc děravý (pustí
nebezpečné použití „bezpečné" entity). `git push` do `feature/*` je neškodný,
`git push --force main` je průšvih — jeden boolean to neumí rozlišit.

Risk je vlastnost **(akce, argumenty/cíl, kontext)**, ne entity. 3.5 zavádí
pravidlo jako jednotku rozhodování:

```
match (pole podmínek = AND)  →  decision  ( →  resolve, jen u "ask" )
```

**Vztah k F3 — explicitní migrace (rozhodnout, viz níže):**

- F3 status `awaiting-approval` a celý approval resource (`pending/approve/
reject`, durable storage, restart sémantika) **zůstávají beze změny** — 3.5 je
  jen generuje na základě pravidel místo na základě boolu.
- Frontmatter `requires_approval`/`risk` se **stává legacy sugar**: parse zůstává
  tolerantní, ale gating řídí nové pole `gates: GateRule[]`.
  `requires_approval: true` se desugaruje na jediné catch-all pravidlo
  `{ match: [{type:'context', context:'*'}], decision: ask, resolve: human }`.
  `risk` degraduje na čistě **display hint** v UI, ne rozhodovací vstup.

### Cíl

Runner před každou akcí s vnějším efektem vyhodnotí **zamýšlenou akci** proti
pravidlům (systémový floor + pravidla agenta) a podle výsledného `decision` ji
buď tiše provede (`allow`), provede a zaloguje (`notify`), pozastaví do
vyřešení (`ask` → F3 mechanika), nebo odmítne (`deny`). `ask` se vyčistí přes
`resolve` strom (human / check / agent / all / any).

### Kde sekvencovat — a co rozhodnout

**Doporučení: 3.5 hned po F3, PŘED F4.** Roadmapa říká, že F4 (memory write
policy) i F5 (automations) „gatují přes approval". Když budou gatovat přes
_boolean_ z F3 a engine přijde až po F5, přepíše se jim wiring podruhé. Když
engine přistane před F4, F4/F5 se na něj napojí rovnou (memory write =
`action: write` na `MEMORY.md` → `ask`; automation s vnějším efektem → projde
stejným evaluátorem).

**K explicitnímu rozhodnutí pro Claude Code:**

1. **Fold do F3 vs. samostatná 3.5.** Pokud F3 ještě nešipla, lze rovnou postavit
   F3 na engine a vynechat boolean. Doporučení: **samostatná 3.5** — drží
   „minimální mechanika first" instinkt roadmapy a F3 zůstane malá identity-anchor.
2. **Variant A vs B z F3.** Engine motivuje **variant B** (per-action gate):
   child emituje `INTENT {json}` (rozšíření `APPROVAL_REQUEST` protokolu z F3),
   runner ho prožene evaluátorem. Variant A (gate na hranici fáze) umí jen hrubé
   gatování celé fáze. Doporučení: **3.5 dodá protokol B**, A z F3 zůstane jako
   fallback pro fázové gaty bez per-action granularity.
3. **Kde žije evaluátor.** In-process `GateEvaluatorService` v `apps/api`, který
   volá runner přímo; `POST /gates/evaluate` je tenký HTTP wrapper nad tímtéž
   service (pro UI dry-run). Žádné HTTP volání z runneru na sebe sama. Váže se na
   cross-cutting rozhodnutí o `RunnerCore` (evaluační hook patří do jádra, ne do
   tří wrapperů).

### Scope

**Kontrakty (`libs/contracts`)** — výchozí soubory existují

- `gate.schema.ts` — `MatchCondition` (discriminated union: `tool` / `action` /
  `threshold` / `scope` / `context`), `Decision` (`allow|notify|ask|deny`),
  rekurzivní `ResolveSchema` (`human|check|agent|all|any`), `GateRule`
  (`RuleBase & RuleOutcome`, kde `resolve` existuje jen u `ask`), `GateRuleInput`
  (server dosadí `id`/`source`/`locked`), `IntendedAction`, `GateEvaluation`,
  `PendingApproval` (+ `ApprovalStep`), `PolicyViolation`.
- `gate.contract.ts` — `getSystemPolicy` (read-only floor), `getAgentGates`
  (`inherited` + `own`), `replaceAgentGates` (`422 PolicyViolation` na pokus
  oslabit floor), `evaluate` (dry-run), `listPendingApprovals`, `resolveApproval`.
- **Sjednotit s F3 approval resource:** `PendingApproval` z gate modelu vs.
  `Approval` z F3/`domain.ts` — jeden tvar, ne dva. Doporučení: `PendingApproval`
  je nadmnožina (`steps[]` + `combinator`), F3 `Approval` se na ni mapuje
  (`risk` zůstane jako display pole). Rozhodnout při slučování.
- Mechanický recept pro nový resource (`libs/contracts/README.md`):
  schema → contract → `index.ts` export → controller → module → `app.module.ts`
  → `apiContract` v `main.ts` → contract test + e2e.

**Backend (`apps/api`)**

- `gates/` modul — controller + `GateEvaluatorService` (matcher → decision +
  resolve flattening) + `policy.storage.service.ts`.
- **Storage (Markdown, žádná DB — storage-service pattern):**
  - Systémový floor = locked `POLICY.md` (frontmatter `policy: GateRule[]`,
    `source: 'system'`, `locked: true`). `resolveFile` guardy + `tryParse`
    tolerantní k jednomu vadnému pravidlu (zahodit pravidlo, ne celou politiku).
  - Pravidla agenta = `gates: GateRuleInput[]` ve frontmatteru agenta/skillu.
    Čtení: `GateRuleInput.array().parse(frontmatter.gates)`. Zápis: stejný tvar
    zpět (serialize beze ztráty).
- **Harden-only validace** (`replaceAgentGates`): pro každé `source:'system'`
  locked pravidlo ověřit, že agentí pravidlo na stejný matcher nemá slabší
  `decision` (`allow`/`notify` proti `ask`/`deny`). Porušení → `422
PolicyViolation` s `ruleIndex` + důvodem. **Agent si floor nesmí odemknout** —
  to je strukturální vynucení invariantu #4 (žádná autonomní transakce). Klíčové
  proti prompt-injection: agent, co přečte untrusted obsah, si nepřepíše gate na
  platbu.
- **Evaluační hook v `RunnerCore`:** před akcí s vnějším efektem runner sestaví
  `IntendedAction` (z `INTENT {json}` sentinelu varianty B nebo z hranice fáze) a
  zavolá `GateEvaluatorService.evaluate`. Na `ask` → vytvoř `Approval(pending)` +
  flatten `resolve` na `ApprovalStep[]`, run → `awaiting-approval` (F3 mechanika).
  Non-human steps (`check`/`agent`) řeší runtime sám (CI poll, podpis jiného
  agenta přes spawn). `deny` → terminuj akci, nikdy neprováděj.

**Frontend (`apps/web`)** — DS-first

- Redesign panelu „Pravidla schvalování" v editoru agenta (viz design prompt
  `zibby-gate-rules-prompt.md`): skupina `inherited` (locked, zámek, read-only) +
  `own` (editovatelná, drag-reorder = priorita) + modal „Přidat pravidlo"
  (matcher typ → decision → resolve). DS komponenty, žádný appkový Tailwind.
- Query hooky (`apps/web/features/gates/`): `useSystemPolicyQuery`,
  `useAgentGatesQuery`, `useReplaceAgentGatesMutation`, `useEvaluateMutation`
  (dry-run preview v modalu), `usePendingApprovalsQuery` (poll),
  `useResolveApprovalMutation`. `select: selectApiResponseBody`. React 19 → žádný
  `forwardRef`, žádný `any`.
- `ApprovalCard` z F3 rozšířit o `steps[]` view (`👤 Ty` / `✓ CI` / `🤖 reviewer`
  s `AND`/`OR`) místo prostého approve/reject; `resolveApproval` posílá `stepId`
  pro human step. Pending approvals → ActivityFeed / approval lane.

### Akceptační kritéria

- Given agent s pravidlem `{match:[{type:'action',action:'git.push',branch:'main'}],
decision:ask, resolve:human}`, when run dorazí na push do `main`, then
  `run.status → awaiting-approval`, existuje `Approval(pending)`, **push se
  neprovedl**; push do `feature/x` (pravidlo `decision:allow`) projde tiše.
- Given locked floor `{action:purchase → ask:human}` a agent zkusí přepsat to
  samé na `allow`, when `PUT /agents/:id/gates`, then `422 PolicyViolation` a
  floor zůstane v platnosti (váže na user-skill `rohlik`: checkout nikdy
  autonomně).
- Given pravidlo `merge → ask, resolve:{all:[check.ci_green, human]}`, when CI
  zelené a člověk schválí, then merge projde; když chybí kterýkoli step, gate
  zůstává `pending`.
- Given `IntendedAction` se `metrics:{'purchase.amount':540}` a pravidlo
  `{type:'threshold', metric:'purchase.amount', op:gt, value:500} → ask`, when
  evaluate, then `decision:ask`; při `amount:120` → `allow`.
- Given restart backendu během `awaiting-approval` (z 3.5 pravidla), then
  approval pořád `pending`, run pořád `awaiting-approval` (F3 restart sémantika
  platí beze změny).
- Given legacy agent s `requires_approval:true` a bez `gates`, when run, then se
  chová jako catch-all `ask:human` (zpětná kompatibilita).

### Testy

Contract testy (`libs/contracts`) na `GateRule`/`Resolve` (rekurze, `resolve`
jen u `ask`). Unit testy `GateEvaluatorService`: matcher precedence (první match
v pořadí vyhrává), AND podmínky, threshold operátory, harden-only validace.
Storage unit testy `POLICY.md` (klon `agents.storage.service.test.ts`,
parse-tolerance). E2e (`apps/api/test`): demo agent s pravidlem → evaluate →
`ask` → `awaiting-approval` → resolve → pokračuje; pokus oslabit floor → `422`;
restart-during-awaiting. `npm run lint && npm run typecheck && npm run test`
zelené.

### Rizika / otevřené otázky

- **Sjednocení `Approval` (F3) × `PendingApproval` (gate)** — jeden tvar, ne dva
  (viz Scope). Pokud F3 už shiplo s `domain.ts` `Approval`, je to malá contract
  migrace.
- **Matcher precedence** — pořadí pole = priorita, první match vyhrává; potřebuje
  deterministický test a jasné UI (drag-reorder ukazuje prioritu).
- **Definice „akce s vnějším efektem"** (sdílí s F3) — konzervativní default:
  cokoli mimo čtení/zápis do sandboxu a `daily/`. `purchase`/`payment`/`delete`
  mimo `/tmp`/`git.force_push`/`send_email` jsou tvrdě ve floor.
- **`resolve: agent`** (podpis jiného agenta) — vyžaduje spawn review agenta;
  pozor na cyklus (reviewer, co sám potřebuje approval). Doporučení: review agenti
  mají `gates: []` a běží v read-only sandboxu.
- **Variant B protokol** — rozšířit `APPROVAL_REQUEST` na `INTENT {json}` =
  `IntendedAction`; child blokuje na rozhodovacím souboru (stejně jako F3 var. B).

### Tickety (Claude Code: přeskládej do svého plánu)

- **3.5-1** Sjednotit `gate.schema.ts` s F3 `Approval`/`domain.ts` + `RunStatus`
  (rozhodnout fold vs. samostatná, A vs. B, lokace evaluátoru).
- **3.5-2** `gates` resource (contract + `POLICY.md` storage + agent frontmatter
  `gates:` parse/serialize + harden-only `422`).
- **3.5-3** `GateEvaluatorService` (matcher → decision + resolve flatten) +
  `evaluate` endpoint + unit testy precedence/threshold/harden.
- **3.5-4** Evaluační hook v `RunnerCore` + protokol B (`INTENT {json}`) → na
  `ask` vytvoří approval, run `awaiting-approval`.
- **3.5-5** FE: redesign panelu „Pravidla schvalování" (DS) + query hooky +
  `ApprovalCard` se `steps[]`.
- **3.5-6** Legacy desugar `requires_approval`/`risk` → catch-all pravidlo / display.

---

## Fáze 4 — Memory layer naživo

### Cíl

Route `memory` zpřístupní reálný vault: index-first retrieval přes API,
force-directed graf wiki-linků z `.md`. ActivityFeed propojit s reálnými zápisy do
`MEMORY.md` / `daily/`. Action-boundary do frontmatteru (`action_safe_after`).

### Scope

**Vault přístup**

- DI token `VAULT_DIR` (Obsidian vault na Holly). Čtení volné, zápisy řízené.
- Tiers: `memory` (kurátorská `MEMORY.md`), `daily/` (epizodické logy),
  `knowledge/` (tematické noty). Index-first: MOC/INDEX.md jako vstupní body,
  **explicitní search logika, ne vektorové embeddingy** (Karpathy přístup —
  spolehlivější a token-efficient).

**Kontrakt (`memory.contract.ts` + `memory.schema.ts`)**

- `GET /api/memory/index` — parsované INDEX.md / MOC entries.
- `GET /api/memory/note/:id` — jedna nota.
- `GET /api/memory/graph` — `{ nodes: {id,label,tier}[], edges: {from,to}[] }`
  z wiki-linků `[[...]]`.
- `GET /api/memory/search?q=` — index-first retrieval (ne vektor).
- `POST /api/memory/daily` — append epizodického logu (bezpečný zápis).
- Editace `MEMORY.md` (kurátorská) — **gatovaná přes Fázi 3.**

**Schéma**

- `Note = { id, path, frontmatter, links: string[], backlinks?: string[] }`.
- Wiki-link parser: extrahovat `[[...]]`, resolvovat na note id, stavět
  adjacency. **Reuse / sjednotit s existujícím `graphify`** (repo už má
  `graphify-out/`, CLAUDE.md ho dokumentuje) — neimplementovat graf dvakrát,
  cache jako graphify.

**Write policy (definovat explicitně)**

- `daily/` append = bezpečný (auto). `MEMORY.md` kurátorská editace = side-effect
  → approval. `action_safe_after` ve frontmatteru = akce je auto-bezpečná až po
  timestampu/podmínce (váže se na approval + automations z Fáze 5).

**ActivityFeed wiring**

- Reálné runy / approvaly / memory-zápisy plní ActivityFeed (nahradit mock).
  Každý run, co píše do vaultu, appenduje do `daily/`.

**Frontend**

- Memory Screen: force-directed graf (d3-force) z `/api/memory/graph`, note
  viewer, ActivityFeed z reálných eventů.

### Akceptační kritéria

- Given vault s wiki-linkovanými `.md`, when `GET /api/memory/graph`, then nodes +
  edges odpovídají `[[...]]` linkům a tiers (`memory`/`daily`/`knowledge`).
- Given dotaz, when `GET /api/memory/search?q=`, then výsledek vychází z
  index/MOC logiky, ne z embeddingů.
- Given run dokončí práci, when zapíše do vaultu, then se objeví záznam v
  `daily/` a event v ActivityFeedu.
- Given editace `MEMORY.md`, then projde approval gate (Fáze 3).

### Rizika

- Cena výpočtu grafu na velkém vaultu → cache (jako graphify).
- Konzistence „source of truth" mezi `userMemories` perzistencí a vaultem.

---

## Fáze 5 — Heartbeat & automations (tady vzniká autonomie)

### Cíl

Route `automations`: cron/event triggery spouští pipeline bez vyzvání. Démon jede
přes noc → ranní brífink je reálný výstup. **Každá akce s vnějším efektem prochází
approval frontou z Fáze 3.**

### Scope

**Kontrakt (`automations.contract.ts` + `automation.schema.ts`)**

- `Automation = { id, name, trigger, target, enabled }`.
- `trigger = { type: "cron", expr } | { type: "event", event }`.
- `target = { pipelineId | agentId | skillId }`.
- CRUD + `enable`/`disable`.

**Backend — scheduler**

- Scheduler service (`@nestjs/schedule` cron, nebo vlastní loop — démon běží
  trvale na Holly). On trigger → start cílového runu přes runner.
- **Overnight běhy stavějí approvaly do fronty z Fáze 3** → ráno je člověk
  odbaví. Autonomie = plánování, NE destruktivní akce.
- Heartbeat: API proces běží kontinuálně; „morning briefing" = automation co
  běží přes noc a vyrobí `daily/` notu + summary na Overview.

**Frontend**

- Automations Screen: builder cron/event triggeru + target picker, enable/disable
  toggly, náhled next-run.

### Akceptační kritéria

- Given enabled cron automation, when nastane čas, then se cílový run spustí bez
  zásahu uživatele.
- Given automation spustí akci s vnějším efektem, then akce čeká ve Fázi-3
  frontě, neprovede se autonomně.
- Given overnight běh, then ráno existuje `daily/` brífink + summary na Overview.

### Rizika / rozhodnutí

- **Idempotence po restartu** — nedvojit triggery (NEXT-STEPS souvislost).
- **Missed-trigger policy** — dohnat zmeškané vs. přeskočit.
- **Timezone** — `Europe/Prague`.

---

## Fáze 6 — Robustnost reálného executoru

> Tady se z velínu stává JARVIS — autonomie plánování, ne autonomie
> destruktivních akcí. Ukotveno přímo v komentáři runneru + `NEXT-STEPS.md`.

### Cíl

Vyřešit orphan-process mezeru (`kill -9` reparenting), reconnect běžících agentů
po restartu, concurrent-safety, a reálné `claude -p` napojení mimo demo.

### Scope

**Orphan-process mezera** (runner to sám přiznává v komentáři)

- Tvrdý kill (`kill -9`/OOM) reparentuje child na init; po restartu se relabeluje
  `interrupted`, ale může pořád běžet → zombie agenti zaseknou stroj (přesně
  NEXT-STEPS #2). Dvě cesty (runner je sám jmenuje):
  - **Process groups + pgid tracking (doporučeno jako primární):** spawn s
    `detached`/vlastní process group, perzistovat `pgid` do sidecaru, po restartu
    zjistit živost (`process.kill(pgid, 0)`) → buď reattach monitoring, nebo čistě
    zabít celou grupu.
  - **Heartbeat soubor (doplněk):** běžící child periodicky „touchne" heartbeat
    soubor; po restartu stale heartbeat = mrtvý (relabel), čerstvý = živý.
- Doporučení: pgid primárně (deterministická živost + clean group kill),
  heartbeat jako doplňkový staleness signál.

**Reconnect po restartu** (NEXT-STEPS #2)

- V `onModuleInit` pro runy zůstalé `running` zjistit reálnou živost (pgid), pak
  buď obnovit monitoring (re-tail log, re-attach exit detekci pollingem pgid),
  nebo kill+rekonciliace — **místo slepého relabelu na `interrupted`.**

**Concurrent-safety** (NEXT-STEPS #1)

- Testy concurrent start/stop/log-read; in-memory `runs` mapa + sidecar zápisy
  race-safe.

**Reálné `claude -p`**

- Z `demo-task.mjs` na reálné `claude -p <prompt>` (swap `AGENT_RUNNER_MODE=claude`
  už existuje). Sestavit prompt z `instructions` agenta + handoff kontextu,
  ošetřit token budget vůči limits widgetu, surface chyb.

### Akceptační kritéria

- Given run, jehož proces přežil `kill -9` backendu, when restart, then runner
  detekuje, že **pořád běží** (přes pgid) a **NErelabeluje** ho na `interrupted`;
  buď reattach, nebo čistě zabije grupu.
- Given N concurrent runů (start/stop/tail), then žádný log ani status se
  nepoškodí (deterministický test).
- Given `AGENT_RUNNER_MODE=claude`, when start, then `claude -p` provede sestavený
  prompt a výstup teče do logu identicky jako demo.

### Rizika

- Token budget reálného `claude -p` vs. 5h/weekly kvóty (limits widget).
- Reattach k procesu, který nejde child tohoto procesu — sledovat exit jen
  pollingem pgid, ne `child.on("exit")`.

---

## Příloha — Cross-cutting, sekvencování, tikety

### Dopady na cross-cutting sekci roadmapy

**Sekvenční diagram:**

```
2b ──► 3 ──► 3.5 ──► 4 ──► 5
 │                   ▲
 └──────► 6 ─────────┘   (6 paralelně po 2b; pgid jádro chce 3 + 3.5 + 5)
```

**Co roste napříč fázemi (doplnit):**

- **Frontmatter schéma:** `+gates: GateRule[]` (F3.5) se stává hlavní
  konfigurační plochou approvalu; `requires_approval`/`risk` (F3) → legacy sugar
  / display, parse-tolerantně dál. `action_safe_after` (F4) se přepíše jako
  threshold/scope matcher místo samostatného pole (rozhodnout v F4).
- **`RunStatus`:** beze změny oproti F3 (`awaiting-approval` stačí); mění se jen
  _důvod_ přechodu (matchnuté `ask` pravidlo místo boolu).
- **Nová locked plocha:** `POLICY.md` (systémový floor) — jediný zdroj pravdy pro
  invariant #4, agent ho smí jen přitvrdit. Žije vedle agentích `.md`.
- **Evaluační hook v `RunnerCore`** — další důvod generalizovat runner (cross-cutting
  ⭐): policy se jinak musí napojit do tří runnerů zvlášť.

- **2b první** (a v rámci něj jako úplně první ticket: rozhodnout sdílený
  `RunnerCore`).
- **3 hned po 2b** (jádro identity; status enum + frontmatter jsou předpoklad pro
  4 a 5).
- **4 a 5** stavějí na 3 (memory write policy a automations obě gatují přes
  approval).
- **6** lze začít hned po 2b, ale pgid/restart jádro se nejlíp dotáhne, až je
  jasné, jak runy pauzuje 3 a spouští 5.

### Co roste napříč fázemi

- **`RunStatus` enum**: `+awaiting-approval` (F3). Každá změna = contract break →
  vědomé sekvencování.
- **Frontmatter schéma** (reálná konfigurační plocha): `+requires_approval`,
  `+risk` (F3); `+action_safe_after` (F4). Vždy **parse-tolerantní** (zahodit
  neznámé pole).
- **Migrace `useCatalog` mock → reálné API**: per-entita jak přistávají backendy
  (skills+pipelines v 2b, approvals v 3, memory+activity v 4, automations v 5). DS
  komponenty zůstávají, mění se jen zdroj dat.

### Mechanický recept pro každý nový resource (z `libs/contracts/README.md`)

`*.schema.ts` → `*.contract.ts` → export v `index.ts` → controller →
module → registrace v `app.module.ts` → zařazení do `apiContract` v `main.ts`
→ contract test + e2e test → `npm run lint && npm run typecheck && npm run test`.

### Návrh prvotních ticketů (Claude Code: tohle rozsekej / přeskládej do svého plánu)

- **2b-1** Rozhodnout & vyčlenit `RunnerCore` (spawn/log/sidecar/restart).
- **2b-2** `skills` resource (contract + storage + run přes RunnerCore + FE migrace).
- **2b-3** `pipelines` resource (contract sjednocený s `domain.ts` phases/loop).
- **2b-4** `PipelineRunnerService`: handoff přes disk + tester loop s `maxRetries`.
- **3-1** `RunStatus += awaiting-approval` + frontmatter `requires_approval`/`risk`.
- **3-2** `approvals` resource + durable storage + restart sémantika.
- **3-3** Runner pauza (varianta A: gate na hranici fáze) + FE `ApprovalCard` wiring.
- **4-1** `memory` resource: index/note/search (index-first).
- **4-2** `/api/memory/graph` přes/sjednoceně s `graphify` + FE force-directed graf.
- **4-3** Write policy (`daily/` auto, `MEMORY.md` gated) + ActivityFeed na reálné eventy.
- **5-1** `automations` resource + scheduler (idempotence, missed-trigger, TZ).
- **5-2** Morning-briefing automation → `daily/` + Overview summary.
- **6-1** pgid tracking + reconnect po restartu (NEXT-STEPS #2).
- **6-2** Concurrent-safety testy (NEXT-STEPS #1).
- **6-3** Reálné `claude -p` napojení + token-budget vůči limits.

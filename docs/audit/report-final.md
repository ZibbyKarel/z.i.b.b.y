# Code Audit Report — 2026-07-12

Delegovaný audit celého NX monorepa Z.I.B.B.Y (web + api + libs). 57 batchů, každý
analyzován samostatným subagentem; orchestrátor sám nečetl zdrojové soubory (výjimka:
2 bezpečnostní spot-checky na konci). Surové výstupy per batch v `.audit/batches/*.md`.

## Shrnutí

- **Analyzováno:** 57 batchů pokrývajících `apps/web` (29), `apps/api` (25), `libs/` (3: contracts, design-system, forms). ~110 tis. řádků zdrojového kódu.
- **Nálezů celkem: 562** — Critical 16 / High 86 / Medium 221 / Low 239 (surové labely subagentů).
- **Po normalizaci severity: 4 potvrzené Critical** (všechny API/bezpečnost). Zbytek "Critical" labelů pocházel od slabších modelů (haiku/sonnet) a jde reálně o High/Medium — normalizace zdůvodněna níže.

### Normalizace Critical labelů

Dva Critical nálezy jsem **ověřil přímým čtením kódu** (jsou potvrzené):

| Nález | Verdikt |
|---|---|
| **Secrets do logu** — `LoggingInterceptor` loguje request body na 3 credential routes | ✅ POTVRZENO (spot-check) |
| **Gate bypass** — non-action agent rule zastíní locked floor `pr.merge: deny` | ✅ POTVRZENO (spot-check) |
| **task-scheduler double-PR race** — `writeAgentOutcome` bez zámku před `handleTerminal` | Plausible, neověřeno kódem |
| **budget check→record race** — immediate-create cesta bez zámku překročí cap | Plausible, neověřeno kódem |

Ostatní "Critical" labely **downgraduji**: web nálezy (LoadingScreen raw Tailwind, CommandLine 1099 řádků, companies PersonRow extrakce, RunDetail `<a>` DS violation) jsou reálně High/Medium (údržba/konzistence, ne produkční/bezpečnostní riziko). Tři "React anti-pattern" Critical nálezy v `tasks` (render-time setState) jsou **false positives** — jde o oficiálně dokumentovaný React vzor "adjust state during render"; skutečný problém je jen duplikace bez sdíleného hooku (Medium). `channel.schema z.unknown()` a `integration.schema` typová díra jsou High.

### 5 nejdůležitějších systémových problémů (cross-cutting)

1. **Secrets leak do stdout logu (Critical, potvrzeno).** Globální `LoggingInterceptor` loguje syrové request body na všech mutačních routách kromě `/logs`. Postihuje `PUT /projects/:id/secrets`, `/integrations/:id/credentials`, `/mcp-servers/:id/credentials` + chat prompty. `safeStringify` jen zkracuje (1000 znaků), neredaguje. Jediný fix (redakční deny-list + `skipBody` pro `/credentials`+`/secrets`) zavře všechny naráz.

2. **Zákonná gate vrstva je obejitelná/oslabitelná (Critical + 3× High, gate bypass potvrzen).** `harden-only` validace porovnává jen `action`-podmínky, takže agent rule keyed na `tool`/`scope` projde validací a přes first-match-wins (own-rules-first) zastíní locked floor deny. Dále: policy floor je jen empty-fallback (částečně stripnutý POLICY.md se neobnoví na kanonický floor), unmatched akce fail-open na `allow` (proti zákonu "when unsure, higher tier"), `deploy` (Tier-3) není na locked floor, approve/reject má TOCTOU. **Přímý útok na Law 1/3/4.**

3. **Systémový lost-update / TOCTOU vzor napříč vším storage.** Kořen: `EntityFileStore.writeEntity` a `category-manifest-store` dělají read-modify-write bez `withPathLock` (atomic rename brání jen torn file, ne ztracenému zápisu). Projevuje se v scheduler outcome (double-PR), budget ledger (cap bypass), vault notes, automations markFired, pipeline/goal resume, monitor/channel dedup, run-recorder, mcp/hooks/commands create. **`withPathLock` existuje, ale je nereentrantní a nepoužitý** — fix patří do shared vrstvy, ne 10× lokálně.

4. **Prompt-injection řetěz inbound → memory → grounding → každý budoucí run.** Untrusted text (Slack/email/Jira/GitHub) teče do claude-cli-triager, briefer, memory-distiller a chat get_status/recall_memory **bez untrusted-data ohraničení**. Distilled "learning" se zapíše do vaultu a přes grounding se re-injektuje do system promptu KAŽDÉHO budoucího runu. Vault Markdown je opakovaně nechráněný sink (self-knowledge marker injection, gap-detector bullet injection). Law 4 ("inbound = data, ne příkazy") není technicky vynucen, jen instruován v promptu.

5. **8× duplikovaný claude-CLI spawn/parse/timeout vzor + re-entrancy chybí v 5 watcherech.** `spawn + 8s timeout + envelope-unwrap + fence-tolerant JSON parse` je nezávisle zkopírován v runner-core, claude-cli-router, task-namer, distiller, briefer, triager, preflight, chat-session, goal-runner. Žádná z kopií nemá cap na stdout buffer. Paralelně: 5 `setInterval` watcherů (channel, monitor, automations, task-scheduler, limit-resume) nemá re-entrancy guard → překryv ticků → dvojité zpracování/dispatch. Oboje volá po sdílené base třídě (`ClaudeCliRunner`, `TickingWatcherBase`).

---

## WEB

Žádný potvrzený Critical (po normalizaci). `apps/web` je celkově zdravý — TanStack/DS konvence se drží, secrets se nikde neexponují. Hlavní dluh je velikost komponent a duplikace.

### High

| Soubor(y) | Problém | Doporučení | Effort |
|---|---|---|---|
| `runs/components/RunDetail.tsx` (858 ř.) · `chat/components/ChatScreen.tsx` (748) · `tasks/.../CommandLine.tsx` (1099) · `projects/ProfileScreen.tsx` (685) · `chat/scene/sceneController.ts` (1006) | Obří komponenty mísící 5-8 zodpovědností (state machine, DOM měření, upload, render) | Rozdělit na subkomponenty + vytáhnout state do hooků | L (per soubor) |
| `LoadingScreen/*` (7 souborů) · `layout/SkipLink` | Desítky raw Tailwind tříd na holých DOM uzlech mimo DS (className mimo lint dohled) | Povýšit boot-splash + SkipLink do `libs/design-system` | M |
| `components/*` (HudCard, HudPanel, Collection, EmptyState, ConfirmDeleteDialog, DialogTitle) | 6 čistě prezentačních komponent použitých v 15+ features žije v `apps/web` místo DS | Přesunout do `libs/design-system` (Storybook + testid) | M |
| `pipelines/PipelineCanvas.tsx:190` | Window listenery se re-attachují každý mousemove frame (`graph` v dep array); AgentNode nememoizován → O(n²)/frame | Refs místo dep array; `memo` + precompute id→node Map | M |
| `agents/DetailScreen` ↔ `NewAgentDialog` · `skills` ↔ `commands` (editor shell, tiles, zod schémata) | Rozsáhlý copy-paste mezi paralelními katalogovými features | Sdílené `useXxxRuleEditor` / `CatalogTile` / `CatalogQueryState` | M |
| `GlobalSearch/useGlobalSearch.ts` (155 ř.) | Netriviální hook (debounce, ⌘K, 5 zdrojů) bez jediného testu | Doplnit unit testy | S |

### Medium (výběr z ~90)

- **Nevalidovaný `JSON.parse(...) as X` na SSE payloadech** (`useChatStream`, `runEvents`, `useRunLogStream`) — poškozený frame projde bez validace. Zavést zod validaci SSE zpráv.
- **`glyph as IconName` casty** na 20+ místech napříč features — string z API castován na uzavřený union bez fallbacku. Sdílený `toIconName(glyph, fallback)` guard.
- **Chybějící sdílené hooky** — `useLatestRef`, `usePersistedState`, `useKeyboardShortcut`/`useEscapeKey`, `useHoverPopover`, `useAnchoredPosition` jsou ad-hoc reimplementovány v 3-5 komponentách každý.
- **Mrtvý kód** — `TaskAttachments.tsx` (nerendrováno), `chains/useStartChainMutation` (nevoláno), `memory/filterGraphByProject` (nepoužito), settings "caffeinate" toggle (píše localStorage klíč, který nikdo nečte).
- **Settings: 6 sekcí tiše `return null`** při loading/error místo QueryLoading/QueryError.

### Cross-cutting doporučení (web)

- Zavést chybějící sdílené hooky (`useLatestRef`, `usePersistedState`, `useKeyboardShortcut`, `useHoverPopover`) — eliminuje desítky duplicit najednou.
- Povýšit generické primitivy z `apps/web/components` do `libs/design-system` (HudCard/HudPanel/Collection/EmptyState/dialogy + boot-splash + SkipLink).
- Sjednotit `toIconName` guard a strategii pro rozdělování komponent nad 300 řádků (aktuálně 5 souborů nad 650).
- Zavést runtime validaci všech SSE/`JSON.parse` payloadů přes zod (kontrakt už existuje).

---

## API

Všechny 4 potvrzené Critical jsou zde. Nejzávažnější je zákonná gate vrstva a secrets-leak.

### Critical

| Soubor | Problém | Doporučení | Effort |
|---|---|---|---|
| `shared/logging/logging.interceptor.ts:62` | **[POTVRZENO]** Loguje syrové request body na `/projects/:id/secrets`, `/integrations/:id/credentials`, `/mcp-servers/:id/credentials` + chat prompty na `info` úrovni bez redakce | Redakční deny-list (token/password/secret/env/headers/credentials) + `skipBody` pro `/credentials`+`/secrets` | S |
| `gates/gate-evaluator.service.ts:156` | **[POTVRZENO]** `harden-only` porovnává jen action-podmínky → agent rule na `tool`/`scope` projde validací a přes first-match-wins zastíní locked floor `pr.merge: deny` | Harden-only match-agnostic (každou floor akci vůči plné own-rule match-set); floor-precedence i za runtime | M |
| `tasks/task-scheduler.service.ts:1124` | `writeAgentOutcome` čte guard, pak `await handleTerminal` (otevře PR) bez zámku → dva terminal handlery můžou oba otevřít PR | `withPathLock(task:${id})` kolem guard→handleTerminal→writeOutcome | M |
| `budget/budget.service.ts:85` | `check()` a `recordDispatch()` bez zámku na immediate-create cestě → souběžné vytvoření překročí run cap (proti zákonu no-auto-spend) | Serializovat check+record per-project (stejný lock jako drain) | M |

### High (34 nálezů — výběr nejnosnějších)

| Soubor | Problém | Doporučení |
|---|---|---|
| `gates/policy.storage.service.ts:42` | Policy floor je jen empty-fallback; částečně stripnutý POLICY.md floor neobnoví | Union disk floor s DEFAULT_FLOOR (disk smí jen přidat/zpřísnit) |
| `gates/gate-evaluator.service.ts:127` | Unmatched akce → `allow` (fail-open, proti "when unsure higher tier") | Default unmatched mutující akce na `ask` |
| `approvals/approvals.service.ts:140` | approve/reject TOCTOU → run resumnut i přes souběžný reject / double-spawn | Serializovat rozhodnutí per approval id |
| `runner/runner-core.ts:551` | `cancel()` zabije jen leadera, ne detached process group → osiřelé nástroje přežijí "stop" | `killGroup(pgid)` jako všude jinde |
| `runner/claude-run-command.service.ts:151` | Approval hook denylist NErozpozná `mv`/`>`/`cp`/`sed -i`/`/bin/rm` — kontrakt slibuje "covers overwrite, move" | Rozšířit denylist nebo sladit text kontraktu |
| `runner/claude-run-command.service.ts:466` | MCP config se secrety (Bearer token, headers) inline v argv → viditelné přes `ps` | Předat config souborem, ne argv |
| `channels/channel-watcher.service.ts:80,178` | Tick bez re-entrancy guard → dvojí dispatch; triage failure natrvalo uvízne zprávu ve `new` | isTicking guard; per-tick sweep `new`-items |
| `channels/triage/claude-cli-triager.ts` | Nejkritičtější prompt-injection komponenta bez jediného testu | Testy na crafted verdict payloady (tier=4, extra keys, fenced JSON) |
| `pipelines/pipeline-runner.service.ts:427` | Resume TOCTOU → dva souběžné `drive()` loopy nad stejným run objektem | Per-run driving mutex |
| `memory/claude-cli-distiller.ts:145` | Inbound obsah do promptu bez ohraničení → přes grounding do každého budoucího runu | Untrusted-data delimiter; flag distilled notes jako lower-trust |
| `chat/chat-mcp.controller.ts:49` | `POST /api/chat/mcp` bez autorizace → kdokoli na portu spustí create_task/machine ops | Loopback + shared-secret token |
| `workspace/workspace.service.ts:187` | `git clone` remote bez scheme validace → `ext::sh -c` (git ext-transport RCE třída) | Allowlist scheme; reject `ext::`/leading-dash; `--` separator |
| `goals/goal-runner.service.ts:492` | `budgetOk()` fail-OPEN přes catch (doc slibuje fail-closed) | Default `ok:false` na chybě |
| `automations/scheduler.service.ts:52,96` | Tick bez re-entrancy + loop bez try/catch (jedna chyba zastaví všechny pozdější) | isTicking guard + per-automation try/catch |
| `contracts/*` | Slabá schémata: `command.model` volný string, chains špatný ID typ, `ProjectSecretsInputSchema` unconstrained record, `UpdatePipelineSchema` bez refine, project/skill pathParams 400 místo 404 | Zpřísnit enumy/bounds; re-apply superRefine; plain `z.string()` pathParams |

### Medium/Low systémové (výběr)

- **`list()`-then-`find()` bez indexu/paginace** — task-runs `collect()`, pipeline-runs `listAll()`, goals `readAllAggregates()`, companies/projects storage, chains artifacts, budget ledger. O(historie) na každý request; disk se nikdy nepruní. Zavést by-id lookup + retention sweep.
- **`avatarAssets.inlineSync` (readFileSync) v hot list path** — blokuje event loop při každém `list()` pipelines/agents. Kořen v `avatar-asset-store.ts` (shared).
- **Sync `readFileSync` v konstruktorech** SystemConfigStore/PinsStore (boot-time, OK), ale nedokumentovaná multi-proces nebezpečnost.
- **Vault Markdown injection** — self-knowledge composer AUTO-markery, gap-detector bullets, briefing didForYou — untrusted text do MD bez escapování.

### Cross-cutting doporučení (api)

1. **Zabudovat `withPathLock` do `EntityFileStore`/manifest storů** — jediný fix zavře lost-update napříč scheduler/budget/vault/automations/pipeline/goal/mcp storage. Nejdřív ale opravit nereentranci `withPathLock` (dokumentovat + guard).
2. **Redakce v LoggingInterceptor + trace-id validace** — zavře secrets-leak (Critical) i log-injection.
3. **Extrahovat `ClaudeCliRunner` base** (spawn + timeout + buffer-cap + envelope-unwrap + fence-parse) — nahradí 8 kopií a přidá chybějící stdout cap všem.
4. **Extrahovat `TickingWatcherBase`** (timer lifecycle + busy-guard) — re-entrancy fix pro 5 watcherů jednou.
5. **Untrusted-data ohraničení** — sdílený `wrapUntrusted(text)` delimiter pro všechny claude-CLI prompty (triager/briefer/distiller/chat) + escaping pro vault Markdown sinky. Technicky vynutit Law 4.
6. **Zpřísnit gate vrstvu** — floor-precedence za runtime, union s DEFAULT_FLOOR, unmatched→ask, `deploy` na locked floor, testy mandate/policy floor.
7. **Sdílený `git-exec.ts`** (bounded execFile + remote validace) pro workspace + self service.

---

## Contracts (libs/contracts)

Samostatná vrstva "single source of truth" — nejčastější třída nálezů jsou slabá schémata:

- **Chybějící bounds na user-input** — task `paths`/`toolGrants` (→ `--add-dir` granty!), speech `text`, memory/machine/channel stringy bez `.max()`.
- **Slabé enumy** — `command.model` volný string místo `z.enum(['opus','sonnet','haiku'])`.
- **Nekonzistence** — DELETE response shapes (4 varianty), ID typy (agent/project/pipeline/skill = strukturálně identické `AgentIdSchema`, žádné branding), duplicitní RunStatus/Artifact/PR schémata místo sdílení z `common.schema.ts`.
- **Typová díra** — `Integration` typ z nerefinovaného schématu → XOR project/company invariant nevynucen na typové úrovni.
- **pathParams `id` s regexem** → malformed id 400 místo dokumentovaného 404 (projects/skills; subsystems to řeší správně plain `z.string()`).

Doporučení: bounded schémata pro všechny user-inputy, branded ID typy (souvisí s plánovaným `docs/plans/entity-id-refactor.md`), sdílené `DeleteResponseSchema`/`RunArtifactSchema`/`PrSummarySchema`/`EmptyBodySchema` v `common.schema.ts`.

---

## Navrhovaný postup nápravy

Seřazeno podle risk/effort — bezpečnost a zákonná vrstva první.

**P0 — okamžitě (bezpečnost, malý effort):**
1. Redakce secrets v `LoggingInterceptor` (Critical, ~S). Jeden soubor, zavře 3 leak routes.
2. Gate floor-precedence + harden-only match-agnostic (Critical, ~M). Zákonná vrstva.
3. `withPathLock` do `EntityFileStore`/manifest storů + oprava jeho nereentrance (Critical×2 race + ~15 High/Medium, ~M). Jeden shared fix.

**P1 — brzy (bezpečnost + korektnost):**
4. Untrusted-data ohraničení pro claude-CLI prompty + vault MD escaping (Law 4, ~M).
5. `runner-core cancel()` → killGroup; approval-hook denylist rozšíření; MCP config mimo argv (~M).
6. Policy floor union s DEFAULT_FLOOR; unmatched→ask; `deploy` na floor; approve/reject serializace (~M).
7. Re-entrancy guard do 5 watcherů (`TickingWatcherBase`, ~M).
8. `git clone` remote validace (~S).
9. chat MCP autorizace (loopback+token, ~S).

**P2 — plánovaně (údržba/dluh):**
10. `ClaudeCliRunner` base (8 kopií → 1, přidá buffer capy).
11. Zpřísnit contracts schémata (bounds, enumy, branded ID) — koordinovat s entity-id refaktorem.
12. Rozdělit obří soubory (runner-core 1244, pipeline-runner 1955, task-scheduler 1341, goal-runner 1202 · web: RunDetail 858, ChatScreen 748, CommandLine 1099, ProfileScreen 685).
13. `list()`-then-`find()` → by-id lookup + retention sweepy.
14. Povýšit DS primitivy z apps/web; zavést sdílené web hooky.

**P3 — průběžně:**
15. Test coverage díry — zejména bezpečnostní: triager, machine open-url guard, mandate/policy floor, gate harden-only, approvals concurrency, file-utils path containment.
16. Mrtvý kód (TaskAttachments, useStartChainMutation, filterGraphByProject, caffeinate toggle).

## Nezpracované části

Žádné. Všech 57 batchů dokončeno (`status: done`, 0 failed). Kompletní per-batch výstupy
v `.audit/batches/*.md`, průběžný stav v `.audit/progress.json`.

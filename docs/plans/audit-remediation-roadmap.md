# Audit remediation roadmap

> TODO: _"vytvořit implementační plány pro zpracování chyb nahlášených v `docs/audit`"_

Zdroj: `docs/audit/report-final.md` (2026-07-12, 57 batchů, 562 surových nálezů →
po normalizaci **4 potvrzené Critical**, všechny API/bezpečnost). Tento dokument je
**index** — mapuje audit → sekvenční fázové plány a drží pořadí náprav (risk/effort,
bezpečnost a zákonná vrstva první).

Detailní plány jsou samostatné `phase-NNN-*.md` soubory; každý je ukotvený v reálném
kódu (ověřené cesty + čísla řádků, ne jen čísla z auditu — ta místy driftovala).

---

## Ověřené plány (P0 + P1 bezpečnost) — připravené k implementaci

Pořadí odpovídá `Navrhovaný postup nápravy` v report-final.md. Fáze mají mezi sebou
závislosti (níže), jinak jsou samostatné a landují po malých commitech.

| Fáze | Plán | Audit-závažnost | Effort | Závisí na |
|---|---|---|---|---|
| **121** | [LoggingInterceptor: redakce secrets](phase-121-logging-interceptor-secrets-redaction.md) | Critical (potvrzeno) | S | — |
| **122** | [Gate legal-layer hardening](phase-122-gate-legal-layer-hardening.md) | Critical (potvrzeno) + 4× High | M | 123 (approvals lock) |
| **123** | [Sdílený `withPathLock` ve storage vrstvě](phase-123-shared-withpathlock-storage.md) | Critical×2 race + ~15 High/Med | M | — (je základ) |
| **124** | [Untrusted-data boundary + vault MD escaping](phase-124-untrusted-data-boundary.md) | High (Law 4) | M | — (obranná vrstva; gate=backstop) |
| **125** | [Runner & git-exec hardening](phase-125-runner-git-exec-hardening.md) | 4× High | M | — |
| **126** | [`TickingWatcherBase` re-entrancy guard (5 watcherů)](phase-126-ticking-watcher-base.md) | High (systémové) | M | — |
| **127** | [chat MCP endpoint autorizace](phase-127-chat-mcp-authorization.md) | High | S | 125 (token mimo argv) |

**Doporučené pořadí landování:** 123 (reentrantní `withPathLock` + storage lock je základ)
→ 121 (nejmenší, čistá výhra) → 122 (zákonná vrstva, staví na 123) → 125 → 127 (staví na 125)
→ 124 → 126. Každá fáze končí `pnpm check:lint` / `check:types` / `test` a přidává vlastní
(zejména bezpečnostní) testy — viz sekce _Testing_ v každém plánu.

### Klíčové korekce oproti auditu (zjištěné při ukotvení v kódu)

- `withPathLock` **existuje a už se používá** (`shared/file-storage/file-lock.ts`, volané mj.
  v `task-scheduler.service.ts`) — audit ho označil za "nepoužitý". Reálný problém je jeho
  **nereentrance** (deadlock při vnořeném zámku na stejném klíči) → fáze 123 to řeší přes
  `AsyncLocalStorage`.
- Approval-hook denylist žije v `runner/claude-approval-hook.mjs` (ne v
  `claude-run-command.service.ts` — tam je jen text kontraktu) → upřesněno ve fázi 125.
- Untrusted-data obálka **už existuje** (`channels/sanitize.ts` `envelopeInbound`, s vlastním
  injection test-suite) — používá ji jen triager. Fáze 124 ji **zobecňuje**, nevymýšlí novou.
- `approvals.decide()` TOCTOU se opravuje `withPathLock` → sekvenčně **za** fází 123.
- Sourozenecké nálezy nalezené navíc a flagované ve fázích: `memory/entity-mcp.controller.ts`
  má stejnou chybějící-auth díru jako chat MCP (fáze 127 follow-up); `self.service.ts`
  duplikuje git-exec setup (fáze 125 pokrývá sdílením).

---

## Plánované fáze (P2 dluh + P3 průběžně) — pojmenované, zatím nerozpracované

Tyto pokrývají zbytek `report-final.md` (High/Medium/Low mimo bezpečnostní jádro). Nejsou
ztracené — každou lze rozpracovat stejným postupem (subagent přečte relevantní batch +
zdroj, napíše detailní `phase-NNN` plán). Pořadí = P2 před P3.

| Fáze | Téma | Audit-odkaz | Effort |
|---|---|---|---|
| **128** | Extrakce `ClaudeCliRunner` base (spawn + timeout + **stdout buffer-cap** + envelope-unwrap + fence-parse) — nahradí 8 zkopírovaných variant | systémové #5, cross-cutting rec #3 | M |
| **129** | Zpřísnit `libs/contracts` schémata: bounds na user-input (`paths`/`toolGrants`/`text`), enum `command.model`, XOR `Integration` refine, sdílené `DeleteResponse`/`RunArtifact`/`PrSummary`/`EmptyBody`, pathParams 404 místo 400; koordinovat s `entity-id-refactor.md` (branded ID) | Contracts sekce, cross-cutting rec #2 | M |
| **130** | Rozdělit obří soubory: API `runner-core` (1244), `pipeline-runner` (1955), `task-scheduler` (1341), `goal-runner` (1202); web `RunDetail` (858), `ChatScreen` (748), `CommandLine` (1099), `ProfileScreen` (685), `sceneController` (1006) | WEB High, P2 #12 | L |
| **131** | `list()`-then-`find()` → by-id lookup + retention sweepy (task-runs, pipeline-runs, goals, companies/projects, chains, budget ledger); `avatarAssets.inlineSync` mimo hot path | Medium/Low systémové, P2 #13 | M |
| **132** | Povýšit DS primitivy z `apps/web` (HudCard/HudPanel/Collection/EmptyState/dialogy + boot-splash + SkipLink) + zavést sdílené web hooky (`useLatestRef`/`usePersistedState`/`useKeyboardShortcut`/`useHoverPopover`/`useAnchoredPosition`) + `toIconName` guard + **zod validace SSE/`JSON.parse` payloadů**; `PipelineCanvas` O(n²)/frame fix | WEB High + cross-cutting, P2 #14 | L |
| **133** | Bezpečnostní test-coverage díry: triager (crafted verdict), machine open-url guard, mandate/policy floor, gate harden-only, approvals concurrency, file-utils path containment, `GlobalSearch/useGlobalSearch` | P3 #15 | M |
| **134** | Mrtvý kód: `TaskAttachments.tsx`, `chains/useStartChainMutation`, `memory/filterGraphByProject`, settings "caffeinate" toggle | P3 #16 | S |

---

## Pokrytí auditu

- **Všechny 4 potvrzené Critical** → fáze 121 (secrets leak), 122 (gate bypass), 123
  (scheduler double-PR + budget cap race).
- **Všech 5 cross-cutting systémových problémů** → 121 (secrets), 122+123 (gate+lost-update),
  124 (prompt-injection), 126+128 (watcher re-entrancy + CLI-runner duplicita).
- **P0 + P1** kompletně rozpracované (121–127). **P2 + P3** pojmenované (128–134).
- Nezůstal nepokrytý žádný Critical/High z `report-final.md`.

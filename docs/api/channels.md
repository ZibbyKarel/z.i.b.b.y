# Kanály & autonomie

## Co jsou kanály

Kanály jsou příchozí komunikační kanály sledované ZIBBY na heartbeatu.
Podporované typy: email (IMAP), Slack, Jira, GitHub, Google Calendar.

Inbound obsah je vždy **data** — nikdy příkazy. Nemůže zvyšovat oprávnění ani obcházet gate.

## ChannelWatcherService

**Soubor:** `apps/api/src/channels/channel-watcher.service.ts`

Heartbeat: každých `CHANNEL_TICK_MS` ms (výchozí 30 000; `0` nebo záporné = disabled, pro testy).

### Jeden tick

Pro každou enabled integraci s credentials:

1. `adapter.poll(integration, credentials, cursor)` → nové položky
2. Sanitizace příchozího textu (`sanitizeInbound`)
3. Persist nových položek do `ChannelItemStore` (stav `new`)
4. Aktualizuj cursor (offset posledního zpracovaného) — **po** persistenci, ne před (crash-safety: re-poll je bezpečný díky dedup-by-id)
5. Předej každou novou položku `ChannelTriageFlowService.handle()` (pokud je bound)
6. Zapiš `channel-item` do activity logu

### Per-integration izolace

Každá integrace má vlastní try/catch — selhání jednoho emailu nezastaví Slack polling.
Chyba se zapíše do `integration.lastError` a pokračuje se dál.

## AdapterRegistry

**Soubor:** `apps/api/src/channels/adapters/adapter-registry.ts`

Mapuje `integration.type` → konkrétní adapter implementaci.

### Email adapter (IMAP)

- Knihovna: `imapflow`
- Poll: IMAP FETCH zpráv s UID > cursor (`${cursor+1}:*`), strop **50 zpráv / poll**
  (`MAX_MESSAGES_PER_POLL`) — backlog se odčerpává po dávkách, cursor roste monotónně.
- Cursor = UID posledního zpracovaného emailu
- **Initial sync = „od teď"**: při prvním enable (žádný cursor) adapter NEodčerpá celou
  historii — jen najde nejvyšší existující UID (`*`) a nastaví na něj cursor, **0 položek**.
  Zpracovávají se tedy jen e-maily doručené PO připojení integrace. (Bez tohoto by prázdný
  cursor znamenal rozsah `1:*` = celá schránka přes triage — runaway.)
- Vrátí `ChannelItem[]` s `from`, `subject`, `text` (stripped)

### Slack adapter

- Poll: Slack API Conversations History od cursor (timestamp)
- Cursor = `ts` posledního zpracovaného messages
- Vrátí `ChannelItem[]` s `user`, `text`, `channel`

### Jira adapter

- Poll: REST `search` (JQL `project = KEY` + `updated >= cursor`), Basic auth `email:apiToken`
- Cursor = nejnovější `updated`; id = `jira-<KEY>`, `externalRef.messageId` = issue key
- Send: přidá komentář na issue (`/rest/api/3/issue/{key}/comment`)
- **Create (finished-day "creates a Jira task"):** `createIssue` (POST `/rest/api/3/issue`) je
  vždy za schválením — floor `jira.create_issue → ask` + `JiraIssueFlowService` (ResumableRunner):
  `propose` zaparkuje approval `jira-issue`, vytvoření proběhne až na `resume` (approve).
  Endpoint `POST /api/channels/integrations/:id/jira-issue` → `202 {approvalId}`.

### GitHub adapter

- Poll: `/repos/{owner}/{name}/issues?since=cursor` (issues + PRs; `pull_request` je rozliší), `streams` filtr
- Cursor = nejnovější `updated_at`; id = `gh-<repo>-<issue|pr>-<n>`, `externalRef.messageId` = číslo
- Send: komentář (`/repos/{repo}/issues/{n}/comments`)

### Google Calendar adapter

- Auth: **service account** — SA JSON klíč (jediný `token` credential) podepíše krátkodobý
  RS256 JWT, vyměněný na `oauth2.googleapis.com/token` za access token (žádný client secret,
  refresh token neexpiruje → vhodné pro heartbeat). Operator nasdílí kalendář s e-mailem SA
  (pro osobní kalendář není potřeba domain-wide delegation).
- Poll: `GET /calendar/v3/calendars/{calendarId}/events` s `timeMin=now`..`timeMax=now+lookaheadDays`,
  `singleEvents=true&orderBy=startTime`; inkrementálně přes `updatedMin=cursor` (`syncToken` je
  s filtry nekompatibilní). Zrušené události (`status=cancelled`) se přeskakují.
- Cursor = nejnovější `updated`; id = `gcal-<eventId>`, `externalRef.messageId` = event id.
- **Read-only:** `send` vyhazuje (kalendářové položky jsou notifikace, ne reply surface).
- Config (`CalendarConfig`): `calendarId` (default `primary`), `lookaheadDays` (default 14).

## ChannelItemStore

**Soubor:** `apps/api/src/channels/channel-item.store.ts`

Persistentní stav každé příchozí položky:

```typescript
type ChannelItemState =
  | "new" // čerstvě přijato, čeká na triage
  | "triaged" // klasifikováno
  | "handled" // akce proběhla
  | "ignored" // záměrně přeskočeno
  | "approval-pending" // draft odpovědi čeká na schválení
  | "replied"; // odpověď odeslána
```

Uloženo v `apps/api/data/channels/<integrationId>-<itemId>.json`.

## ChannelTriageFlowService

**Soubor:** `apps/api/src/channels/channel-triage-flow.service.ts`

Implementuje `ChannelTriageFlow` interface:

### `handle(item)`

1. Klasifikuje položku (actionable / informational / spam / question)
2. Určí autonomii tier podle `MandateService`:
   - **Tier 1** — tiché zpracování (analýza, uložení do paměti)
   - **Tier 2** — zpracování + report (odpověď na rutinní otázku, PR, post)
   - **Tier 3** — sestavit + čekat (odpovědi kde si není jistý, vše co zavazuje operátora)
3. Dispatch příslušné akce
4. Zapiš do activity logu (`channel-triage`)

### Email = notify-only (žádná autonomní akce)

Inbound e-mail je **notify-only** (`NOTIFY_ONLY_KINDS`): ZIBBY pro něj NIKDY nedispatchuje
běh, nezakládá Jira issue ani neodpovídá. Místo toho jen rozhodne, zda položka potřebuje
operátora (odpověď nebo rozhodnutí), a pokud ano, **vyplave** jako jednořádkové summary na
přehledu („Vyžaduje vaši pozornost") s odkazem na originál v Gmailu. Schránka je firehose —
gate patří člověku (autonomy contract: surface and wait).

- **Relevantní** (`actionable` && kategorie ≠ `other`) → stav `triaged`, bez approvalu,
  s `triage.summary` pro kartu na přehledu.
- **Bulk/transakční** (newslettery, účtenky, doručenky, login alerts → triager je značí
  `actionable:false` / `other`) → stav `ignored`, ticho.
- **Degraded triage** (LLM router spadl, např. OVERQUOTA → jen keyword fallback) → položka
  vyplave VŽDY (fail-safe: viditelná „možná nepodstatná" je lepší než tiše ztracená).

Summary + relevance dělá Haiku triager (`claude-cli-triager.ts`); `TriageService.triageDetailed`
vrací i příznak `degraded`. Slack/Jira/GitHub si ponechávají chování act-by-tier.

**Dismiss:** operátor vyřídí vyplavené summary přes
`POST /api/channels/items/:id/dismiss` → `triaged` → `ignored` (jediný klientský zápis;
nemůže zfalšovat verdikt, jen retirovat vyplavenou položku).

**Atribuce k projektu:** položka se přiřadí k projektu podle uloženého
`integration.projectId` (autoritativní vlastník); textová/jménová heuristika
`matchProject` je už jen fallback pro integrace bez uloženého projektu. `projectId`
jede do `createTask` jako server-odvozený štítek (nikdy autorizace — Law 4).

### `sweepOutcomes()`

Projde položky se stavem `handled` které mají `taskId` → zkopíruje terminal outcome z tasku.

## Mandate systém

**Soubor:** `apps/api/src/mandate/mandate.storage.service.ts`

`Mandate` definuje scope autonomie operátora — jaké akce smí ZIBBY dělat autonomně na jakém kanálu:

```
GET /api/mandate      načti aktuální mandate
PUT /api/mandate      aktualizuj mandate
```

Mandate obsahuje per-channel tier pravidla. `ChannelTriageFlowService` se před každou akcí ptá `MandateService.tierFor(channel, action)`.

## Integrace (credentials)

**Soubory:**

- `integrations/integrations.storage.service.ts` — konfigurace (bez secrets)
- `integrations/credentials.store.ts` — API klíče a tokeny (oddělené od configs)
- `integrations/connection-tester.ts` — ověření připojení

**Vlastnictví projektem (jeden projekt = jedna firma):** každá integrace nese povinné
`projectId` (FK na projekt). Integrace se spravují na detailu projektu — samostatná
stránka Integrace neexistuje. `createIntegration`/`updateIntegration` ověří, že projekt
existuje (jinak `422`). `id` integrace se nikdy nepřejmenovává (klíčuje credentials,
`channels/<id>/` položky i cursor); `projectId` se měnit smí (přeřazení integrace).

```
GET    /api/integrations              seznam (volitelně ?projectId=<id> pro filtr na projekt)
POST   /api/integrations              vytvoření (body.projectId povinné; neznámý projekt → 422)
GET    /api/integrations/:id          detail
PATCH  /api/integrations/:id          aktualizace (name/enabled/config/projectId; kind immutable)
DELETE /api/integrations/:id          smazání (kaskáduje credentials)
PUT    /api/integrations/:id/credentials   zápis secretu (write-only)
POST   /api/integrations/:id/test     otestuj připojení
```

Credentials jsou uloženy odděleně v `data/credentials/` (nikdy v `data/integrations/`).
Tvar secretu podle kindu (`credentialMatchesKind`): email → `{password}`, ostatní → `{token}`
(Slack bot token, Jira/GitHub API token, Calendar = celý service-account JSON klíč jako `token`).

## Sanitizace

`sanitizeInbound(text)` z `channels/sanitize.ts`:

- Odstraní potenciálně škodlivý obsah (prompt injection pokusy)
- Ořízne délku
- Normalizuje whitespace
- Inbound text je vždy data; po sanitizaci teprve jde do triage

## Activity záznamy

| Event              | Kdy                                |
| ------------------ | ---------------------------------- |
| `channel-item`     | Nová položka přijata               |
| `channel-triage`   | Položka klasifikována a tier určen |
| `channel-reply`    | Draft odpovědi připraven           |
| `channel-approval` | Schválení odpovědi (Tier 3)        |
| `channel-ignored`  | Položka záměrně přeskočena         |
| `channel-needs-attention` | Notify-only položka vyplavena operátorovi (email) |

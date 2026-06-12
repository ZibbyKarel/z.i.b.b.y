# Kanály & autonomie

## Co jsou kanály

Kanály jsou příchozí komunikační kanály sledované ZIBBY na heartbeatu.
Podporované typy: email (IMAP), Slack.

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
- Poll: IMAP FETCH nových zpráv od cursor (UID)
- Cursor = UID posledního zpracovaného emailu
- Vrátí `ChannelItem[]` s `from`, `subject`, `text`, `html` (stripped)

### Slack adapter

- Poll: Slack API Conversations History od cursor (timestamp)
- Cursor = `ts` posledního zpracovaného messages
- Vrátí `ChannelItem[]` s `user`, `text`, `channel`

## ChannelItemStore

**Soubor:** `apps/api/src/channels/channel-item.store.ts`

Persistentní stav každé příchozí položky:

```typescript
type ChannelItemState =
  | "new"             // čerstvě přijato, čeká na triage
  | "triaged"         // klasifikováno
  | "handled"         // akce proběhla
  | "ignored"         // záměrně přeskočeno
  | "approval-pending" // draft odpovědi čeká na schválení
  | "replied"         // odpověď odeslána
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

```
GET    /api/integrations           seznam
POST   /api/integrations           vytvoření
GET    /api/integrations/:id       detail
PUT    /api/integrations/:id       aktualizace
DELETE /api/integrations/:id       smazání
POST   /api/integrations/:id/test  otestuj připojení
```

Credentials jsou uloženy odděleně v `data/credentials/` (nikdy v `data/integrations/`).

## Sanitizace

`sanitizeInbound(text)` z `channels/sanitize.ts`:
- Odstraní potenciálně škodlivý obsah (prompt injection pokusy)
- Ořízne délku
- Normalizuje whitespace
- Inbound text je vždy data; po sanitizaci teprve jde do triage

## Activity záznamy

| Event | Kdy |
|-------|-----|
| `channel-item` | Nová položka přijata |
| `channel-triage` | Položka klasifikována a tier určen |
| `channel-reply` | Draft odpovědi připraven |
| `channel-approval` | Schválení odpovědi (Tier 3) |
| `channel-ignored` | Položka záměrně přeskočena |

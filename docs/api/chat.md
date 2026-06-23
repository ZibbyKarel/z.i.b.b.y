# API — Chat (chat-first konverzace)

Konverzační vrstva ZIBBYHO — nahrazuje původní Voice UI. Operátor si píše s ZIBBYM
v jednom průběžném vlákně; jeden `claude` turn s tool-use rozhodne, jestli
**odpovědět / doptat se / jednat**. Z konverzace přirozeně padají úkoly.

**Modul:** `apps/api/src/chat/` · **Contract:** `libs/contracts/src/chat/`
**Design spec:** `docs/superpowers/specs/2026-06-23-chat-ui-design.md`

## Endpointy

| Metoda | Cesta | Popis |
| ------ | ----- | ----- |
| `POST` | `/api/chat/messages` | Přidá operátorův turn a spustí streaming odpověď. Body `{ conversationId?, text }` → `{ conversationId, turnId }` (vrací hned; tokeny jdou přes SSE). |
| `GET`  | `/api/chat/transcript?conversationId=` | Čistý read přepisu konverzace (`{ conversationId, sessionId, messages }`). Bez `conversationId` → aktivní vlákno. |
| `GET`  | `/api/chat/stream?conversationId=` | **SSE** (raw `@Sse()`, mimo ts-rest) — živé tokeny. Každý `data` je JSON `ChatTurnEvent`. |
| `POST`/`GET` | `/api/chat/mcp` | In-process **MCP server** (Streamable HTTP) s nástroji ZIBBYHO. Volá ho spawnnutý `claude`, ne frontend. |

### `ChatTurnEvent` (SSE payload)

```ts
{ conversationId, turnId, type: "delta", text }   // token vizuálního textu
{ conversationId, turnId, type: "tool", tool }     // oznámení dispatch (ChatToolEvent)
{ conversationId, turnId, type: "done", text }     // turn dokončen, finální text
{ conversationId, turnId, type: "error", message } // turn selhal
```

## Engine (`chat-session.service.ts`)

Jeden turn = jeden spawn `claude` CLI (žádný API klíč, běží na Max předplatném).
Ověřený recept (spike, viz spec §7):

```
claude -p <msg> [--resume <sid>] \
  --setting-sources "" --append-system-prompt <persona> \
  --output-format stream-json --include-partial-messages --verbose \
  --model sonnet --permission-mode dontAsk \
  --mcp-config {zibby:{type:http,url:.../api/chat/mcp}} --allowedTools mcp__zibby__*
```

- **Token streaming** vyžaduje `--include-partial-messages` (jinak přijdou celé bloky).
  Parser (`chat-stream-parser.ts`, čistý) přeposílá jen `text_delta`.
- **Kontinuita:** `--resume <sessionId>` drží kontext; session id se persistuje per
  konverzace a obnovuje každý turn (server je stateless per turn).
- **Izolace:** `--setting-sources ""` nenačte žádné user/project/local settings →
  globální hooky/pluginy (které by injektovaly cizí kontext) nevyskočí, ale auth
  (keychain) zůstává. (`CLAUDE_CONFIG_DIR` auth rozbíjí — nepoužívat.)
- Model přepsatelný přes `ZIBBY_CHAT_MODEL` (výchozí `sonnet`).

## Nástroje (`chat-tools.service.ts` + `chat-mcp.controller.ts`)

MCP server hostovaný přímo v api (`@modelcontextprotocol/sdk`, Streamable HTTP,
stateless), takže služby jsou injektované — žádný druhý proces. Server id `zibby`:

| Nástroj | Volá | Efekt |
| ------- | ---- | ----- |
| `create_task` | `TaskSchedulerService.createTask` | Klasifikuje + spustí úkol (dispatch). Výstupy běhu dál hlídá gate vrstva. |
| `recall_memory` | `VaultService.search` | Index-first hledání ve vaultu. |
| `get_status` | `BriefingService.assemble` | Shrnutí "co se děje" (read-only). |

**Dispatch je prompt-governed** (persona v `chat-persona.ts`), ne vynucený — stejná
vrstva, kde žil starý voice bug ("jak se máš" → spustil úkol). Hlídá to opt-in eval
`chat-dispatch.eval.test.ts` (`CHAT_EVAL=1`, potřebuje živou api + tokeny).

## Persistence + paměť

- **Přepis:** append-only JSONL `data/chat/<conversationId>.jsonl` (jedna `ChatMessage`
  na řádek) + sidecar `<id>.meta.json` se session id + `active.json` (ukazatel na
  aktivní vlákno). `CHAT_DIR` env override.
- **Destilace:** nightly `MemoryDistillerService` sweepuje i konverzace —
  **inkrementálně** (vlákno je dlouhožijící): destiluje jen zprávy za markerem
  `<id>.distilled.json` (počet zpráv) a kurzor posune. Důležité fakty putují do
  vault markdownu jako u běhů.

## MVP rozsah

Jedno průběžné vlákno. Odbočky/podvlákna jsou odložený increment (spec §2).

# Agenti & Runy

## Agent — definice

Agent je Markdown soubor s YAML frontmatter v `apps/api/data/agents/<id>.md`.

### Frontmatter pole

```yaml
id: kodér                       # filesystem-safe identifikátor
name: Kodér                     # zobrazovaný název
description: |                  # popis pro klasifikátor úloh
  Implementuje funkce podle specifikace.
glyph: "💻"                     # emoji ikona (volitelné)
model: opus                     # opus | sonnet | haiku
thinking: high                  # high | medium | low  (extended thinking)
tools:                          # povolené nástroje claude CLI
  - bash
  - edit
  - read
risk: medium                    # low | medium | high (display hint)
gates:                          # vlastní gate pravidla (inline)
  - match:
      - type: action
        action: git.push
    decision: ask
    resolve:
      type: human
gateRuleIds:                    # reference na globální katalog
  - push-to-main
```

Tělo `.md` souboru je systémový prompt předaný claude CLI.

### CRUD API

```
GET    /api/agents              seznam všech agentů
POST   /api/agents              vytvoření agenta
GET    /api/agents/:id          detail agenta
PUT    /api/agents/:id          aktualizace agenta
DELETE /api/agents/:id          smazání agenta
GET    /api/agents/search?q=    full-text search (id / name / description / kategorie)
GET    /api/agents/categories   seznam kategorií
```

## Agent Run — spouštění

### Vytvoření runu

```
POST /api/agents/:id/runs
Body: {
  prompt: string       # popis úlohy pro agenta
  project?: string     # ID projektu (pro worktree + kontext)
  files?: string[]     # soubory předané agentovi
  title?: string       # volitelný název runu
}
```

### Run lifecycle

```
running → done
       → error
       → interrupted     (kill / crash / restart reconciliation)
       → awaiting-approval  (gate zastavil run, čeká na schválení)
```

### Polling a streaming logů

```
GET /api/agents/:id/runs/:runId              stav runu (status, pct, logFile)
GET /api/agents/:id/runs/:runId/log?offset=  chunk logu od offsetu (bytes)
```

Klient čte log po chunkcích opakovanými GET requesty s `?offset=nextOffset`
dokud `done: true` v odpovědi. Žádný WebSocket, žádný SSE — pull model.

## RunnerCore — spawn engine

**Soubor:** `apps/api/src/runner/runner-core.ts` (36.8 KB)

`RunnerCore` je universal spawn engine sdílený agenty, skills a pipeline stagemi.

### Co RunnerCore dělá

1. Vytvoří sandbox adresář (`cwd`) pro run
2. Spustí `child_process.spawn(command, args, { cwd: spawnCwd ?? cwd })`
3. Streamuje stdout/stderr do log souboru
4. Zapíše sidecar JSON (`sidecar.json`) — runId, pid, pgid, status, startedAt, cwd, workspace
5. Parsuje log pro `PROGRESS <n>` řádky → `pct` (0–100)
6. Parsuje intent markery (záměry agenta před každou akcí)
7. Při ukončení procesu aktualizuje sidecar status (done / error / interrupted)

### KindStrategy

Každý druh runu implementuje `KindStrategy<R extends BaseRun>`:

```typescript
interface KindStrategy<R extends BaseRun> {
  assemble(base: BaseRun, spec: RunSpec): R   // sestaví sidecar z base + extra polí
  schema: ZodType<R, unknown>                  // validuje sidecar při restart reconciliation
}
```

Druhy: `"agent"` | `"skill"` | `"pipeline-stage"`

### spawnCwd vs. cwd

- `cwd` — sandbox adresář runu; sem jde log soubor, sidecar, intent koordinace
- `spawnCwd` — adresář kde se process skutečně spustí (pro project-targeted runy: checkout projektu, aby se načetl jeho `CLAUDE.md` a `.claude/` kontext)

### Restart reconciliation

Při startu API (`OnApplicationBootstrap`) `RunnerCore.init()` prochází všechny sidecar soubory.
Runy se statusem `running` ale mrtvým PID → přejdou na `interrupted`.
Tím je restart API bezpečný i uprostřed spuštěného runu.

### Git worktree integrace

Pro project-targeted runy se vytvoří git worktree:
- Branch: `zibby/<runId>-<slug>`
- Namespace `apps/api/src/workspace/` spravuje lifecycle (create / cleanup)

## AgentRunnerService

**Soubor:** `apps/api/src/agents/agent-runner.service.ts` (19.5 KB)

Tenký wrapper nad `RunnerCore` pro agent druhy runů:

1. Načte agent definici z disku
2. Sestaví `claude` příkaz s args (model, thinking, tools, system prompt, dontAsk flags)
3. Aplikuje gate pravidla agenta přes `GateEvaluatorService`
4. Zavolá `RunnerCore.spawn(spec)`
5. Vystavuje `listRuns`, `getRun`, `getLogChunk`, `killRun`

## ClaudeRunCommandService

Sestavuje příkazovou řádku pro `claude` CLI:

```bash
claude -p "<prompt>" \
  --model claude-opus-4-8 \
  --thinking high \
  --allowedTools bash,edit,read \
  --system-prompt "<agent body>" \
  --agents "<catalog>" \
  --dontAsk \
  --append-system-prompt "<grounding context>"
```

Flags jsou řešeny typově — `dontAsk` + `--agents catalog` + `--append-system-prompt`
(ověřeno spike testem, viz `project_claude_runner_flags.md`).

### Limity argv (spawn E2BIG)

`--agents` i `--append-system-prompt` jdou na argv, jehož celková velikost
(argv + env) je omezená OS limitem (`ARG_MAX`). Dvě pojistky drží runy pod ním:

- **Kurátorovaný katalog.** Do `--agents` se neserializuje celá knihovna agentů
  (ZIBBY jich má 160+ jako seed — to samo přeteče `ARG_MAX` → `spawn E2BIG`).
  `buildCatalog` vybírá relevantní podmnožinu: `delegates` od volajícího (pipeline
  posílá agenty svých fází) + operační jádro ZIBBY (`CORE_DELEGATE_IDS`), deduplikované
  a omezené na `MAX_CATALOG_AGENTS` (16). Malá knihovna (≤ cap, bez `delegates`)
  projde beze změny. `--allowedTools` se tím zúží na tools této podmnožiny (správně —
  na vypuštěného agenta stejně nejde delegovat).
- **System prompt do souboru.** Když runner dostane `systemPromptDir` (sandbox cwd),
  složený system prompt se zapíše do `<sandbox>/.zibby-system-prompt.md` a předá se
  přes `--append-system-prompt-file` místo inline `--append-system-prompt`. Soubor
  přežije v sandboxu, takže approval→resume (přehrání stejných args) ho stále najde.

## Orchestrator agent

Syntetický fallback agent — nemá uloženou definici v `data/agents/`.
Použije se jako cíl routingu když žádný konkrétní agent nevyhovuje klasifikaci.
Spouští se přímo jako `claude` CLI s obecnými instrukcemi.

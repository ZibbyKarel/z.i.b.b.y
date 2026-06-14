# Prostředí a konfigurace

## Proměnné prostředí (API)

| Proměnná | Výchozí | Popis |
|----------|---------|-------|
| `PORT` | `3333` | Port na kterém API naslouchá |
| `LOG_LEVEL` | `info` | Úroveň logování: `debug` / `info` / `warn` / `error` |
| `CORS_ORIGIN` | `http://localhost:3000` | Povolené origins (comma-separated pro více) |
| `ZIBBY_DATA_DIR` | `apps/api/data` | Root adresář pro všechna runtime data |
| `VAULT_DIR` | `$ZIBBY_DATA_DIR/vault` | Cesta k Obsidian vault (memory) |
| `ZIBBY_BACKUP_DIR` | — | Cíl zálohy (rsync destination) — jen pro backup script |
| `CHANNEL_TICK_MS` | `30000` | Interval heartbeatu pro channel watcher (0 = disabled) |
| `TASK_TICK_MS` | `60000` | Interval task scheduler ticku (0 = disabled pro testy) |
| `AUTOMATION_TICK_MS` | `60000` | Interval automations scheduler ticku (0 = disabled) |
| `AGENT_RUNNER_MODE` | `claude` | `claude` = reálný `claude -p`; `demo` = deterministický stand-in (testy/CI). Patří do **untracked** `.env`, ne do `.env.example` (tam `demo`) |
| `CLAUDE_BIN` | `claude` | Cesta k `claude` binárce — test seam (fake binárka v e2e) |
| `ZIBBY_WORKTREE_ROOT` | `$TMPDIR/zibby-worktrees` | **Phase 12.7** — root pro run worktrees, **mimo** repo/data strom. NEodvozuje se z `ZIBBY_DATA_DIR` (záměrně) |
| `GOAL_VERIFY_TIMEOUT_MS` | `600000` (10 min) | **Phase 12.3** — wall-clock deadline pro deterministický `checks` verifier shell (pak SIGTERM→SIGKILL) |
| `GOAL_AUTO_RESUME` | _unset_ | **Phase 12.4** — `1` = na bootu auto-re-drive `running`/`paused-limit` goalů (jen headless launchd démon). Default: rehydrace + park `awaiting-resume` (Law 3) |

Načítání přes `@nestjs/config` (ConfigModule.forRoot, isGlobal: true).

## .env soubor

`apps/api/.env` nebo kořenový `.env` (oba podporovány přes NestJS ConfigModule).

```bash
# Příklad .env pro lokální vývoj
PORT=3333
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
ZIBBY_DATA_DIR=apps/api/data
```

`.env` je v `.gitignore` — nikdy se necommituje.

## Datové adresáře

### Výchozí (`apps/api/data/`)

Používá se při `pnpm api:dev` a `pnpm api:start`.

### Testovací (`apps/api/data-test/`)

Přepnutí: `ZIBBY_DATA_DIR=apps/api/data-test`

Příkazy:
```bash
pnpm api:dev:test        # dev server s testovacími daty
pnpm api:start:test      # production server s testovacími daty
pnpm seed:test           # seed testovacích dat
```

Playwright e2e testy startují druhý API server na jiném portu s testovacími daty
(viz `project_playwright_fast_refresh_loop.md`).

## Monorepo scripts (package.json root)

```bash
# Vývoj
pnpm web:dev             # Next.js → http://localhost:3000
pnpm api:dev             # NestJS (LOG_LEVEL=debug) → http://localhost:3333
pnpm api:dev:test        # NestJS s data-test/
pnpm storybook           # Storybook → http://localhost:6006

# Build
pnpm web:build           # Next.js production build
pnpm web:start           # Spuštění production buildu
pnpm api:start           # NestJS production build

# Testy
pnpm test                # všechny vitest projekty
pnpm web:test            # jen web vitest projekt (jsdom)
pnpm api:test            # jen api vitest projekt
pnpm e2e                 # Playwright E2E

# Qualita kódu
pnpm lint                # ESLint --fix (slouží jako formatter)
pnpm typecheck           # tsc --noEmit pro tsconfig.base + apps/web/tsconfig
                         # POZOR: rtk pnpm typecheck maskuje chyby — vždy volit přímé tsc

# Utility
pnpm seed                # seed data/
pnpm seed:test           # seed data-test/
pnpm api:smoke           # Claude smoke test
pnpm e2e:report          # Playwright HTML report
```

## Testovací environment

### Vitest projects (vitest.workspace.ts)

```typescript
export default defineWorkspace([
  { project: "api",  ... },  // apps/api unit testy
  { project: "web",  ... },  // apps/web component testy (jsdom)
])
```

Poznámka: `apps/web` není v workspace pro globální `pnpm test` — nutno volit `pnpm web:test`.

### Playwright (playwright.config.ts)

- Chromium + Firefox + WebKit
- Testovací API server na separátním portu s `ZIBBY_DATA_DIR=apps/api/data-test`
- `TASK_TICK_MS=0` pro deterministické testy (tick drivenmanually)
- `.playwright-mcp/` output adresář je gitignored (rozbil by Next.js Fast Refresh)

## TypeScript path aliases

Definovány v `tsconfig.base.json`, používány všude v monorepu:

```json
{
  "paths": {
    "@zibby/contracts":       ["libs/contracts/src/index.ts"],
    "@zibby/contracts/*":     ["libs/contracts/src/*"],
    "@zibby/design-system":   ["libs/design-system/src/index.ts"],
    "@zibby/design-system/*": ["libs/design-system/src/*"],
    "@zibby/forms":           ["libs/forms/src/index.ts"],
    "@zibby/forms/*":         ["libs/forms/src/*"]
  }
}
```

## NX konfigurace (nx.json)

4 projekty: `design-system`, `contracts`, `web`, `api`

- Caching: build, test, lint výstupy jsou cachovány
- Named inputs: `default` (všechny soubory), `production` (bez testů)
- Affected: NX detekuje změny a spouští jen ovlivněné projekty

## Playwright MCP výstup

`.playwright-mcp/` — screenshots a trace výstupy z Playwright MCP tool.
Musí být mimo sledovaný strom Next.js dev serveru (jinak Fast Refresh smyčka).
Je gitignored.

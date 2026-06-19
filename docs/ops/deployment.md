# Deployment

## launchd — API service (macOS)

**Soubor:** `ops/com.zibby.api.plist`

API běží jako macOS launchd daemon — automatický start při loginu, automatický restart po crash.

### Instalace

1. Zkopíruj plist a vyplň strojové hodnoty (označeny `⟨…⟩`):

   ```xml
   <key>ProgramArguments</key>
   <array>
     <string>⟨/opt/homebrew/bin/pnpm⟩</string>  <!-- which pnpm -->
     <string>api:start</string>
   </array>
   <key>WorkingDirectory</key>
   <string>⟨/Users/ty/Workspace/z.i.b.b.y⟩</string>
   <key>PATH</key>
   <string>⟨/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin⟩</string>
   ```

2. Zkopíruj do LaunchAgents:

   ```bash
   cp ops/com.zibby.api.plist ~/Library/LaunchAgents/
   ```

3. Bootstrap (načti a spusť):
   ```bash
   launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.api.plist
   ```

### Správa

```bash
# Restart
launchctl kickstart -k gui/$UID/com.zibby.api

# Stop
launchctl bootout gui/$UID/com.zibby.api

# Status
launchctl list com.zibby.api

# Reinstalace (po změně plistu)
launchctl bootout gui/$UID/com.zibby.api
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.api.plist
```

### Konfigurace v plistu

| Klíč                  | Hodnota                 | Popis                                                                                                         |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `RunAtLoad`           | `true`                  | Spustí se automaticky po boostrapping                                                                         |
| `KeepAlive`           | `true`                  | Restartuje po crash                                                                                           |
| `ThrottleInterval`    | `10`                    | 10s backoff mezi restarty                                                                                     |
| `PORT`                | `3333`                  | API port                                                                                                      |
| `LOG_LEVEL`           | `info`                  | Úroveň logování                                                                                               |
| `CORS_ORIGIN`         | `http://localhost:3000` | Povolená origin                                                                                               |
| `GOAL_AUTO_RESUME`    | `1`                     | **Phase 13.3** — na restartu démon re-drivuje `running`/`paused-limit` goaly (Phase 12.4 gate). Jen v démonu! |
| `ZIBBY_WORKTREE_ROOT` | `⟨~/.zibby/worktrees⟩`  | **Phase 12.7** — worktrees mimo repo/data strom                                                               |

### Goal auto-resume — unattended builder (Phase 13.3)

Instalace tohoto démonu **JE** operátorův explicitní opt-in do bezobslužného provozu, takže
`GOAL_AUTO_RESUME=1` v plistu je legitimní (jediné místo, kde auto-resume patří — Phase 12.4
ho jinak gateuje za Tier 3). Sémantika restartu:

| `GOAL_AUTO_RESUME`   | Chování po restartu (`reconstruct()`)                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `1` (démon)          | rehydratuje registr **a** re-drivuje `running`/`paused-limit` goaly (continuation, ne restart — Phase 9.3/12.4) |
| unset (attended dev) | rehydratuje registr, ale live goaly zaparkuje `awaiting-resume` — čeká na operátora (Law 3)                     |

**Self-development:** pokud démon má pohánět loop proti **vlastnímu** repu, řiď se
[`self-development.md`](./self-development.md) — builder ≠ subject (subject = čerstvý sibling
checkout jako projekt; worktrees v `ZIBBY_WORKTREE_ROOT` mimo builderův strom). Démon běží
přes `api:start` (`serve` = `ts-node` bez `--respawn`), takže edit-respawn smyčka odpadá.

### Logy

```
~/Library/Logs/zibby/api.out.log   # stdout
~/Library/Logs/zibby/api.err.log   # stderr
```

Rotovány dle `ops/zibby.newsyslog.conf`.

## Backup service

**Soubor:** `ops/com.zibby.backup.plist`

Spouští `apps/api/scripts/backup.sh` každý den ve 3:30.

### Backup script (`apps/api/scripts/backup.sh`)

1. **Git commit vault** — vault poznámky jsou verzovány git commitem (bez push — Zákon 3)
2. **Rsync runtime data** — rsync do `ZIBBY_BACKUP_DIR` s rotujícími složkami po dnech týdne
3. **Credentials** — vyloučeny výchozím nastavením; `--include-credentials` opt-in

### Rsync strategie

Rotace 7 adresářů pojmenovaných po dni týdne (mon, tue, wed, ...) — každý obsahuje kompletní snapshot.

```bash
rsync -a --delete \
  --exclude=credentials/ \    # výchozí ochrana
  $ZIBBY_DATA_DIR/ \
  $ZIBBY_BACKUP_DIR/$(date +%a)/   # np. /backup/mon/
```

### Instalace backup service

```bash
cp ops/com.zibby.backup.plist ~/Library/LaunchAgents/
# Vyplň strojové hodnoty (WorkingDirectory, ProgramArguments, ZIBBY_BACKUP_DIR)
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.backup.plist
```

## Log rotace (newsyslog)

**Soubor:** `ops/zibby.newsyslog.conf`

```bash
# Instalace
sudo cp ops/zibby.newsyslog.conf /etc/newsyslog.d/
```

Rotuje:

- `~/Library/Logs/zibby/api.out.log`
- `~/Library/Logs/zibby/api.err.log`
- `~/Library/Logs/zibby/backup.out.log`

## Build pro produkci

API build (esbuild/tsc):

```bash
pnpm api:start   # spustí zkompilovaný server přímo (bez ts-node-dev)
```

Web build:

```bash
pnpm web:build   # Next.js production build
pnpm web:start   # Spuštění production buildu
```

## Jedna instance

`withPathLock` v `data-dir.ts` je in-process lock (zabrání dvojímu startu ve stejném procesu).
launchd garantuje jednu instanci per `Label` na systémové úrovni — label `com.zibby.api` může běžet jen jednou.

## Crash-safety

Restart API je bezpečný díky reconciliation mechanismům:

- `RunnerCore.init()` — orphaned "running" runy → "interrupted"
- `RunRecorderModule` — re-audit vault po restartu
- `TaskSchedulerService` bootstrap drain — queued tasks se obnoví

Žádná ztráta dat při restartu — vše je na disku (sidecar JSON, JSONL activity, vault markdown).

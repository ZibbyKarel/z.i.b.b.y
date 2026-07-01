# Monitors — CI/CD status alerty (N3)

Monitor sleduje **stav světa** (červený build), ne konverzaci — jeho eventy jsou
alerty, nikdy zprávy k odpovědi. Seam `MonitorAdapter`
(`apps/api/src/monitors/monitor-adapter.ts`) je záměrně oddělený od
`ChannelAdapter`: žádné `send()`, výběr přes `wants(integration)` — nový zdroj
(Sentry) = jedno `registry.register(...)` v `MonitorsModule`, žádná změna
watcheru ani runtime.

## První monitor: GitHub Actions

- Opt-in přes existující GitHub integraci: `config.streams` obsahuje `"ci"`
  (channel adapter tento stream přirozeně ignoruje; stejný PAT, stejné
  credentials).
- Poll `/repos/{repo}/actions/runs` (newest-first), kurzor = nejnovější
  `created_at` (per integrace × adapter, sidecar v `MONITOR_EVENTS_DIR/cursors/`).
- Dokončený run se závěrem `failure`/`timed_out`/`startup_failure` → event
  `ci-run-failed` s deterministickým id `ci-<repo>-<runId>-<attempt>` (re-poll =
  dedup no-op; retry workflowu = nový výskyt). Zelené/in-progress runy = no-op.

## Zpracování (tier path)

Nový alert → JSON soubor v `MONITOR_EVENTS_DIR` (default
`ZIBBY_DATA_DIR/monitors`), activity `monitor-alert` (skupina integrations),
a dispatch vyšetřovacího tasku přes běžný `TaskSchedulerService.createTask`
s `trustedProjectId` z integrace — classifier routuje, budget/limit guardy platí,
fix končí na strukturální PR bráně (Tier-3) jako každý jiný run. Selhání
dispatch nechá event `new`; další tick ho re-dispatchne (alert se nikdy tiše
neztratí). Heartbeat: `systemConfig.monitorTickMs` (default 60 s, `0` vypíná;
testovací fixture pinuje 0).

## HTTP (read-only)

```
GET /api/monitors/events          seznam alertů (?projectId= &state=new|handled|ignored)
GET /api/monitors/events/:id      jeden alert
```

Eventy se rodí jen uvnitř API — klient alert nezfalšuje. Odloženo do N4
(zaznamenáno): CI chip v per-project HUD a věta „main je červený od 08:12"
v briefingu (data jsou už dotazovatelná tady).

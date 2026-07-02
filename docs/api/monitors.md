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

## CI health = stav, ne událost (N4b)

Vedle alertů (event path výše) si každý poll spočítá **aktuální stav zdroje**:
`GithubCiMonitor` z CELÉ stažené stránky (ne kurzorem filtrovaného výseku) určí
červená/zelená podle nejnovějšího rozhodného runu (`success` vs.
red-conclusions; cancelled/in-progress nerozhodují) a `sinceAt` = začátek
souvislé série stejného stavu. Watcher snapshot atribuuje
(integrationId/projectId) a PŘEPÍŠE sidecar
`MONITOR_EVENTS_DIR/status/<integrationId>--<adapterKind>.json` — poslední známý
stav přežije restart; žádná historie, žádný dedup.

Povrchy (anti alert-fatigue: stavová linka existuje, dokud stav trvá, a zmizí
sama — jednorázová notifikace zůstává alertem N3):

- **Briefing**: needs-you položka kindu `ci-red` („CI red since …"), jen dokud
  je červeno; zezelenání nic nehlásí, linka prostě zmizí.
- **Web**: chip na project detailu (`ProjectCiStatusChip` v PageHeader) — tři
  indikátory (tone bad/ok + glyph x/check + text „CI červené od HH:MM"), a11y
  nikdy jen barvou. Bez sledovaného CI se nerenderuje. Červená se propíše hned
  (invalidace na `monitor-alert` activity SSE); zotavení do zelena pokryje
  pomalý interval (CI status je skutečně pollovaný STAV — posture health/limits).

## HTTP (read-only)

```
GET /api/monitors/events          seznam alertů (?projectId= &state=new|handled|ignored)
GET /api/monitors/events/:id      jeden alert
GET /api/monitors/status          poslední známý CI stav per zdroj (?projectId=)
```

Eventy i statusy se rodí jen uvnitř API — klient je nezfalšuje.

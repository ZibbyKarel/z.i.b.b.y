# Phase N4b — CI health povrch

> Stav CI je STAV, ne událost. N3 doručilo alerty (event-based: nový červený run →
> task). N4b doplňuje stavový povrch: „CI je teď červené / zelené, od kdy" — bez
> redundantních re-alertů (research: alert fatigue — stavová linka existuje, dokud
> stav trvá, a zmizí sama; nikdy se neopakuje jako nová notifikace).

## Rozhodnutí

1. **Stav počítá adapter** (`GithubCiMonitor`) ze VŠECH stažených completed runů
   (ne jen kurzorem filtrovaných): stav = conclusion nejnovějšího completed runu;
   `sinceAt` = začátek souvislé série stejného stavu v rámci stažené stránky.
   `MonitorPollResult` získá volitelné `status` (adapter bez atribuce — jako
   `MonitorAlert`).
2. **Persistuje watcher** přes `MonitorEventStore` — sidecar
   `status/<integrationId>--<adapterKind>.json` s plným kontraktovým tvarem
   (atribuce integrationId/projectId). Files-as-source-of-truth; přepis při každém
   ticku (poslední známý stav přežije restart).
3. **Kontrakt-first**: `CiStatusSchema` + read-only
   `GET /api/monitors/status?projectId=` v `monitorsContract`. Klient stav nikdy
   nezapisuje.
4. **Briefing**: needs-you položka nového kindu `ci-red`, jen dokud je stav červený
   („CI red on <repo> since <t>"). Zmizí se zeleným stavem — žádný re-alert.
   `BriefingInput.ciStatuses`.
5. **Web**: chip na project detailu (PageHeader vedle akcí) — TŘI indikátory
   (barva Tag tone `bad`/`ok` + symbol ✗/✓ + text „CI červené od HH:MM" /
   „CI zelené") kvůli a11y (nikdy jen barva). Bez CI statusu se nic nerenderuje.
   Query SSE-gated poll fallback + invalidace na `monitor-alert` activity scope.

## DoD (testy)

- [ ] `github-ci.monitor.test.ts`: červený/zelený stav + sinceAt série; prázdná
      stránka → status undefined
- [ ] `monitor-event.store.test.ts`: status sidecar write/read/list (+filtr projectId)
- [ ] `monitor-watcher.service.test.ts`: tick persistuje status
- [ ] `monitors.contract.test.ts`: status endpoint tvar
- [ ] `briefing-assembly.test.ts`: red → needs-you `ci-red`; green → nic
- [ ] web `ProjectCiStatusChip.test.tsx`: red/green/none rendery (testid enum)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené

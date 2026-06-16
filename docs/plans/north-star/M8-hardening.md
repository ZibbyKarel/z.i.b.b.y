# M8 — Hardening + Telemetry (průběžné)

**Závislosti:** žádné hard; prolíná všemi milníky.

**Proč průběžné, ne poslední:** velká část již existuje ze self-development safety práce;
zbytek by měl přistávat vedle každého milníku, ne být odkládán.

## Reality (co existuje)

- Graceful shutdown čekající na child exit
- Orphan/pgid reaping
- Goal/run restart recovery (reconstruct on boot)
- `/health` liveness probe

## Gap (co chybí)

- `/health` postrádá per-subsystem detail
- Žádné velín health indicators
- Žádný audit export
- Žádná retention policy
- Žádná dead-letter queue
- Žádný exponential backoff na integration calls

## Build

- **`/api/health`** s per-subsystem statusem (backend, vault, integrations, scheduler); velín HUD
  health indicators; never-silent degraded-state alerts.
- **Retry s exponential backoff** pro integration I/O; dead-letter queue pro failed tasks;
  operator notification při opakovaném selhání.
- **Audit trail completeness** (kdo/co/kdy/výsledek) + export; retention/cleanup pro run artifacts.

## Output

Produkčně připravený systém, který přežije selhání a nikdy nezklame tiše.

# Z.I.B.B.Y — Dokumentace

> Zestful Intuitive Brainy Butler — for You.

ZIBBY je self-hosted, file-based agentní OS pro jednoho operátora. Přijme cíl, ne skript,
a vykoná práci — od "postav tuhle webovou aplikaci" po "sleduj moje kanály a vyřiž co umíš."

---

## Obsah

### Architektura
- [Přehled architektury](./architecture.md) — monorepo, vrstvy, datový tok, klíčové principy

### Backend (apps/api)
- [Přehled API](./api/overview.md) — NestJS bootstrapping, moduly, konfigurace
- [Agenti & Runy](./api/agents-runs.md) — definice agentů, spouštění runů, RunnerCore
- [Pipeline orchestrace](./api/pipelines.md) — fáze, smyčky, eskalace, parking
- [Gate policy engine](./api/gates.md) — systémový floor, pravidla, rozhodování
- [Task scheduling](./api/tasks.md) — odložené úlohy, routing, budget guard
- [Memory vault](./api/memory.md) — Obsidian vault, tierování, grounding, recording
- [Kanály & autonomie](./api/channels.md) — email/Slack, triage, mandate
- [Activity log & briefing](./api/activity.md) — audit log, briefing systém
- [Approval systém](./api/approvals.md) — druhy schválení, lifecycle
- [Automatizace](./api/automations.md) — cron/event triggery, targets
- [Rozšiřitelnost runů](./api/extensibility.md) — commands, MCP servery, hooks, projekt env/secrets vkládané do `claude -p`

### Frontend (apps/web)
- [Přehled webu](./web/overview.md) — Next.js App Router, layout, routing
- [State management](./web/state.md) — TanStack Query, mutace, query klíče

### Sdílené knihovny (libs/)
- [Contracts](./libs/contracts.md) — ts-rest, Zod schémata, API router
- [Design system](./libs/design-system.md) — komponenty, téma, Tailwind v4

### Ops & infrastruktura
- [Deployment](./ops/deployment.md) — launchd, backup, log rotace
- [Prostředí](./ops/environment.md) — proměnné prostředí, data adresáře, scripts

---

## Klíčové principy

| Zákon | Znění |
|-------|-------|
| Soubory jsou zdrojem pravdy | UI je pohled; vše se ukládá na disk jako čitelný markdown/JSON |
| Approval-first je strukturální | Není to config — je to drátové do systémového flooru |
| Žádný autonomní commit ven | Žádný auto-push, auto-merge, auto-spend přes budget |
| Gate nelze obejít konverzací | Inbound obsah z kanálů je data, ne příkazy; nikdy nezvyšuje oprávnění |
| Vždy zodpovědný | ZIBBY umí vysvětlit co dělá a udělal, z logu, na vyžádání |

## Rychlý start

```bash
pnpm install
pnpm api:dev     # API → http://localhost:3333 (docs: /docs)
pnpm web:dev     # Web → http://localhost:3000
pnpm storybook   # Design system → http://localhost:6006
```

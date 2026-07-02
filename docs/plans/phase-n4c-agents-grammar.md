# Phase N4c — Agents na interakční gramatiku (audit + migrace nejhoršího)

> Auditní inventura všech sekcí proti one-interaction-grammar (edit vpravo nahoře,
> karta → detail stránka, dialogy jen create/confirm, nic bez labelu, standardní
> load stavy) + migrace nejhoršího porušitele: **Agents**.

## Audit (2026-07-02, plný sweep apps/web)

| Sekce | Porušení | Závažnost |
|---|---|---|
| **agents** | karta → view/edit **dialog** (AgentDetailModal, pravidla 2+3); Run afordance mrtvá (onRun se nikdy nedestrukturuje) | NEJHORŠÍ |
| skills | tile → edit dialog (AddSkillModal create+edit) | vysoká |
| commands | tile → edit dialog (AddCommandModal create+edit) | vysoká |
| automations | AutomationFormDialog create+edit | vysoká |
| hooks | HookFormDialog create+edit | vysoká |
| mcp | McpServerFormDialog create+edit | vysoká |
| integrations | IntegrationFormDialog pravděpodobně create+edit | střední |
| memory | editor dialog má mode create/edit | střední |
| chains, gates, pipelines, projects, runs, settings, overview | konformní | — |

## Rozhodnutí (tato fáze = jen agents; zbytek po dávkách N4d+)

1. **Nová route `/agents/[id]`** → `AgentDetailScreen`: PageHeader (titul = jméno,
   subtitle = backing file), akce VPRAVO NAHOŘE: Uložit (primary), Spustit
   (NewTask pre-fill — první skutečné zapojení Run), Smazat (confirm dialog),
   Zpět. Tělo: panel Základy (`AgentEditBasics`) + panel Pravidla
   (`AgentRulesSection`) nad jedním formulářem; panel „Používají" (pipelines).
2. **Karta naviguje** (`router.push('/agents/:id')`) — žádný dialog.
3. **Dialog jen create**: `AgentDetailModal` → `NewAgentDialog` (create-only);
   `AgentViewDetails` smazat (nahrazeno editovatelnou stránkou) — NC úklid.
4. `useAgentQuery(id)` nad existujícím `getAgent` kontraktem (žádná změna API).
5. Typed routes: `rtk proxy npx next typegen` po přidání route.

## DoD (testy)

- [ ] `Screen.test.tsx`: klik na kartu naviguje na `/agents/:id`; „Nový agent"
      otevře create-only dialog (accessible-name asserce)
- [ ] `DetailScreen.test.tsx`: Uložit (vpravo nahoře) volá update mutaci;
      Smazat → confirm dialog → delete mutace + návrat na /agents; Spustit volá
      NewTask prefill; každá akce má accessible name (getByRole + name)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené

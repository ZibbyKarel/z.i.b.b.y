# TODO 18 — Agenti by department

**Raw TODO item:** stránka Agenti bude rozdělená do kategorií. KAtegorie = oddělení agenta. Každý agent musí být v oddělení a bude reprezentován kartou s jeho glyphem

## Interpretation (night-run rulings, operator asleep)

Today's state:

- `/workforce/agents` renders `RegistriesScreen kind="agents"`, which shows `AgentsTable`: a
  `DataTable` with name, description, category and "bound in" columns.
- `Agent.department` (a `DepartmentId`) exists. Create already returns 422 without one (NS2 F1b),
  and the owner-backfill sweep attributes older agents. All 61 live agents have a department and a
  glyph.
- An `AgentCard` (an `EntityCard` with the glyph, a model/thinking badge and tool tags) exists in
  `apps/web/features/agents/components/AgentCard.tsx` but is unused.
- Gap: the create dialog (`NewAgentDialog`, opened from the Agents page) has **no department
  field**, so creating an agent from the UI hits the API's 422.

Rulings:

- **"Kategorie" means the agent's department** (`Agent.department`), not the free-form
  `category` field, as the item says.
- **Ruling: the grid replaces the table.** The agents page becomes department sections of cards.
  The other registry kinds (skills, MCP, hooks, commands) keep their tables.
- **Ruling: an agent with no department, or an unknown one, is never hidden.** It lands in a
  final "Bez oddělení" / "No department" section. It should be empty given the API guard.
- **Ruling: "every agent must be in a department" is enforced at every write.**
  - Create gets a required department select in the dialog.
  - The API rejects an update that would leave an agent without a department, with 422, matching
    create. Today's update path doesn't check this.

## Requirements

1. **Agents page** (`RegistriesScreen` with `kind === "agents"`). Replace `AgentsTable` with
   `AgentsByDepartment`, a domain composite in `apps/web/features/agents/components/`.
   - One section per department that has at least one agent, in the department list order of
     `useDepartmentLookup().list`.
   - Section header: the department's name, its code, and the agent count, for example
     "Vývoj · DEV · 11". Use an existing DS header primitive (`SectionLabel` or
     `RowGroupHeader`), with a testid per section.
   - Section body: a responsive DS `Grid` of `AgentCard`s, sorted by display name
     (`displayName ?? name ?? id`, locale compare). The card shows the agent's glyph (`bot` when
     missing).
   - A card click navigates to `registryHref("agents", id)`, the existing detail page.
   - A final "Bez oddělení" / "No department" section holds agents whose `department` is absent
     or not in the department list.
   - Loading uses the existing loading pattern; an error shows `QueryError` with retry; with no
     agents, the existing empty copy (`registries.emptyAgents`).
2. **Create dialog** (`NewAgentDialog` and the `CreateAgentDialog` wrapper in `RegistriesScreen`).
   - A required "Oddělení" / "Department" select with options from `useDepartmentLookup().list`,
     placeholder-first with no default.
   - Submit is disabled until a department is chosen.
   - The create body carries `department`.
3. **API update guard** (`apps/api/src/agents/agents.controller.ts` `updateAgent`).
   - If the stored agent has a department and the update would leave none, return 422 with the
     same `unprocessable("department is required")`.
   - An update naming an unknown department returns `unknownDepartment422`, the same as create.
   - Add tests. An agent without a department (pre-backfill) can still be updated as long as the
     update doesn't name an unknown department.
4. **i18n:** cs/en for the "No department" title and the dialog's department label and
   placeholder.
5. **Docs:** update `docs/api/agents.md` (or the docs-sync owner) for the update guard.

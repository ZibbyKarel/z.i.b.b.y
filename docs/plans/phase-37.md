# Phase 37 — /gates shows the locked system floor (POLICY.md) above the catalog

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** — make the structural gate floor
> visible on its primary surface (Laws 1 & 4).

## Audit result

`/gates` is rich and real: rule catalog (`useGateRulesQuery`, matcher → decision via
`GlobalRuleCard`), decision-filter tabs, reorder (`useReorderGateRulesMutation`,
first-match-wins order), CRUD via `RuleModal`, and per-rule users (which agents/skills link
it). Edit/reorder/delete all hit real endpoints.

The gap: the **system floor is never shown on the page**. `useSystemPolicyQuery`
(`GET /api/gates/policy` → the locked `POLICY.md` rules) exists and is exported, and is
already wired into the **agent** rules editor (`AgentRulesSection` renders it as read-only
"inherited" rules via `RuleCard locked`). But the main `/gates` Screen renders only the
editable catalog. Its hierarchy note says "system floor → this catalog → agent/skill", yet
the floor — the deny/ask rules an agent's config "can only harden, never weaken" (Law 1),
that "cannot be talked around" (Law 4) — is invisible on the primary gate page. The
operator can't see, let alone verify, the immutable floor.

## Fix

- New `apps/web/features/gates/components/SystemFloorPanel.tsx`: reads `useSystemPolicyQuery`,
  renders a warn-toned `HudPanel` titled `gates.inheritedTitle` with `gates.inheritedNote`
  and the floor rules as `RuleCard locked` (shield icon, no edit/delete) — exactly the
  read-only treatment `AgentRulesSection` already uses. Returns `null` when the floor is
  empty. Label props reused: `and` / `you` / `notifyHint` / `decision_.${decision}`.
- `apps/web/features/gates/Screen.tsx`: render `<SystemFloorPanel />` right under the
  existing hierarchy note (so: note explains the 3 levels → the locked floor → the editable
  catalog).
- No new i18n (all keys already exist in the `gates` namespace).

## Tests
`SystemFloorPanel.test.tsx` (mock `../queries` `useSystemPolicyQuery`):
- a floor rule (`{ source: "system", locked: true, match: [{type:"tool",tool:"Bash"}],
  decision: "deny" }`) → the panel title + the deny decision render, and there is **no**
  edit/delete control (locked);
- an empty floor → the component renders nothing.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

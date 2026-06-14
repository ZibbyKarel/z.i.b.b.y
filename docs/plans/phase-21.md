# Phase 21 — Skill edit + delete in the UI

> Closes the §7.3 "skill edit/delete" dead-UI gap. The skills **contract + API
> already implemented** `updateSkill`/`deleteSkill`; only the web layer was missing.

## Why this is the phase (gap analysis, 2026-06-14)

LOOP.md priority #1 = mock→real / missing user-facing capability, verified against
**real code, not roadmap claims**. Voice (17–20) is functionally complete. A code
sweep of the §7.3 "known dead UI" list found:

- **Global search** — already wired (`GlobalSearch` aggregates the per-resource
  `search` endpoints; the TopBar test calls it "the functional global-search input").
- **Skill edit/delete** — **genuinely missing**: `skills.contract.ts` has
  `updateSkill` (PATCH) + `deleteSkill` (DELETE), `apps/api/src/skills` implements
  both, but the web app had no mutation hooks and no edit/delete UI. Skills could be
  created (`AddSkillModal` + `useCreateSkillMutation`) but never changed or removed.
- **`light.ts` theme** — still a stub (deferred; design/UX, lower priority).

So the real, contained priority-#1 slice is wiring skill edit + delete — pure web
work against existing endpoints (no API/contract change).

## Deliverables

1. `features/skills/queries/useSkillQuery.ts` — single skill incl. its `instructions`
   body (the list query omits it), enabled only when editing.
2. `features/skills/mutations/useUpdateSkillMutation.ts` + `useDeleteSkillMutation.ts`
   — invalidate the list (+ the single skill on update).
3. `AddSkillModal` edit mode — `initial` pre-fill, "Save" vs "Create", edit-only
   "Delete" button. The id is immutable (filename), so it is not editable.
4. `SkillTile` clickable (`as="button"` + accessible label) → opens the editor;
   `Screen` wires tile → lazy fetch → edit modal → update/delete mutations.
5. i18n `common.delete`, `forms.skill.edit{Title,Subtitle}`, `skills.editSkillAria`
   (cs + en).

## Tests (added this phase)

- `SkillTile.test.tsx`: a selectable tile is a button that fires `onSelect`; without
  `onSelect` it renders statically (no button).
- `AddSkillModal.test.tsx` (edit mode): the form pre-fills from `initial`, shows the
  edit title, and the Delete button fires `onDelete`; create mode shows no Delete.
- No new API endpoint → existing `apps/api` skills e2e covers the backend.

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest
green → full `pnpm test` green → `graphify update .`. Checkpoint commit (no push).

## Notes / gotchas

- The dashboard domain `Skill` omits `instructions`; editing the body requires the
  single-skill `getSkill` fetch (hence `useSkillQuery`).
- Verified the §7.3 list against code first — global search and skill-category CRUD
  were already done in earlier phases; only skill edit/delete remained.

## Out of scope (→ next phases)

- Pipeline edit/duplicate dialog (roadmap 2.2 flagged the edit/duplicate buttons as
  stubs — **verify against current code first**, the same way this phase did).
- `light.ts` theme (design/UX), optional voice wake word / Settings → Voice.

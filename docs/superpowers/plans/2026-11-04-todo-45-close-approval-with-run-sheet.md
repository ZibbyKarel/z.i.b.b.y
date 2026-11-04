# TODO 45: close the approval detail with the run sheet — plan

**Goal:** closing the bridge run sheet drops the `?approval=` param when that approval was opened
from the sheet.

**Approach:** `RunSheet` remembers the approval id it opened (a ref). An effect keyed on the run
id clears it on cleanup: when the sheet unmounts (closed via X / Esc / another row kind) or steps
to another run (J/K), and `?approval=` still equals the remembered id, it is removed with
`history.replaceState` — the same mechanism the bridge uses for `?run=`, which Next syncs into
`useSearchParams`, so the shell's `ApprovalSheet` closes. An approval opened elsewhere (palette,
approvals widget) never lands in the ref, so it is untouched.

## Task 1 (TDD)

- `RunSheet.test.tsx`: mock `RunDetail` exposes an "open approval" button calling
  `onOpenApproval`. Tests: (a) open from sheet, URL `?run=wf_1&approval=g1`, unmount → URL `?run=wf_1`
  with no `approval`; (b) approval in URL not opened from sheet survives unmount.
- `RunSheet.tsx`: ref + cleanup effect.
- Verify: vitest `--project web-components` on the file, prettier, eslint, web tsc.

# F9 — Chat reachability sweep and orphan cleanup

Part of the HUD → Chat UI migration. Read `docs/hud2chat/DECISIONS.md` — **O1, O7, D15, D21** —
and `docs/hud2chat/ROADMAP.md`.

Every route is now migrated or deleted. This phase answers the question the whole arc exists
for: **can the operator actually reach everything from Chat, without jumping out of the new
design?** — and removes what the deletions left stranded.

## Part 1 — O7: remove the two dead affordances

The operator has decided this; implement it, do not re-litigate it.

1. **The topbar's "switch to HUD" icon** (`features/chat/components/ChatTopBar.tsx`) — delete
   it. The topbar goes from five elements to four: status pill · ⌘K search · limits · language.
   The five-element contract came from an earlier arc and was written when there was a HUD to
   switch *to*. Remove the element, its i18n key if now unused, and its testid — and check
   `ChatTopBar.test.tsx` asserts four elements afterwards, not five.
2. **The chat "close" affordance** (`features/chat/ChatContext.tsx` — `CHAT_HOME_ROUTE`,
   `close()`, and whatever renders the control) — delete it. `/chat` is home; a control that
   navigates to the page you are on is broken, not minimal. Follow `close()`'s consumers and
   remove the whole path, including `toggle()` if it only exists to serve it. **Do not leave a
   no-op function behind.**

## Part 2 — orphans

Known, from F8d (verify each before acting — the code has moved since):

- `features/runs/components/ParkedRunsPanel.tsx` — no production consumer; its only remaining
  reference is its own test.
- `features/notifications/` (`useNotifications`, `navBadgeCount`) — lost its last consumer when
  `AppShell`'s runs nav badge went away.
- The `overview.*` i18n namespace in `cs.json`/`en.json` — dead with the page.

**Delete an orphan only after proving it is one.** The rule from F8c/F8d: grep for consumers,
including `vi.mock` paths and dynamic imports, before removing anything. A test that references
a component is not a consumer — but check whether the test is the *only* thing keeping it, and
delete the test with it.

Then sweep for orphans nobody has listed yet. `pnpm exec knip` exists in this repo for exactly
this; a previous arc used it (see NC2 in the project memory) and learned that a grep filtered
on the file's own path can mask a foreign deep import — so **typecheck after every batch of
deletions**, not just at the end.

Do not delete anything belonging to the old shell — `MainLayout`, `Sidebar`, `RightRail`,
`TopBar` and `AppShell`'s HUD branch are **F10's** job, and several orphans will resolve
themselves when that lands. If an orphan's only consumer is one of those, leave it and note it
for F10.

## Part 3 — the reachability audit (the actual deliverable)

Produce a table, saved to `docs/web/chat-reachability.md`, listing **every** surviving route and
how the operator reaches it from `/chat` — dock icon, ⌘K palette, subsystem drawer, a link on
another page, or **nothing**. Anything reaching `nothing` is a finding: either wire it up or
justify why it is deliberately indirect (D15 is the precedent — `/gates` is reachable three
ways without being in the dock, and that was a considered decision, not an oversight).

Check the original audit `docs/web/hud-to-chat-migration-gap.md` for surfaces it flagged as
orphaned, and confirm each is now reachable.

## Out of scope
Deleting `MainLayout`/`Sidebar`/`RightRail`/`TopBar` or simplifying `AppShell` (F10). Any new
feature. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix`; `pnpm check:lint`.
- **Typechecks raw with exit codes** (D20 — the filtered form prints "No errors found" while
  exiting non-zero):
  `for p in apps/web apps/api libs/contracts libs/design-system; do rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"; done`
- `pnpm check:cycles`; full `web-components` and `api` vitest projects.
- **Live browser at 1680px:** confirm the topbar now has four elements and no close control,
  then walk the reachability table — actually click through to at least one surface per access
  route (dock, palette, drawer). Report what you saw.

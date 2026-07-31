# Phase 126f — one "blokován" badge with a tooltip, not a tag per blocker

> TODO.md item 6: _"roadmap — karta issue — nepotřebujeme zobrazovat jako tagy všechny
> blokující issue. Stačí tam dát jen badge 'čeká' nebo 'blokován'. Po najetí myší můžeme
> ukázat v tooltipu názvy blokujících issue. Blokující issue musejí být klikatelné v detailu
> issue, kde proklik otevře dialog s detailem daného issue."_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## Current state

`RoadmapCard.tsx:225-257` renders **one `Chip` per blocker**, each wrapped in its own
`Pressable`, labelled `t("card.waitingOn", { name })` (or `card.waitingOnArchived`). A task
blocked by five issues grows five chips and the card stops being scannable.

Note the card already collapses the *opposite* edge correctly: dependents render as a single
`t("card.blocks", { count })` chip (`RoadmapCard.tsx:258-277`). The blocked side just never
got the same treatment.

`blockers: RoadmapItem[]` arrives as a resolved prop from `RoadmapBoard.tsx:179`
(`blockersOf(item, get)`); the card does not derive anything. `blocked` itself is never
persisted — it is derived by `isBlocked()`
(`libs/contracts/src/roadmap/roadmap-readiness.ts:12-18`). **Do not add a stored field.**

The detail dialog's blocker list (`RoadmapItemDialog.tsx:186-221`) already wraps each blocker
in a `Pressable` calling `onSelectItem(blocker.id)`, which re-targets the same dialog
(`RoadmapPanel.tsx:189`). The last sentence of the TODO therefore appears **already
satisfied** — but recon-by-reading is not proof. See "Verify before you build" below.

## Target behaviour

**Card:** at most one blocked badge.

- `blockers.length === 0` → no badge (unchanged).
- `blockers.length > 0` → a single `Chip`:
  - tone `bad` if **any** blocker is archived (mirrors today's `edgeToneFor` rule — an
    archived blocker is a stuck state, not a normal wait), otherwise tone `wait`.
  - label `čeká` when there is exactly one blocker, `blokován (N)` when there are several.
    Both words the operator named, used to mean different things — see D11.
- The badge is wrapped in the DS `Tooltip`
  (`libs/design-system/src/components/Tooltip/Tooltip.tsx`) whose `content` lists the blocker
  titles, one per line, marking archived ones. `Tooltip` shows on hover **and** focus and
  wires `aria-describedby`, so the titles stay reachable without a mouse.
- The badge stays clickable: click opens the detail dialog for **this card's own item** (not
  a blocker) — the card's existing navigation contract. Per-blocker click-through lives in
  the dialog, which is where the TODO asks for it.

**Dialog:** unchanged, assuming verification below passes.

## Decisions to record in DECISIONS.md

- **D11 — "čeká" for one blocker, "blokován (N)" for several.** The operator offered both
  words; making them mean *singular* vs *plural* spends the distinction on information
  instead of picking one arbitrarily. Count in the label means the tooltip is an
  elaboration, not the only place the number exists.
- **D12 — tooltip content is composed in the card from `blockers`, not a translated blob.**
  Titles are data. Only the wrapper strings (`čeká`, `blokován (N)`, the archived marker) are
  i18n keys.
- **D13 — no `Badge` component is introduced.** `libs/design-system/src/components/Badge/`
  does not exist; `Chip` *is* this system's "colour = state" badge (its own docblock says so,
  `Chip.tsx:41-43`) and the roadmap UI already uses it everywhere. Adding a near-duplicate
  primitive for one label would be a DS change smuggled in under a UI fix.

## Verify before you build

Run the dialog's blocker click-through and confirm with evidence, **before** writing code:

```
pnpm exec vitest run apps/web/features/roadmap/components/RoadmapItemDialog.test.tsx --project web-components
```

Read the existing cases. If a test already proves "clicking a blocker in the dialog shows
that blocker's detail", say so and change nothing in the dialog. If no such test exists, add
one — the operator listed the behaviour as a requirement, and an untested requirement is an
unowned one. Report which of the two happened.

## Implementation — `RoadmapCard.tsx` only

Replace the blocker `.map` at L225-257 with a single `Tooltip`-wrapped `Chip`. Keep
`RoadmapCardTestId.Blocker` as the badge's test id so existing selectors keep meaning
something, and add `RoadmapCardTestId.BlockerTooltip` if the tooltip content needs its own
handle.

Do not touch `RoadmapBoard`'s `blockersOf` call, the dependents chip, `readiness()`, or the
column bucketing.

If phase 126c has not landed yet, wait for it — it also edits this file (adds an epic chip).
126c lands first; 126f rebases onto it.

## i18n

Add to **both** `apps/web/i18n/messages/cs.json` and `en.json` under `roadmap.card.*`:

| key | cs | en |
| --- | --- | --- |
| `card.blockedOne` | `čeká` | `waiting` |
| `card.blockedMany` | `blokován ({count})` | `blocked ({count})` |
| `card.blockedTooltipTitle` | `Čeká na:` | `Waiting on:` |
| `card.blockedArchivedMarker` | `{name} (archivováno)` | `{name} (archived)` |

Remove `card.waitingOn` / `card.waitingOnArchived` / `card.waitingOnArchivedTitle` **only if**
nothing else references them — grep first. Leaving a dead key is better than breaking another
component.

## Tests (`--project web-components`)

`RoadmapCard.test.tsx` — rework the blocker cases:

- Three blockers → exactly **one** element with `RoadmapCardTestId.Blocker` (this is the
  regression the operator reported; it must fail against today's code).
- One blocker → label reads `čeká`, no count.
- Three blockers → label contains `3`.
- Any archived blocker → chip tone is the archived/bad tone; all-live blockers → wait tone.
- Tooltip content contains every blocker's title, and the archived one is marked.
- Zero blockers → no blocked chip at all.
- The dependents chip is untouched (pin the existing assertions).

`RoadmapItemDialog.test.tsx` — per "Verify before you build": either confirm the existing
coverage or add the click-through case.

## Definition of done

1. `pnpm exec vitest run apps/web/features/roadmap --project web-components` green.
2. `pnpm exec vitest run --project web` green (i18n parity).
3. Evidence reported that the "exactly one blocker chip" test fails before the change.
4. Prettier + ESLint clean on touched files; `tsc -p apps/web/tsconfig.json --noEmit` clean.
5. One commit: `feat(roadmap): collapse blocker tags into one badge with a tooltip`.

## Out of scope

- `RoadmapItemDialog`'s layout or its dependency-editing UI.
- The board's blocked **column** (that is `readiness()`, a different concept from the badge).
- Any new DS component.

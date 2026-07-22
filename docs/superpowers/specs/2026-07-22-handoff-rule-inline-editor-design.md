# Handoff-rule inline mad-libs editor — design

**Date:** 2026-07-22
**Branch:** `feat/subsystem-handoff-ui` (continues the Phase-2 handoff-rule-editor work)
**Status:** approved, ready to implement

## Problem

The current create/edit UI for a subsystem's outgoing handoff rule
(`HandoffRuleModal.tsx`) has four concrete faults plus a missed opportunity:

1. **The Dialog is clipped by the subsystem drawer.** Root cause: the drawer panel
   (`SubsystemDrawer.tsx`) is `position: fixed` **with a `transform`** (its slide
   animation). A `transform` establishes a containing block for `position: fixed`
   descendants, so the Dialog is trapped inside the drawer's `overflowY: auto`
   panel instead of covering the viewport.
2. **"Druh signálu" is a free-text input** — the operator has no idea which values
   are valid.
3. **Target is a ButtonGroup (subsystem | pipeline) + a second select** — two
   controls where one grouped select would do.
4. **The toggle is labelled "Povoleno"** — the rest of the system says "Aktivní".

**Missed opportunity / moonshot:** the _display_ row (`HandoffRuleRow.tsx`) is
already a mad-libs sentence. The editor should be an inline, editable version of
that same sentence — so read and edit look identical.

## Decisions (locked with operator)

- **Full inline mad-libs now** — replace the modal with an in-place editable
  sentence. This delivers #1 (no modal ⇒ no clipping), #2, #3, and #4 as one
  coherent redesign.
- **Signal kind = single-select picker + "any (∗)"** — one rule stores one
  `signalKind`, and `*` already means "any kind". No schema/engine change.
- **The 4th selector is the autonomy tier**, rendered as a natural clause
  ("automaticky" / "a dá mi vědět" / "až to schválím"). There is no real
  "otherwise" branch in the rule model.
- **Severity pill is always visible**, defaulting to "(jakákoli)". Severity only
  gates severity-bearing kinds (today `cve`); for others the engine ignores it,
  but a consistent sentence is simpler than showing/hiding per kind.

## The sentence

Read mode is unchanged (current `Pat` accent chips). Edit mode is the same
sentence with each chip replaced by an inline `Dropdown` pill:

```
Když  Sentinel  vyprodukuje  [ Zranitelnost (CVE) ▾ ]  se závažností  [ ≥ vysoká ▾ ]
      ↑fixed (from)          ↑signal-kind pill          ↑severity pill

předej práci  [ Forge ▾ ]   [ automaticky ▾ ]        [✓] [✕]
              ↑target pill    ↑tier-as-clause pill     confirm/cancel
```

### Slots

1. **Signal kind** — inline `Dropdown`, options scoped to what _this_ subsystem
   emits, each with a description, plus "Jakýkoli signál (∗)".
2. **Severity** — inline `Dropdown`: "(jakákoli)" + low/moderate/high/critical.
   Empty ⇒ `minSeverity` omitted from the saved input.
3. **Target** — one inline `Dropdown` merging subsystems **and** pipelines
   (ButtonGroup deleted). Option value encodes kind (`subsystem:forge` /
   `pipeline:x`); split back into `{ kind, id }` on save. The option `code`
   sub-label marks each as subsystém / pipeline.
4. **Tier as clause** — inline `Dropdown`: _automaticky_ (t1, silent) · _a dá mi
   vědět_ (t2, report) · _až to schválím_ (t3, ask first).

## Signal-kind catalog

Lives in `apps/web/features/handoff/signalKinds.ts` (the server accepts any
`signalKind` string, so this is a pure-UI picker catalog — no contract change):

| Subsystem  | Kinds                            |
| ---------- | -------------------------------- |
| `sentinel` | `cve`, `secret`                  |
| `maestro`  | `post-merge-red`                 |
| `loom`     | `god-node`, `community`, `cycle` |
| `scout`    | `research-artifact`              |

Every subsystem also offers `∗` ("any signal"). Subsystems that emit nothing show
only the `∗` option. Kind **labels** and **descriptions** are i18n
(`handoff.signalKind.<kind>` / `handoff.signalKindDesc.<kind>`).

## DS change (the only one)

Add optional `description?: string` to `DropdownOption`, rendered as option
sub-text under the label. Backward-compatible — no existing caller is affected.
This is what lets the kind picker show a description per option.

## What does NOT change

`HandoffRule` schema, the handoff engine, the seed rules, the contract, and
`health.e2e` are all untouched. This is web-only plus one small DS addition.

## Implementation slices (sonnet subagents; Opus reviews each diff + commits raw git)

1. **DS** — `DropdownOption.description` + option-row render + Storybook story +
   test. Independent; must land first (web depends on the field).
2. **Web** — `signalKinds.ts` catalog; new `HandoffRuleEditor` (inline editable
   sentence); rewire `HandoffRulesSection` to inline editing (delete
   `HandoffRuleModal.tsx` + `HandoffRuleModal.test.tsx`); i18n cs+en (kind
   labels+descriptions, tier clauses, severity "any", toggle rename
   Povoleno→Aktivní / Enabled→Active); update `HandoffRulesSection.test.tsx`.

## Testing

- DS: option-description renders; existing Dropdown tests stay green.
- Web: each slot edits; save produces the correct `HandoffRuleInput`
  (target-kind split, `∗` → `signalKind: "*"`, empty severity omitted); read↔edit
  toggle; add-rule appends a blank editable sentence.
- i18n cs/en parity.
- `tsc` for web + design-system (contracts untouched).

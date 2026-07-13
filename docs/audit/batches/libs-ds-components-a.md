BATCH: libs-ds-components-a

[SEVERITY: High] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:1-587] [CATEGORY: Component size]
At 587 lines, Dropdown.tsx is nearly 2.5x the next-largest file in this batch — it mixes trigger-rect positioning math, keyboard navigation, single/multi rendering branches, portal menu markup, and compact chip-overflow measurement in one function component.
Recommendation: extract the rect/menuStyle positioning logic into a shared hook and split single-trigger vs multi-trigger markup into separate subcomponents.

[SEVERITY: High] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:180-334] [CATEGORY: Duplication]
Dropdown and DropDownButton (DropDownButton.tsx:63-159) each independently implement near-identical trigger-rect state, updateRect callback, scroll/resize reposition effect, and flip/clamp menuStyle math, plus parallel keyboard-nav (arrow/home/end/enter/escape/tab with activeIndex).
Recommendation: extract a shared `useFloatingMenuPosition`/roving-keyboard-nav hook consumed by both components.

[SEVERITY: High] [FILE: libs/design-system/src/components/ButtonGroup/ButtonGroup.tsx:72] [CATEGORY: i18n consistency]
`addLabel` defaults to the Czech string "Přidat" while every other default string in this batch is English, violating the documented "DS is i18n-agnostic — string props with English defaults" rule.
Recommendation: change the default to "Add" and let the app override via `t()`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Card/Card.tsx:132-154] [CATEGORY: API consistency]
Five different "tone" unions exist across this batch — Card's `StateTone` (accent/ok/warn/bad/run), Chip's `DotTone` (ok/run/wait/bad/idle/accent), HoldButton's own `HoldButtonTone`, ButtonGroup's own `ButtonGroupTone`, and IconTile's `IconTileTone` — overlapping but not aligned (e.g. "warn" vs "wait", inconsistent presence of "run").
Recommendation: consolidate around one canonical tone vocabulary and derive per-component subsets.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Card/Card.tsx:182-183] [CATEGORY: Missing typing]
Card, Container.tsx:180-181, and Grid.tsx:93-94 each spread `{...(rest as any)}` behind an eslint-disable to forward arbitrary HTML attributes on their polymorphic `as`-tag element, erasing type-checking for callers.
Recommendation: replace the `any` cast with a shared polymorphic-component typing helper used by all three.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:463] [CATEGORY: Missing typing]
`ref={triggerRef as unknown as React.Ref<HTMLButtonElement>}` double-casts a ref typed for `HTMLDivElement` onto a `<button>` element in the single-select branch, papering over a genuine type mismatch.
Recommendation: use separate refs per branch or a proper union ref type.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Accordion/Accordion.tsx:107-137] [CATEGORY: A11y]
`AccordionItem` generates `id = useId()` but never renders it — the summary button has no `aria-controls`, and `AccordionDetails` has no matching `id`/`role="region"`, so assistive tech gets no programmatic link between the toggle and the panel.
Recommendation: wire `aria-controls={panelId}` on the summary and `id={panelId}` on the details panel.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Divider/Divider.tsx:14-17] [CATEGORY: A11y]
The element carries both `aria-hidden` and `role="separator"` at once — `aria-hidden` removes it from the accessibility tree entirely, so the explicit separator role is never announced.
Recommendation: drop `aria-hidden` if the separator should be exposed to AT, or drop `role="separator"` if it's decorative.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:378-393] [CATEGORY: A11y]
The multi-select trigger is `role="combobox"` on a `<div>` that itself wraps nested interactive `Chip` remove buttons; tabbing into a chip's close button steps outside the combobox's own key handling.
Recommendation: reconsider the role for the multi-select trigger, or move removable chips outside the `role="combobox"` element.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Icon/Icon.tsx:71] [CATEGORY: A11y]
`aria-hidden="true"` is hardcoded with no way to override it, so an icon used standalone can never carry its own accessible name.
Recommendation: allow `aria-hidden`/`aria-label` to be overridden via passthrough props.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:114-115] [CATEGORY: Performance]
`selectedKey`/`optionsKey` are computed via `.join(" ")` on every render regardless of `compact` mode, even though they're only consumed by the compact-mode layout effect.
Recommendation: compute them only when `compact` is true, or read live values from refs inside the effect.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:318-334] [CATEGORY: Performance]
`menuStyle` is recomputed via an inline IIFE on every render (same pattern repeated in DropDownButton.tsx:143-159) instead of being memoized.
Recommendation: wrap the calculation in `useMemo`.

[SEVERITY: Low] [FILE: libs/design-system/src/components/IconTile/IconTile.tsx:133] [CATEGORY: Missing typing]
The polymorphic `as`-prop ref is typed as an intersection of unrelated element types, duplicating the same unsound escape hatch also used in Card.tsx:205.
Recommendation: factor a shared polymorphic-ref helper type.

[SEVERITY: Low] [FILE: libs/design-system/src/components/ButtonGroup/ButtonGroup.tsx:78-85] [CATEGORY: A11y / API consistency]
The mutually-exclusive option set uses `role="group"` with `aria-pressed` buttons rather than `role="radiogroup"`/`role="radio"`, and offers no arrow-key roving-focus navigation.
Recommendation: consider radiogroup semantics plus arrow-key navigation for consistency.

STATS: 21 files, 3314 total lines. Top 3 by line count: Dropdown.tsx (587), Card.tsx (262), DropDownButton.tsx (250).

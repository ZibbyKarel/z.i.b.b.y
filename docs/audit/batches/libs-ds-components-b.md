BATCH: libs-ds-components-b

[SEVERITY: High] [FILE: libs/design-system/src/components/Surface/Surface.tsx:37-38] [CATEGORY: Typing]
`{...(rest as any)}` with an inline eslint-disable directly violates the project's "no `any`" rule to work around the polymorphic `as` tag prop — the exact problem `Stack.tsx` already solves safely via a typed `as unknown as FC<...>` cast in the same batch.
Replace with Stack's typed-FC-cast pattern (or extract a shared `polymorphicAs` helper).

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Typography/Typography.tsx:190-198] [CATEGORY: Typing]
`ref as Ref<HTMLHeadingElement & HTMLDivElement & HTMLParagraphElement & HTMLSpanElement & HTMLLabelElement>` casts to an intersection of five DOM element types, which no real node can satisfy — should be a union.
Model this as a proper union type (or a small generic over the element tag).

[SEVERITY: Medium] [FILE: libs/design-system/src/components/form/FilePickerField/FilePickerField.tsx:49-60] [CATEGORY: Duplication/Typing]
`assignRef` hand-rolls dual-ref assignment with two `as MutableRefObject` casts, duplicating what `utils/refs.ts` `mergeRefs` already does type-safely (used correctly in SearchMenu.tsx).
Replace `assignRef` with `mergeRefs(ownRef, ref)`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/MenuButton/MenuButton.tsx:1-231] [CATEGORY: Duplication]
The component's own doc comment admits it "reuses `DropDownButton`'s proven mechanics verbatim" — portal rendering, `updateRect` on scroll/resize, flip/clamp math (`menuStyle`), and roving `activeIndex` keyboard logic are all copy-pasted.
Extract a `useFloatingMenu`/`usePortalPosition` + `useRovingIndex` hook shared by `MenuButton` and `DropDownButton`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Tabs/Tabs.tsx:87-136] [CATEGORY: A11y]
Tabs implement `role="tab"`/`aria-selected` but no keyboard navigation (ArrowLeft/ArrowRight/Home/End) or roving `tabIndex` — the WAI-ARIA Tabs pattern requires arrow-key movement; currently only mouse click works, with no keyboard test coverage.
Add roving-tabindex + arrow-key handling to `Tab`/`TabList`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/form/SegmentPickerField/SegmentPickerField.tsx:22-34] [CATEGORY: A11y/API consistency]
Unlike every other `*Field`, `SegmentPickerField` never forwards `invalid` — and `ButtonGroup` exposes no `invalid`/`aria-invalid` prop — so on error the message renders in red but the interactive control gives no accessible or visual invalid signal.
Wire `invalid` through to `ButtonGroup` (adding `aria-invalid`/error styling support there).

[SEVERITY: Low] [FILE: libs/design-system/src/components/SearchMenu/SearchMenu.tsx:224-227] [CATEGORY: Performance]
Inside nested maps, `flat.findIndex(...)` reruns a linear scan of the whole flattened list for every rendered row — avoidable O(n²) per render.
Precompute an `id → index` map once per render.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Markdown/Markdown.tsx:44-55] [CATEGORY: Duplication]
The `themeVars` GitHub-primer-to-token CSS-var mapping object is duplicated verbatim (same 10 keys) in `MarkdownEditor.tsx:23-35`.
Extract into one exported const imported by both.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Tabs/Tabs.tsx:87-136] [CATEGORY: Duplication]
`Tab`'s horizontal and vertical branches render two nearly identical `<button>` trees differing only in a handful of classes — real logic (aria-selected, onClick, testid) is copy-pasted between the two returns.
Merge into a single return with direction-dependent classes via `cn()`.

[SEVERITY: Low] [FILE: libs/design-system/src/components/form/FilePickerField/FilePickerField.tsx:41,113,124] [CATEGORY: API consistency]
Default strings ("Žádný soubor vybrán", "Procházet") and the trigger's `aria-label` are hardcoded Czech, violating "DS is i18n-agnostic — string props with English defaults" (every sibling follows the convention).
Default to English (or require consumer-supplied labels).

[SEVERITY: Low] [FILE: libs/design-system/src/components/List/List.tsx:51-53] [CATEGORY: A11y/API consistency]
`ListItemText` renders the row's visible label but carries no `data-testid`, unlike every sibling sub-part — breaking the testid convention.
Add a `ListTestId.Text` entry.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Tooltip/Tooltip.tsx:40-76] [CATEGORY: A11y]
No Escape-key dismissal (only blur/mouse-leave), and moving the pointer from trigger toward the bubble closes the tooltip — interactive tooltip content can never be reached by mouse. Line 51 contains a stray empty JSX text node.
Add an Escape handler, extend the hover region (or document non-interactive content), remove the stray node.

STATS: 35 files, 3483 total lines. Top 3: SearchMenu.tsx (268), MenuButton.tsx (231), SchedulePicker.tsx (209).

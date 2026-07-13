BATCH: web-settings

[SEVERITY: Medium] [FILE: apps/web/features/settings/components/SystemSection.tsx:33] [CATEGORY: missing-loading-error-state]
`SystemSection`/`ChatSection`/`ChatUiSection`/`MachineSection`/`ActivitySection`/`MandateSection` all silently `return null` while the config query is pending or errored, unlike `AutomationsSection`/`SelfKnowledgeSection` which render `QueryLoading`/`QueryError`. Operator sees a blank panel with no feedback on slow load or API failure.
Standardize all six sections on the `QueryLoading`/`QueryError` pattern already used by `AutomationsSection`.

[SEVERITY: Medium] [FILE: apps/web/features/settings/components/SystemSection.tsx:31] [CATEGORY: duplication]
The "query → `if (!config) return null` → remount editor with `key={...}` to reseed local state → whole-document PUT on save" wrapper pattern is copy-pasted near-identically across `SystemSection`, `ChatSection`, `ChatUiSection`, and `MachineSection` (4 files), including the same partial-update-via-full-PUT posture and remount-via-`key` trick.
Extract a shared `useConfigEditor`-style hook or generic `<ConfigSection query={...}>` wrapper that owns load/error/remount, so each concrete section only supplies fields and the save shape.

[SEVERITY: Medium] [FILE: apps/web/features/settings/Screen.tsx:139] [CATEGORY: business-logic-in-component]
`Screen()` owns three pieces of side-effecting logic inline: localStorage read/write for the "caffeinate" toggle, a raw `document.cookie` write for locale, and URL `?tab=` parsing/routing — none extracted into a custom hook, and the file has no test coverage at all (no `Screen.test.tsx` exists, unlike every sibling component in this folder).
Extract `useCaffeinatePreference()` and `useSettingsTab()` hooks and add a `Screen.test.tsx` covering tab deep-linking and locale/caffeinate persistence.

[SEVERITY: Medium] [FILE: apps/web/features/settings/Screen.tsx:139] [CATEGORY: dead-or-incomplete-logic]
The "caffeinate" toggle persists `zibby.caffeinate` to `localStorage` but no other file in the app reads that key (confirmed via grep) — the control changes state that nothing consumes, presenting a no-op setting to the operator as if it does something.
Either wire the value into whatever should keep the Mac awake, or remove/mark the control until the daemon-side consumer exists.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/ChatSection.tsx:46] [CATEGORY: type-safety]
`ButtonGroup.onChange` is typed `(value: string) => void`, so `choose(v as ChatPersona)`, `choose(group, v as ActivityViewMode)` in `ActivitySection.tsx:61`, and `setLocale(v as Locale)` in `Screen.tsx:179` are unchecked casts trusting the DS only calls back with an id from the options list — no runtime narrowing like `asSettingsTab` uses.
Add a small runtime guard (or a generic `ButtonGroup<T>` in the DS) instead of raw `as` casts at each call site.

[SEVERITY: Low] [FILE: apps/web/features/settings/Screen.tsx:46] [CATEGORY: bespoke-component]
`SettingRow` and `InfoRow` are defined locally in `Screen.tsx` (label/hint/control and mono key-value row) but are generic layout patterns likely reusable by other settings-shaped pages; not exported or shared.
If another screen needs the same row shape, promote these to the design system or a shared `components/` location.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/SystemSection.tsx:56] [CATEGORY: business-logic-in-component]
The `tick`/`positive` numeric coercion helpers (clamp-to-non-negative-integer, clamp-to-min) are defined inline inside `SystemEditor` on every render rather than as a module-level pure util.
Hoist `tick`/`positive` to module scope (or a shared numeric-coercion util) so they can be tested without rendering the form.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/MandateSection.tsx:46] [CATEGORY: missing-test-coverage]
`MandateSection.test.tsx`, `MachineSection.test.tsx`, `ActivitySection.test.tsx`, and `ChatSection.test.tsx` only exercise the happy path — none test the `!data` early-return branch or a pending/error query state, so the Medium loading/error-state gap above is also untested.
Add a test per section asserting the panel behavior before data resolves.

STATS: files=25 (13 component .tsx, 6 component .test.tsx, 2 mutations, 2 queries, 2 index barrels, 1 Screen.tsx), total_lines=2509 (1890 excluding tests), top3=[Screen.tsx:272, SystemSection.tsx:180, ChatUiSection.test.tsx:138]

# Recon — web feature, design system, settings/project tabs (phase 125)

Reference for 125a-web (`/settings?tab=tasks`), 125d (roadmap board), 125f (manual create).
Line numbers are as-of the recon commit; pointers, not guarantees.

---

## 1. Settings tabs — `apps/web/features/settings/Screen.tsx`

A tab is **just a string literal** — no id/label/icon object; the label comes from i18n.

```tsx
const SETTINGS_TABS = [
  "preferences", "gates", "automations", "chat", "activity",
  "mandate", "runtime", "machine", "selfKnowledge", "system",
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function asSettingsTab(value: string | null): SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value ?? "")
    ? (value as SettingsTab) : "preferences";
}
```

`?tab=` is read **once** into `defaultValue` (uncontrolled `Tabs`) and written back with
`router.replace`; the default tab maps to the bare URL:

```tsx
const initialTab = asSettingsTab(searchParams.get("tab"));
const setTab = (tab: string) => {
  const next = asSettingsTab(tab);
  router.replace(next === "preferences" ? "/settings" : `/settings?tab=${next}`);
};
// …
<Tabs defaultValue={initialTab} direction="vertical" onValueChange={setTab}>
  <TabList><Tab value="runtime">{t("runtime.title")}</Tab>…</TabList>
  <TabPanel value="gates"><GateRulesSection surface="glass" /></TabPanel>
</Tabs>
```

Panel components take **no props** (they own their queries) or just `surface`.
**`TabPanel` unmounts inactive panels**, so drafts must live on the parent screen.

To add `tasks`: append `"tasks"` to the array + a `Tab`/`TabPanel` pair. Nothing else is keyed
off the list.

### The closest template for an editable settings table

`apps/web/features/gates/components/GateRulesSection.tsx` — the full
list → add → edit-modal → confirm-delete → reorder loop, with `QueryLoading` / `QueryError` /
`EmptyState` branches and a trailing `<Button block icon="plus" intent="ghost">`.

Its reorder helper is reusable verbatim:

```tsx
/** Move `id` one step in the `ids` order; returns the new order or null if it can't. */
function moved(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
```

### There is no DS `Table` — editable tables are row Stacks

`apps/web/features/projects/components/KeyValueEditor.tsx` is the pattern: a
`Stack direction="row" align="end"` of `TextInputField`s + a ghost `x` `Button`, then a
trailing ghost `plus` add-row `Button`. Test ids are prefixed and indexed
(`${testIdPrefix}-key-${i}`, `${testIdPrefix}-add`).

A richer mixed-control variant (text + `Toggle` + `Tooltip` help) is `PersonRow` in
`ProfileScreen.tsx:116-188`.

**Controlled-state idiom** — `null` means "follow server data", and save resets to `null`:

```tsx
const [people, setPeople] = useState<ProjectPerson[] | null>(null);
const effectivePeople = people ?? profileQ.data?.identity?.people ?? [];
// …
updateProfile.mutate({ … }, { onSuccess: () => setPeople(null) });
```

---

## 2. Project detail tabs — `apps/web/features/projects/ProfileScreen.tsx`

```tsx
const PROJECT_TABS = ["overview", "profile", "secrets", "integrations"] as const;
```

Same `?tab=` read-once/write-back pattern; horizontal `Tabs` (no `direction` prop).
The screen holds the draft editor state because inactive panels unmount.

**A tab panel receives `projectId: string`, not the project object** — it runs its own queries.
So the roadmap panel's signature is `<RoadmapPanel projectId={id} />`.

Load gate: `if (projectQ.isError) return <QueryError onRetry={…} />;` then
`if (projectQ.isPending) return <QueryLoading />;`

Route wiring is already in place — `app/(dashboard)/projects/[id]/page.tsx` renders
`<ProfileScreen projectId={id} />`.

---

## 3. Feature folder convention

```
apps/web/features/roadmap/
  index.ts                     ← public surface: export * from queries + mutations; NEVER the Screen
  components/  *.tsx  *.test.tsx
  queries/     index.ts  useXxxQuery.ts
  mutations/   index.ts  useXxxMutation.ts
```

### Query (parameterised + `enabled`-gated — the one to copy)

```ts
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getProjectQueryKey(id: string) {
  return ["projects", id] as const;
}

export function useProjectQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.projects.getProject.useQuery({
    queryKey: getProjectQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
```

Import paths from `features/<domain>/queries/*.ts` are exactly `"../../../state/api"` and
`"../../../state/selectApiResponseBody"`.

### Mutation

```ts
export function useUpdateProjectProfileMutation(id: string) {
  const qc = useQueryClient();
  return apiClient.projects.updateProjectProfile.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getProjectProfileQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getProjectQueryKey(id) });
    },
  });
}
```

One-liner factory for simple CRUD — `apps/web/state/makeInvalidatingMutation.ts`:

```ts
export const useCreateAgentMutation = makeInvalidatingMutation(
  apiClient.agents.createAgent.useMutation,
  getAgentsQueryKey,
);
```

---

## 4. Design system — what exists (and what doesn't)

Barrel: `@zibby/design-system`. Spacing tokens: `"0"|"25"|"50"|"75"|"100"|"150"|"200"|"250"|"300"|"350"|"400"|"450"|"500"` → 0/2/4/6/8/12/16/20/24/28/32/36/40 px.
`StateTone = "accent"|"bad"|"ok"|"warn"|"run"`. `DotTone = "ok"|"run"|"wait"|"bad"|"idle"|"accent"`.

### Board building blocks

| Need | Component | Key props |
|---|---|---|
| epic-list ⇄ board split | `Grid` | `sidebar?: "left" \| "right"`, `cols`, `sm`/`md`/`lg`, `gap`, `align` |
| 4 columns | `Grid` | `cols={4}` |
| a column | `Panel` | `header`, `headerEnd` (gets `ml-auto` — the count), `padding`, `live`, `liveTone` |
| a card | `Card` | `as="button"`, `interactive`, `edge?: StateTone` (3px left state bar), `selected`, `tone`, `living`, `corners`, `header`, `footer` |
| scroll pane | `Container` | **there is no `ScrollArea`** — use `maxHeight` + `overflowY="auto"` |
| card overflow menu | `MenuButton` | `items: MenuButtonItem[]` (adds `danger?`) |
| segmented filter | `ButtonGroup` | `options` (`leading`/`trailing` slots), `value`, `onChange`, `deselectable` |

`Card.edge` is documented as exactly the runs-feed "state at a glance" affordance — the right
carrier for readiness tone on a roadmap card.

### Badges

- **`Tag`** — angular, *shape = category*. `tone` (adds `payment`/`deletion`/`push`/`send`),
  `size: "sm"|"md"`, `solid`, `uppercase`, `icon`.
- **`Chip`** — rounded, *color = state*. `tone: DotTone`, `dot`, `pulse`, `closable`.
- **`StatusDot`** — `{ tone: DotTone; size?: Spacing; pulse? }`.

### Dialogs

`Dialog` — `{ open, onClose, title, description, actions, width: "sm"|"md"|"lg"|"xl"|"2xl"|"full", fullscreen, ariaLabel, closeLabel }` + `DialogBody`.
Focus trap, Escape, focus restore, backdrop close, overlay stacking. Renders `null` when closed.

App helpers: `ConfirmDeleteDialog` (`{title, body, confirmLabel, cancelLabel, icon?, pending?, onConfirm, onCancel}`),
`DialogFormFooter` (`{isNew, canSave, createLabel, onClose, onSubmit, onDelete?, submitTestId?}`),
`EntityFormModal`.

**Canonical detail-dialog composition to copy: `features/memory/components/NoteEditorDialog.tsx`**
— own TestId enum, `actions` Stack, `MarkdownEditor` body, `width="lg"`. This is also 125f's
markdown-editor model, as the master plan says.

### Markdown

- `Markdown` (DS) — `{ source, escapeHtml? }`. **Set `escapeHtml` for untrusted model/agent
  output.** Imported issue bodies are untrusted (Law 4).
- `MarkdownEditor` (DS) — `{ ariaLabel, label, value, onChange: (v: string | undefined) => void }`.
- `MarkdownProse` (app) — `{ text }`, the streaming-safe GFM renderer for entity bodies.
- `CodeBlock` — `{ text, maxHeight, followTail, scrollKey, placeholder, caret }`.

### Forms

`TextInputField` (`label`, `labelHint`, `hint`, `error` + native input props) ·
`TextAreaField` · `NumberField` · `SelectField` (single + multi, `DropdownOption<T>`) ·
`Dropdown` (`variant: "inline"|"field"`, single/multi discriminated props) · `Toggle`
(**renders `role="switch"`, `label` is required**) · `ToggleField` · `Checkbox` ·
`DropZone` / `DropZoneField` (**file drop only**) · `Field` (render-prop control).

### Layout & feedback

`Stack` (`direction`, `gap`, `align`, `justify`, `wrap`, `grow`, `shrink`, `as`) ·
`Container` (the sizing/overflow escape hatch: `maxHeight`, `overflowY`, `minW0`, `grow`, …) ·
`Divider` · `Spacer` · `Typography` (`type: pageTitle|title|subtitle|text|note|num|data|label|micro`,
`mono`, `truncate`, `uppercase`, `tracking`, `leading`) · `Icon` / `IconTile` · `Tooltip`
(`{content, children: ReactElement, side}`) · `Alert` · `Accordion` · `Progress` +
`getUsageTone` · `ProgressRing` · `Sparkline` · `Kbd` · `List`/`ListItem`.

App-level: `EmptyState` (`{glyph, title, description, actionLabel?, onAction?, hint?}`) ·
`Collection<T>` (loading → error → empty → grid) · `QueryLoading` · `QueryError` (`{onRetry}`) ·
`QueryBoundary` · `HudPanel` (`{title, action, padding, tone, live, surface: "hud"|"glass"}`) ·
`HudCard` · `PageContainer` · `ImmersivePage` (`{title, subtitle, actions, backHref}`) ·
`Toaster`/`toastBus`.

Icon names: `grid spark plug clock brain pulse cart film server doc play run wait ok edit bolt
check x stop plus chevron dots file shield search gear bot flow compass code flask dollar
branch pause retry checkpoint moon coffee link warn arrow butlerSign pin paperclip mic trash
expand collapse help`.

### ⚠️ Two gaps

- **No drag-and-drop primitive and no `dnd-kit` dependency.** The only HTML5 DnD is
  `features/pipelines/components/PipelineDialog/AgentPalette.tsx` (native `draggable`).
  `DropZone` is *file* drop only. Adding `dnd-kit` would be a new-dependency decision.
- **No `Table`.** Use the `KeyValueEditor` row-Stack pattern, `List`, or `Grid` + a
  `Typography type="label"` header row.

---

## 5. TestId convention

```ts
export enum DialogTestId {
  Overlay = "dialog-overlay",
  Root = "dialog-root",
  // …
}
```

Dynamic children get a suffix: `data-testid={`${TabsTestId.Tab}-${value}`}` → `tabs-tab-roadmap`.
App-level components declare their own enums too (`NoteEditorDialogTestId`, …).

Tests select by test id; **role/ARIA are assertions only** (`toHaveRole`,
`toHaveAccessibleName`, `toHaveAttribute`).

Harness: `renderWithProviders` from `apps/web/test/render.tsx` wraps
`DesignSystemProvider` + `NextIntlClientProvider locale="cs"` + `QueryClientProvider`.
**Tests use the real `cs` catalog, so assertions are on Czech strings.**

Screen tests mock `next/navigation` with a mutable `searchTab` and a `replace` spy, and mock
the feature's `./queries` module wholesale.

### ⚠️ Which vitest project runs what

- **`--project web`** — `environment: "node"`, `include: ["i18n/**/*.test.ts", "utils/**/*.test.ts"]`.
  Does **not** run component tests.
- **`--project web-components`** — jsdom, include globs:
  `components/**/*.test.{ts,tsx}`, `features/**/components/**/*.test.{ts,tsx}`,
  `features/*/*.test.{ts,tsx}`, `features/*/hooks/**`, `features/*/context/**`,
  `features/*/mutations/**`, `hooks/**`.

**Consequence:** put roadmap component tests at `features/roadmap/components/*.test.tsx`.
A test at `features/roadmap/queries/*.test.ts` is picked up by **no** project — only
`mutations/` is included. Pure helpers that need tests belong in `libs/contracts` (which has
its own project) or under `components/`.

---

## 6. i18n

Locale in a cookie, no path prefix; default locale **`cs`**. Catalogs at
`apps/web/i18n/messages/{cs,en}.json`.

```tsx
const t  = useTranslations("projects.profile");   // t("tabs.overview")
const tp = useTranslations("projects");
const tk = useTranslations();                     // tk("common.save")
```

Shape: one top-level namespace → optional sub-object per section → leaf strings.
Editable-list sections use the slots `title / empty / add / remove / <field> /
<field>Placeholder / <field>Help`. Shared strings live in `common`
(`save cancel delete close edit retry loading …`) — reach for `tk("common.save")` rather than
adding duplicates.

**Dynamic keys need an allowlist** (next-intl types reject arbitrary interpolation):

```tsx
const DESCRIBABLE = ["briefing","memory-distill"] as const;
function isDescribable(t: string): t is (typeof DESCRIBABLE)[number] {
  return (DESCRIBABLE as readonly string[]).includes(t);
}
const description = isDescribable(targetType) ? t(`automations.desc.${targetType}`) : undefined;
```

…or an explicit `Record<K, string>` label map for 2-3 values.

### ⚠️ Catalog parity is test-enforced

`apps/web/i18n/messages.test.ts` and `apps/web/i18n/messages/parity.test.ts` assert the two
catalogs have **identical** key sets. Every roadmap key must land in **both** files in the same
commit. Check with `pnpm exec vitest run apps/web/i18n --project web`.

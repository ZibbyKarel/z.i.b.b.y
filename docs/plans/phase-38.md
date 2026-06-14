# Phase 38 — A disabled automation no longer shows a phantom next-run

> Priority axis (LOOP.md): **#4 BUG** — honest status on the autonomous-mode surface.

## Audit result

`/automations` is excellent and real: `useAutomationsQuery`, cron/event sections, enable
**toggle** + **run-now** (`useUpdate/TriggerAutomationMutation`), CRUD via
`AutomationFormDialog` (a *friendly schedule picker* with a live `cronLabel(expr)` preview,
not a raw cron box), and per-card last-fired (`"never run"` when absent) + a computed
next-run (`nextCronRun`). Settings → mandate and discovery (proposed-task approvals, with
the rationale in the approval detail) were also checked and are solid.

The one honesty bug: `AutomationCard` computes `nextLabel` from the trigger only —
**without checking `enabled`**:

```ts
const nextLabel =
  trigger.type === "event" ? t("onEvent")
  : next ? t("nextRun", { when: relativeLabel(next.getTime(), now, locale) })
  : "—";
```

So a **disabled** cron automation still shows "next run in 2h" — a phantom future fire for
something that will never run while it's off. Misleading status; the North Star requires
honest accountability.

## Fix

`apps/web/features/automations/components/AutomationCard.tsx`: gate `nextLabel` on
`enabled` first —

```ts
const nextLabel = !enabled
  ? t("nextOff")
  : trigger.type === "event"
    ? t("onEvent")
    : next
      ? t("nextRun", { when: relativeLabel(next.getTime(), now, locale) })
      : "—";
```

`enabled` is already destructured from `automation`. i18n `automations.nextOff` (cs+en),
e.g. "off · won't run" / "vypnuto · nepoběží". Enabled cards unchanged.

## Tests
New `AutomationCard.test.tsx` (render the card with stub callbacks):
- an **enabled** cron automation renders a "next run" label (the `nextRun` template);
- a **disabled** cron automation renders the "off — won't run" label and **not** a
  next-run time.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

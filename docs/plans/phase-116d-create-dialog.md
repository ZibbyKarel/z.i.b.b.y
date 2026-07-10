# Phase 116d — Create-automation dialog redesign (CommandLine + "Naplánovat")

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`. Runs AFTER 116b + 116c.

## Goal
Replace the type/target-picker create dialog with a **schedule picker + CommandLine**. CommandLine's
run button reads **"Naplánovat"** and **saves the automation** (via its `onSubmit` send-delegation +
the new `submitLabel` prop from 116c). The dialog has **no** submit/create button of its own.

## Design
The dialog body = a trigger/schedule block on top, `CommandLine` below it. The operator picks the
schedule, types the instruction (optionally `@`-mentioning an agent/pipeline and attaching files),
and clicks **Naplánovat** → the automation is created and the dialog closes. CommandLine fetches its
own agents/pipelines for `@`-mentions, so the dialog no longer needs `agents`/`pipelines` props.

## Changes

### 1. Extract a reusable trigger block
From `AutomationFormFields.tsx`, extract the trigger UI (cron/event `SegmentPickerField` +
`ScheduleField` for cron / multi `SelectField` for events) into a small component
`TriggerFields` (new file `components/TriggerFields.tsx`) driven by the existing
`AutomationFormState` (`triggerType`, `schedule`, `events`, `expr`, setters). It keeps the localized
`scheduleLabels` + `useCronLabel` hint. (116e removes the leftover target/name/prompt UI from
`AutomationFormFields`.)

### 2. Rewrite `components/AutomationFormDialog.tsx`
- Props: `{ onClose: () => void; onCreate: (body: Omit<Automation,"lastFiredAt"|"system">) => void }`
  (drop `agents`/`pipelines`).
- Use `useAutomationFormState()` for trigger/schedule state only.
- Render:
  ```tsx
  <Dialog open title={t("formCreateTitle")} width="lg" onClose={onClose}
          actions={<Button intent="ghost" onClick={onClose}>{t("cancel")}</Button>}>
    <Stack gap="200">
      <TriggerFields form={form} />
      <CommandLine
        chrome={false}
        showAttach
        submitLabel={t("scheduleAction")}      /* "Naplánovat" / "Schedule" */
        disabled={!scheduleValid}              /* schedule invalid ⇒ block save */
        placeholder={t("commandLinePlaceholder")}
        onSubmit={(text, target, attachments) => save(text, target, attachments)}
      />
    </Stack>
  </Dialog>
  ```
- `scheduleValid`: `schedule.time` set && (monthly || weekdays.length>0) for cron; events.length>0
  for event (reuse the trigger half of `form.canSave`).
- `save(text, target, attachments)` builds the body and calls `onCreate`:
  ```ts
  const name = deriveName(text);                 // first non-empty line, trimmed, ≤60 chars
  onCreate({
    id: slug(name, "automation"),
    name,
    trigger: form.buildTrigger(),
    target: { type: "task", text: text.trim(),
              target: target,                     // CommandLine's TaskTarget passes straight through
              attachmentSetId: attachments?.attachmentSetId },
    enabled: true,
  });
  onClose();
  ```
  (CommandLine's `onSubmit` gives `(text, target?: TaskTarget, attachments?: TaskAttachmentSet)`.
  `attachments?.attachmentSetId` may be undefined — that's fine.)
- Remove the old `AutomationFormFields` usage, the `AutomationFormTestId.Submit` button, the
  `canSave(false, …)` gating, and the `slug` import stays.

### 3. `Screen.tsx`
- `addModal` no longer passes `agents`/`pipelines`:
  `<AutomationFormDialog onClose={…} onCreate={onCreate} />`.
- `onCreate` unchanged (persist → navigate to `/automations/:id`).
- `resolveTarget`: add a `target.type === "task"` branch → glyph from `target.target?.kind`
  (`agent`→bot, `pipeline`→flow, else `spark`), name from `target.target?.name` (fallback generic).

### 4. i18n — add under `automations`
- `scheduleAction`: CS "Naplánovat" / EN "Schedule".
- `commandLinePlaceholder`: CS "Napiš, co má automatizace dělat — @zmiň agenta či pipelinu, přidej soubory…" / EN "Describe what the automation should do — @mention an agent or pipeline, attach files…".
- Remove now-unused create-form keys only if nothing else references them (leave `formCreateTitle`,
  `cancel`, `close`).

### 5. Tests
- Rewrite `Screen.test.tsx` create-flow assertions: opening the dialog shows the schedule block +
  CommandLine; there is NO dialog submit button (`AutomationFormTestId.Submit` gone); submitting via
  CommandLine (`CommandLineTestId.Send`, label "Naplánovat") with typed text triggers `onCreate`
  with a `{type:"task"}` target. Mock CommandLine if needed, or drive its input by testid.
- Keep/adjust any AutomationFormDialog test.

## Verify
`pnpm check:types && pnpm check:lint && pnpm web:test` (automations suite green).

## Notes
Detail-page edit + card polish + AutomationFormFields cleanup are 116e. Here, just make create work
end-to-end and keep types/tests green.

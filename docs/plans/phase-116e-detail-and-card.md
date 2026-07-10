# Phase 116e — DetailScreen edit + AutomationCard for the `task` target

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`. Runs AFTER 116d.

## Goal
Make the `/automations/:id` detail page edit a `task` automation with the same CommandLine surface,
render task automations correctly on the card, and remove the now-dead target/name/prompt UI from
`AutomationFormFields`.

## Changes

### 1. `AutomationFormFields.tsx` cleanup
- Remove the target-type `SegmentPickerField`, the target `SelectField`, the briefing/discovery
  note cards, and the prompt `TextAreaField` — all replaced by CommandLine. Remove the now-unused
  `agents`/`pipelines` props and `TargetOption` if nothing else needs it (check `useAutomationFormState`
  callers — the form state's `targetType`/`targetId`/`prompt` may become unused; trim them too, but
  keep `buildTrigger`, `schedule`, `events`, `expr`, and a trigger-only `canSave`).
- Keep the `isSystem` system-note card + the trigger fields (or just render `<TriggerFields/>`).
- Net result: `AutomationFormFields` for a **system** automation = system note + trigger block only.

### 2. `DetailScreen.tsx` — edit surface
Two shapes, keyed on `automation.system` and `automation.target.type`:
- **System automation** (unchanged): header with Run now + Save + Back; body = system note +
  trigger block; Save sends `{ trigger }` only.
- **`task` automation**: header with Run now + Delete + Back (**no** top-right Save); body =
  `<TriggerFields form={form}/>` + `<CommandLine>` seeded from the stored spec:
  ```tsx
  <CommandLine
    chrome={false}
    showAttach
    submitLabel={tk("common.save")}          /* "Uložit" / "Save" */
    disabled={!scheduleValid}
    initialText={target.text}
    initialTarget={target.target}            /* seeds the @mention + target */
    onSubmit={(text, tgt, attachments) => saveTask(text, tgt, attachments)}
  />
  ```
  `saveTask` builds the update body:
  ```ts
  updateAutomation.mutate({ params: { id }, body: {
    trigger: form.buildTrigger(),
    target: { type: "task", text: text.trim(), target: tgt,
              // preserve existing files unless the user attached new ones (no per-file removal UI)
              attachmentSetId: attachments?.attachmentSetId ?? automation.target.attachmentSetId },
    enabled: automation.enabled,
  }});
  ```
  (CommandLine has no `initialAttachments`; existing files are preserved via the `??` fallback.
  Document this as a known limitation — editing can add files, not remove individual ones.)
- Legacy non-system targets other than `task` (agent/pipeline/briefing): after this change the
  create path only makes `task` automations, but existing data may still hold other types. Keep a
  minimal read-only fallback (show the trigger block + a note) so the page never crashes; do not
  rebuild the old pickers. If simpler, render the task editor only for `task` and a schedule-only
  editor otherwise.

### 3. `AutomationCard.tsx`
- Handle `target.type === "task"`: target glyph from `target.target?.kind`
  (agent→`bot`, pipeline→`flow`, else `spark`), label from `target.target?.name` or a generic
  `t("taskTargetLabel")` ("Úkol" / "Task"). The card already shows `automation.name` (the derived
  instruction). Don't show raw prompt text twice.
- Confirm no leftover references to removed target types.

### 4. i18n
- Add `automations.taskTargetLabel` (CS "Úkol" / EN "Task"). Remove any create-form keys that are
  now unreferenced (verify with a grep before deleting).

### 5. Tests
- `DetailScreen.test.tsx`: editing a `task` automation shows the CommandLine editor seeded with the
  stored text; saving via CommandLine issues an update with a `{type:"task"}` target preserving the
  attachmentSetId when no new files are attached; a system automation still shows schedule-only Save.
- `AutomationCard.test.tsx`: a `task` automation renders name + resolved target glyph/label.

## Verify
`pnpm check:types && pnpm check:lint && pnpm web:test` (automations suites green).

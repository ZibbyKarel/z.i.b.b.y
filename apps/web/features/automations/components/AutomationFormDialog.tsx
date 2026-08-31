"use client";

import { useTranslations } from "next-intl";
import { Button, Dialog, Stack } from "@zibby/design-system";
import type { Automation } from "@zibby/contracts";
import { slug } from "../../../utils/slug";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import type { TaskAttachmentSet } from "../../tasks/components/TaskAttachments";
import type { TaskTarget } from "../../tasks";
import { useAutomationFormState } from "./AutomationFormFields";
import { TriggerFields } from "./TriggerFields";

export interface AutomationFormDialogProps {
  onClose: () => void;
  /**
   * Emits the new automation body; the screen persists it. `system` is
   * server-owned and never settable from the client, so it is omitted —
   * mirroring CreateAutomationSchema.
   */
  onCreate: (body: Omit<Automation, "lastFiredAt" | "system">) => void;
}

/** Trims the trailing/leading blanks off the FIRST non-empty line of the typed
 *  instruction, capped so it stays a readable card title — never the whole
 *  (potentially multi-paragraph) prompt. */
function deriveName(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? text;
  return firstLine.trim().slice(0, 60);
}

/**
 * The CREATE-ONLY automation dialog (N4f — dialogs create and confirm,
 * nothing else; Phase 116d redesign): the operator picks a schedule/trigger
 * (via {@link TriggerFields}) and then types the instruction straight into
 * {@link CommandLine} — which already knows how to `@`-mention an agent or
 * pipeline and attach files. There is NO dialog-owned submit button: the
 * CommandLine's own send action (label overridden to "Naplánovat"/"Schedule")
 * both derives the automation's name from the typed text and persists it,
 * via `onSubmit`'s send-delegation mode.
 *
 * Editing an existing automation (including the schedule-only system ones)
 * lives on the `/automations/:id` detail page ({@link ../DetailScreen}),
 * which still renders the older {@link AutomationFormFields}.
 */
export function AutomationFormDialog({ onClose, onCreate }: AutomationFormDialogProps) {
  const t = useTranslations("automations");
  const form = useAutomationFormState();

  const scheduleValid =
    form.triggerType === "cron"
      ? form.schedule.time.trim().length > 0 &&
        (form.schedule.repeat === "monthly" || form.schedule.weekdays.length > 0)
      : form.events.length > 0;

  const save = (text: string, target?: TaskTarget, attachments?: TaskAttachmentSet) => {
    const name = deriveName(text);
    onCreate({
      id: slug(name, "automation"),
      name,
      trigger: form.buildTrigger(),
      target: {
        type: "task",
        text: text.trim(),
        target,
        attachmentSetId: attachments?.attachmentSetId,
      },
      enabled: true,
    });
    onClose();
  };

  return (
    <Dialog
      open
      actions={
        <Button intent="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
      }
      ariaLabel={t("formCreateTitle")}
      closeLabel={t("close")}
      onClose={onClose}
      title={t("formCreateTitle")}
      width="lg"
    >
      <Stack gap="200">
        <TriggerFields form={form} />
        {/* Fix round: explicit `false` — this dialog always creates a `type: "task"`
            target, which doesn't reach a run's KB scope yet (see CommandLine's
            `allowTeamMentions` docblock). Matches the (opt-in) default; stated
            explicitly so the intent survives a future default change. */}
        <CommandLine
          showAttach
          allowTeamMentions={false}
          chrome={false}
          disabled={!scheduleValid}
          onSubmit={save}
          placeholder={t("commandLinePlaceholder")}
          submitLabel={t("scheduleAction")}
        />
      </Stack>
    </Dialog>
  );
}

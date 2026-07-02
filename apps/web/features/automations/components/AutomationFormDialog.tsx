"use client";

import { useTranslations } from "next-intl";
import { Button, Dialog } from "@zibby/design-system";
import type { Automation } from "@zibby/contracts";
import { slug } from "../../../utils/slug";
import {
  AutomationFormFields,
  AutomationFormTestId,
  type TargetOption,
  useAutomationFormState,
} from "./AutomationFormFields";

// Re-exported so the tests and screens keep one import site for the testids.
export { AutomationFormTestId };

export interface AutomationFormDialogProps {
  agents: ReadonlyArray<TargetOption>;
  pipelines: ReadonlyArray<TargetOption>;
  onClose: () => void;
  /**
   * Emits the new automation body; the screen persists it. `system` is
   * server-owned and never settable from the client, so it is omitted —
   * mirroring CreateAutomationSchema.
   */
  onCreate: (body: Omit<Automation, "lastFiredAt" | "system">) => void;
}

/**
 * The CREATE-ONLY automation dialog (N4f) — grammar: dialogs create and
 * confirm, nothing else. Editing an existing automation (including the
 * schedule-only system ones) lives on the `/automations/:id` detail page
 * ({@link ../DetailScreen}), which renders the same
 * {@link AutomationFormFields}.
 */
export function AutomationFormDialog({
  agents,
  pipelines,
  onClose,
  onCreate,
}: AutomationFormDialogProps) {
  const t = useTranslations("automations");
  const form = useAutomationFormState();

  const submit = () => {
    onCreate({
      id: slug(form.name, "automation"),
      name: form.name.trim(),
      trigger: form.buildTrigger(),
      target: form.buildTarget(),
      // Top-level: always forwarded to whatever the target runs (agent prompt,
      // research focus, briefing voice).
      prompt: form.prompt.trim(),
      enabled: true,
    });
  };

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            data-testid={AutomationFormTestId.Submit}
            disabled={!form.canSave(false, { agents, pipelines })}
            icon="plus"
            intent="primary"
            onClick={submit}
          >
            {t("create")}
          </Button>
        </>
      }
      ariaLabel={t("formCreateTitle")}
      closeLabel={t("close")}
      onClose={onClose}
      title={t("formCreateTitle")}
      width="lg"
    >
      <AutomationFormFields agents={agents} form={form} pipelines={pipelines} />
    </Dialog>
  );
}

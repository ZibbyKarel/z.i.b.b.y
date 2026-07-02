"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@zibby/design-system";
import type { CreateHookInput } from "@zibby/contracts";
import { DialogFormFooter } from "../../../components/DialogFormFooter/DialogFormFooter";
import { HookFormFields, HookFormTestId, useHookFormState } from "./HookFormFields";

// Re-exported so the tests and screens keep one import site for the testids.
export { HookFormTestId };

export interface HookFormDialogProps {
  onClose: () => void;
  onCreate: (body: CreateHookInput) => void;
}

/**
 * The CREATE-ONLY hook dialog (N4e) — grammar: dialogs create and confirm,
 * nothing else. Editing an existing hook lives on the `/hooks/:id` detail page
 * ({@link ../DetailScreen}), which renders the same {@link HookFormFields}.
 */
export function HookFormDialog({ onClose, onCreate }: HookFormDialogProps) {
  const t = useTranslations();
  const form = useHookFormState();

  return (
    <Dialog
      open
      actions={
        <DialogFormFooter
          isNew
          canSave={form.canSave(true)}
          createLabel={t("hooks.create")}
          onClose={onClose}
          onSubmit={() => onCreate(form.buildCreate())}
          submitTestId={HookFormTestId.Submit}
        />
      }
      ariaLabel={t("hooks.addHook")}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={t("hooks.addHook")}
      width="lg"
    >
      <HookFormFields form={form} />
    </Dialog>
  );
}

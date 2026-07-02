"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@zibby/design-system";
import type { CreateIntegrationInput } from "@zibby/contracts";
import { DialogFormFooter } from "../../../components/DialogFormFooter/DialogFormFooter";
import {
  IntegrationFormFields,
  IntegrationFormTestId,
  useIntegrationFormState,
} from "./IntegrationFormFields";

// Re-exported so the tests and screens keep one import site for the testids.
export { IntegrationFormTestId };

/** What the dialog emits on save: the create payload plus an optional secret. */
export interface IntegrationCreateDraft {
  create: CreateIntegrationInput;
  /** A freshly entered secret to persist separately via the credentials endpoint. */
  secret?: string;
}

export interface IntegrationFormDialogProps {
  /** The owning project (one project = one company); baked into the create payload. */
  projectId: string;
  onClose: () => void;
  onCreate: (draft: IntegrationCreateDraft) => void;
}

/**
 * The CREATE-ONLY integration dialog (N4h) — grammar: dialogs create and
 * confirm, nothing else. Editing an existing integration lives on the
 * project-nested `/projects/:id/integrations/:integrationId` detail page
 * ({@link ../DetailScreen}), which renders the same
 * {@link IntegrationFormFields}. The secret rides out-of-band (never inside the
 * persisted config); the caller persists it through the separate credentials
 * mutation (email → `password`, everything else → `token`).
 */
export function IntegrationFormDialog({ projectId, onClose, onCreate }: IntegrationFormDialogProps) {
  const t = useTranslations();
  const form = useIntegrationFormState(projectId);

  return (
    <Dialog
      open
      actions={
        <DialogFormFooter
          isNew
          canSave={form.canSave(true)}
          createLabel={t("integrations.create")}
          onClose={onClose}
          onSubmit={() => onCreate({ create: form.buildCreate(), secret: form.newSecret() })}
          submitTestId={IntegrationFormTestId.Submit}
        />
      }
      ariaLabel={t("integrations.addIntegration")}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={t("integrations.addIntegration")}
      width="lg"
    >
      <IntegrationFormFields form={form} />
    </Dialog>
  );
}

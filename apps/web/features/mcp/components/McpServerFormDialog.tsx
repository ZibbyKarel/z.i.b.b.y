"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@zibby/design-system";
import type { CreateMcpServerInput } from "@zibby/contracts";
import { DialogFormFooter } from "../../../components/DialogFormFooter/DialogFormFooter";
import { McpServerFormFields, McpServerFormTestId, useMcpFormState } from "./McpServerFormFields";

// Re-exported so the tests and screens keep one import site for the testids.
export { McpServerFormTestId };

/** What the dialog emits on save: the create payload plus an optional secret. */
export interface McpServerCreateDraft {
  create: CreateMcpServerInput;
  /** A freshly entered auth token to persist separately via the credentials endpoint. */
  authToken?: string;
}

export interface McpServerFormDialogProps {
  onClose: () => void;
  onCreate: (draft: McpServerCreateDraft) => void;
}

/**
 * The CREATE-ONLY MCP server dialog (N4e) — grammar: dialogs create and
 * confirm, nothing else. Editing an existing server lives on the `/mcp/:id`
 * detail page ({@link ../DetailScreen}), which renders the same
 * {@link McpServerFormFields}. The auth token rides out-of-band (never inside
 * the persisted config); the screen persists it through the separate
 * credentials mutation.
 */
export function McpServerFormDialog({ onClose, onCreate }: McpServerFormDialogProps) {
  const t = useTranslations();
  const form = useMcpFormState();

  return (
    <Dialog
      open
      actions={
        <DialogFormFooter
          isNew
          canSave={form.canSave(true)}
          createLabel={t("mcp.create")}
          onClose={onClose}
          onSubmit={() => onCreate({ create: form.buildCreate(), authToken: form.newAuthToken() })}
          submitTestId={McpServerFormTestId.Submit}
        />
      }
      ariaLabel={t("mcp.addServer")}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={t("mcp.addServer")}
      width="lg"
    >
      <McpServerFormFields form={form} />
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Stack } from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Command } from "@zibby/contracts";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { parseTools } from "./components/AddCommandModal/AddCommandModal";
import { CommandFormFields, type CommandFormValues } from "./components/CommandFormFields";
import { useDeleteCommandMutation, useUpdateCommandMutation } from "./mutations";
import { useCommandQuery } from "./queries";

export enum CommandDetailScreenTestId {
  Save = "command-detail-save",
  Delete = "command-detail-delete",
}

const schema = z.object({
  id: z.string(),
  description: z.string(),
  argumentHint: z.string(),
  allowedTools: z.string(),
  model: z.string(),
  disableModelInvocation: z.boolean(),
  enabled: z.boolean(),
  instructions: z.string().min(1),
});

export interface CommandDetailScreenProps {
  commandId: string;
}

/**
 * The `/commands/:id` detail page (N4d, on the N4c agents template) — a tile
 * click NAVIGATES here, the page IS the edit surface (the same
 * {@link CommandFormFields} body the create dialog renders, with the `/<id>`
 * locked — it names the backing file) and Save/Delete sit top-right; delete
 * asks in a confirm dialog (it used to fire unconfirmed).
 */
export function DetailScreen({ commandId }: CommandDetailScreenProps) {
  const query = useCommandQuery(commandId);
  if (query.isError) return <QueryError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <QueryLoading />;
  if (!query.data) return null;
  // The form captures its defaults at mount — key by command so a different id remounts.
  return <CommandEditor command={query.data} key={query.data.id} />;
}

function CommandEditor({ command }: { command: Command }) {
  const t = useTranslations("commands");
  const tf = useTranslations("forms.command");
  const tk = useTranslations();
  const router = useRouter();
  const updateCommand = useUpdateCommandMutation();
  const deleteCommand = useDeleteCommandMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { renderForm, submit, form } = useFormControls<CommandFormValues>({
    defaultValues: {
      id: command.id,
      description: command.description ?? "",
      argumentHint: command["argument-hint"] ?? "",
      allowedTools: (command["allowed-tools"] ?? []).join(", "),
      model: command.model ?? "",
      disableModelInvocation: command["disable-model-invocation"] ?? false,
      enabled: command.enabled,
      instructions: command.instructions,
    },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      updateCommand.mutate({
        params: { id: command.id },
        body: {
          description: values.description.trim() || undefined,
          "argument-hint": values.argumentHint.trim() || undefined,
          "allowed-tools": parseTools(values.allowedTools),
          model: values.model.trim() || undefined,
          "disable-model-invocation": values.disableModelInvocation,
          enabled: values.enabled,
          instructions: values.instructions.trim() || tk("defaults.command"),
        },
      });
    },
  });

  const canSave = form.formState.isValid && !updateCommand.isPending;

  return renderForm(
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <>
              <Button
                data-testid={CommandDetailScreenTestId.Delete}
                icon="trash"
                intent="danger"
                onClick={() => setConfirmDelete(true)}
                size="sm"
              >
                {tk("common.delete")}
              </Button>
              <Button
                data-testid={CommandDetailScreenTestId.Save}
                disabled={!canSave}
                icon="check"
                intent="primary"
                loading={updateCommand.isPending}
                onClick={() => void submit()}
                size="sm"
              >
                {tk("common.save")}
              </Button>
              <Button intent="ghost" onClick={() => router.push("/commands")} size="sm">
                {tk("common.back")}
              </Button>
            </>
          }
          subtitle={command["argument-hint"]}
          title={`/${command.id}`}
        />

        <HudPanel title={tf("editTitle")}>
          <CommandFormFields idLocked />
        </HudPanel>
      </Stack>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { id: command.id })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteCommand.mutate(
              { params: { id: command.id } },
              { onSuccess: () => router.push("/commands") },
            )
          }
          pending={deleteCommand.isPending}
          title={t("deleteTitle")}
        />
      )}
    </PageContainer>,
  );
}

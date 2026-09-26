"use client";

import type { Route } from "next";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  Button,
  Container,
  Panel,
  Stack,
  type SubNavLinkComponent,
  Typography,
} from "@zibby/design-system";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import type { Command } from "@zibby/contracts";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
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

  const name = `/${command.id}`;

  return renderForm(
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Breadcrumb
            items={[
              { label: tk("registries.title"), href: "/system/registries/commands" as Route },
              { label: name },
            ]}
            linkComponent={Link as SubNavLinkComponent}
          />

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Stack gap="25">
              <Typography type="h1">{name}</Typography>
              {command["argument-hint"] && (
                <Typography mono size="xs" type="note" variant="tertiary">
                  {command["argument-hint"]}
                </Typography>
              )}
            </Stack>
            <Stack align="center" direction="row" gap="100">
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
            </Stack>
          </Stack>

          <Panel header={tf("editTitle")} padding="200">
            <CommandFormFields idLocked />
          </Panel>
        </Stack>
      </PageContainer>

      {confirmDelete && (
        <ConfirmDeleteDialog
          body={t("deleteBody", { id: command.id })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={tk("common.delete")}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            deleteCommand.mutate(
              { params: { id: command.id } },
              { onSuccess: () => router.push("/system/registries/commands") },
            )
          }
          pending={deleteCommand.isPending}
          title={t("deleteTitle")}
        />
      )}
    </Container>,
  );
}

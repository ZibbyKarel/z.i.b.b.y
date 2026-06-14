"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Grid, Stack } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { CommandTile } from "./components/CommandTile";
import { AddCommandModal } from "./components/AddCommandModal/AddCommandModal";
import { useCommandQuery, useCommandsQuery } from "./queries";
import {
  useCreateCommandMutation,
  useDeleteCommandMutation,
  useUpdateCommandMutation,
} from "./mutations";

export function Screen() {
  const t = useTranslations("commands");
  const tk = useTranslations();
  const commandsQuery = useCommandsQuery();
  const commands = commandsQuery.data ?? [];
  const createCommand = useCreateCommandMutation();
  const updateCommand = useUpdateCommandMutation();
  const deleteCommand = useDeleteCommandMutation();
  const [adding, setAdding] = useState(false);
  // The command being edited — fetched lazily so it always edits the latest body.
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: editing } = useCommandQuery(editingId);

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <Button icon="plus" intent="primary" onClick={() => setAdding(true)}>
              {t("addCommand")}
            </Button>
          }
          subtitle={t("countSummary", { count: commands.length })}
          title={t("title")}
        />

        {commandsQuery.isPending ? (
          <QueryLoading />
        ) : commandsQuery.isError ? (
          <QueryError onRetry={() => void commandsQuery.refetch()} />
        ) : commands.length === 0 ? (
          <EmptyState
            actionLabel={t("addCommand")}
            description={t("emptyDescription")}
            glyph="bolt"
            hint={t("emptyHint")}
            onAction={() => setAdding(true)}
            title={t("emptyTitle")}
          />
        ) : (
          <Grid cols={1} gap="150" lg={3} sm={2}>
            {commands.map((c) => (
              <CommandTile
                command={c}
                key={c.id}
                onSelect={() => setEditingId(c.id)}
                selectLabel={t("editCommandAria", { name: c.id })}
              />
            ))}
          </Grid>
        )}
      </Stack>

      {adding && (
        <AddCommandModal
          onClose={() => setAdding(false)}
          onSubmit={({
            id,
            description,
            argumentHint,
            allowedTools,
            model,
            disableModelInvocation,
            enabled,
            instructions,
          }) =>
            createCommand.mutate(
              {
                body: {
                  id,
                  description,
                  "argument-hint": argumentHint,
                  "allowed-tools": allowedTools,
                  model,
                  "disable-model-invocation": disableModelInvocation,
                  enabled,
                  instructions: instructions || tk("defaults.command"),
                },
              },
              { onSuccess: () => setAdding(false) },
            )
          }
          pending={createCommand.isPending}
        />
      )}

      {editing && (
        <AddCommandModal
          initial={{
            id: editing.id,
            description: editing.description,
            argumentHint: editing["argument-hint"],
            allowedTools: editing["allowed-tools"],
            model: editing.model,
            disableModelInvocation: editing["disable-model-invocation"],
            enabled: editing.enabled,
            instructions: editing.instructions,
          }}
          key={editing.id}
          onClose={() => setEditingId(null)}
          onDelete={() =>
            deleteCommand.mutate(
              { params: { id: editing.id } },
              { onSuccess: () => setEditingId(null) },
            )
          }
          onSubmit={({
            description,
            argumentHint,
            allowedTools,
            model,
            disableModelInvocation,
            enabled,
            instructions,
          }) =>
            updateCommand.mutate(
              {
                params: { id: editing.id },
                body: {
                  description,
                  "argument-hint": argumentHint,
                  "allowed-tools": allowedTools,
                  model,
                  "disable-model-invocation": disableModelInvocation,
                  enabled,
                  instructions: instructions || tk("defaults.command"),
                },
              },
              { onSuccess: () => setEditingId(null) },
            )
          }
          pending={updateCommand.isPending}
        />
      )}
    </PageContainer>
  );
}

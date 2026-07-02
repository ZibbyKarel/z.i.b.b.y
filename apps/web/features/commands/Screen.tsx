"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Grid, Stack } from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { CommandTile } from "./components/CommandTile";
import { AddCommandModal } from "./components/AddCommandModal/AddCommandModal";
import { useCommandsQuery } from "./queries";
import { useCreateCommandMutation } from "./mutations";

export function Screen() {
  const t = useTranslations("commands");
  const tk = useTranslations();
  const router = useRouter();
  const commandsQuery = useCommandsQuery();
  const commands = commandsQuery.data ?? [];
  const createCommand = useCreateCommandMutation();
  const [adding, setAdding] = useState(false);

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
                onSelect={() => router.push(`/commands/${c.id}`)}
                selectLabel={t("openCommandAria", { name: c.id })}
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
              {
                // Grammar (N4d): the dialog only births the command; editing
                // lives on the detail page — navigate straight to it.
                onSuccess: () => {
                  setAdding(false);
                  router.push(`/commands/${id}`);
                },
              },
            )
          }
          pending={createCommand.isPending}
        />
      )}
    </PageContainer>
  );
}

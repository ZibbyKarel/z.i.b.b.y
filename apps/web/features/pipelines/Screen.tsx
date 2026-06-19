"use client";

import { Button, Container, Divider, Grid, Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import type { Pipeline } from "../../domain";
import { useAgentsQuery } from "../agents/queries";
import { useNewTask } from "../tasks/TaskContext";
import { NewPipelineDialog } from "./components/NewPipelineDialog/NewPipelineDialog";
import { PhaseChain, attemptsFromStageRuns } from "./components/PhaseChain";
import { PipelineCard } from "./components/PipelineCard/PipelineCard";
import { PipelineDialog } from "./components/PipelineDialog/PipelineDialog";
import {
  duplicatePipelineBody,
  useCreatePipelineMutation,
  useDuplicatePipelineMutation,
  useUpdatePipelineMutation,
} from "./mutations";
import { usePipelineRunsQuery, usePipelinesQuery } from "./queries";

export interface ScreenProps {
  /** Pre-selected pipeline id from the [id] route segment. */
  selectedId?: string;
}

export function Screen({ selectedId: routeId }: ScreenProps) {
  const t = useTranslations();
  const pipelinesQuery = usePipelinesQuery();
  const pipelines = pipelinesQuery.data ?? [];
  const createPipeline = useCreatePipelineMutation();
  const updatePipeline = useUpdatePipelineMutation();
  const duplicatePipeline = useDuplicatePipelineMutation();
  const { data: agents = [] } = useAgentsQuery();
  const { open: openNewTask } = useNewTask();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Pipeline | null>(null);
  const router = useRouter();

  const list = pipelines;
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  // Attempt counters on the chain while the selected pipeline has a live run
  // (newest one wins — the list is newest-first).
  const { data: liveRuns = [] } = usePipelineRunsQuery();
  const currentRun = selected ? liveRuns.find((r) => r.pipelineId === selected.id) : undefined;
  const attempts = currentRun ? attemptsFromStageRuns(currentRun.stageRuns) : undefined;

  const addModal = adding && (
    <NewPipelineDialog
      agents={agents}
      isPending={createPipeline.isPending}
      onClose={() => setAdding(false)}
      onCreate={(body) => createPipeline.mutate({ body }, { onSuccess: () => setAdding(false) })}
    />
  );

  const header = (
    <PageHeader
      actions={
        <Button icon="plus" intent="primary" onClick={() => setAdding(true)}>
          {t("pipelines.addPipeline")}
        </Button>
      }
      subtitle={t("pipelines.countSummary", { count: list.length })}
      title={t("pipelines.title")}
    />
  );

  if (pipelinesQuery.isPending) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <QueryLoading />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  if (pipelinesQuery.isError) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <QueryError onRetry={() => void pipelinesQuery.refetch()} />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  if (list.length === 0) {
    return (
      <PageContainer>
        <Stack gap="250">
          {header}
          <EmptyState
            actionLabel={t("pipelines.addPipeline")}
            description={t("pipelines.emptyDescription")}
            glyph="flow"
            hint={t("pipelines.emptyHint")}
            onAction={() => setAdding(true)}
            title={t("pipelines.emptyTitle")}
          />
        </Stack>
        {addModal}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Stack gap="250">
        {header}
        <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
          <Stack gap="150">
            {list.map((p) => (
              <PipelineCard
                agents={agents}
                key={p.id}
                onSelect={(id: string) => router.push(`/pipelines/${id}`)}
                pipeline={p}
                selected={p.id === (selected?.id ?? "")}
              />
            ))}
          </Stack>

          {selected && (
            <Stack gap="250">
              <HudPanel padding="250">
                <Stack gap="200">
                  <Stack wrap align="start" direction="row" gap="200" justify="between">
                    <Container minW0>
                      <Stack gap="100">
                        <Typography size="3xl" type="title" weight="semibold">
                          {selected.name}
                        </Typography>
                        <Typography mono size="caption" type="note" variant="secondary">
                          {selected.desc}
                        </Typography>
                        <Stack align="center" direction="row" gap="75">
                          <Icon name="file" size="xs" tone="faint" />
                          <Typography mono size="sm" type="note" variant="tertiary">
                            {selected.file}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Container>
                    <Stack align="center" direction="row" gap="100">
                      <Button
                        icon="edit"
                        intent="ghost"
                        onClick={() => setEditing(selected)}
                        size="sm"
                      >
                        {t("common.edit")}
                      </Button>
                      <Button
                        disabled={duplicatePipeline.isPending}
                        icon="link"
                        intent="ghost"
                        onClick={() => {
                          const body = duplicatePipelineBody(
                            selected,
                            list.map((p) => p.id),
                          );
                          duplicatePipeline.mutate(
                            { body },
                            {
                              onSuccess: () => router.push(`/pipelines/${body.id}`),
                            },
                          );
                        }}
                        size="sm"
                      >
                        {t("common.duplicate")}
                      </Button>
                      <Button
                        icon="play"
                        intent="primary"
                        onClick={() =>
                          openNewTask(undefined, {
                            kind: "pipeline",
                            id: selected.id,
                            name: selected.name,
                            glyph: "flow",
                          })
                        }
                      >
                        {t("pipelines.runPipeline")}
                      </Button>
                    </Stack>
                  </Stack>
                  <Divider />
                  <Stack align="center" direction="row" gap="100">
                    <Icon name="branch" size="md" tone="dim" />
                    <Typography mono size="caption" type="note" variant="secondary">
                      {t("pipelines.branchNote")}
                    </Typography>
                  </Stack>
                </Stack>
              </HudPanel>

              <HudPanel padding="250" title={t("pipelines.chainTitle")}>
                <PhaseChain agents={agents} attempts={attempts} pipeline={selected} />
              </HudPanel>

              {selected.outputs.length > 0 && (
                <HudPanel padding="250" title={t("pipelines.outputsTitle")}>
                  <Stack gap="100">
                    {selected.outputs.map((o, i) => (
                      <Stack
                        align="center"
                        direction="row"
                        gap="100"
                        key={`${o.type}-${o.from}-${i}`}
                      >
                        <Icon
                          name={o.type === "pr" ? "branch" : o.dest === "vault" ? "brain" : "file"}
                          size="md"
                          tone="dim"
                        />
                        <Typography size="caption" type="note" variant="secondary">
                          {o.type === "pr"
                            ? t("pipelines.outputPr", { from: o.from })
                            : t(
                                o.dest === "vault"
                                  ? "pipelines.outputFileVault"
                                  : "pipelines.outputFileProject",
                                { from: o.from, to: o.to },
                              )}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </HudPanel>
              )}
            </Stack>
          )}
        </Grid>

        {editing && (
          <PipelineDialog
            agents={agents}
            initial={editing}
            isPending={updatePipeline.isPending}
            key={editing.id}
            mode="edit"
            onClose={() => setEditing(null)}
            onSave={(id, patch) =>
              updatePipeline.mutate(
                { params: { id }, body: patch },
                { onSuccess: () => setEditing(null) },
              )
            }
          />
        )}
        {addModal}
      </Stack>
    </PageContainer>
  );
}

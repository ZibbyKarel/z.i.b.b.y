"use client";

import {
  Button,
  Container,
  Divider,
  Grid,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import type { Pipeline } from "../../domain";
import { useAgentsQuery } from "../agents/queries";
import { NewPipelineDialog } from "./components/NewPipelineDialog/NewPipelineDialog";
import { PhaseChain, attemptsFromStageRuns } from "./components/PhaseChain";
import { PipelineCard } from "./components/PipelineCard/PipelineCard";
import { PipelineDialog } from "./components/PipelineDialog/PipelineDialog";
import { PipelineRunModal } from "./components/PipelineRunModal/PipelineRunModal";
import {
  duplicatePipelineBody,
  useCreatePipelineMutation,
  useDuplicatePipelineMutation,
  useStartPipelineRunMutation,
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
  const startRun = useStartPipelineRunMutation();
  const { data: agents = [] } = useAgentsQuery();
  const [runPipeline, setRunPipeline] = useState<Pipeline | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Pipeline | null>(null);
  const router = useRouter();

  const list = pipelines;
  const selected =
    (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  // Attempt counters on the chain while the selected pipeline has a live run
  // (newest one wins — the list is newest-first).
  const { data: liveRuns = [] } = usePipelineRunsQuery();
  const currentRun = selected
    ? liveRuns.find((r) => r.pipelineId === selected.id)
    : undefined;
  const attempts = currentRun
    ? attemptsFromStageRuns(currentRun.stageRuns)
    : undefined;

  const addModal = adding && (
    <NewPipelineDialog
      agents={agents}
      isPending={createPipeline.isPending}
      onClose={() => setAdding(false)}
      onCreate={(body) =>
        createPipeline.mutate({ body }, { onSuccess: () => setAdding(false) })
      }
    />
  );

  const toolbar = (
    <SectionToolbar
      addLabel={t("pipelines.addPipeline")}
      label={t("pipelines.sectionLabel")}
      onAdd={() => setAdding(true)}
    />
  );

  if (pipelinesQuery.isPending) {
    return (
      <PageContainer>
        {toolbar}
        <QueryLoading />
        {addModal}
      </PageContainer>
    );
  }

  if (pipelinesQuery.isError) {
    return (
      <PageContainer>
        {toolbar}
        <QueryError onRetry={() => void pipelinesQuery.refetch()} />
        {addModal}
      </PageContainer>
    );
  }

  if (list.length === 0) {
    return (
      <PageContainer>
        {toolbar}
        <EmptyState
          actionLabel={t("pipelines.addPipeline")}
          description={t("pipelines.emptyDescription")}
          glyph="flow"
          hint={t("pipelines.emptyHint")}
          onAction={() => setAdding(true)}
          title={t("pipelines.emptyTitle")}
        />
        {addModal}
      </PageContainer>
    );
  }

  return (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
      <Stack gap="150">
        {toolbar}
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
              <Stack
                wrap
                align="start"
                direction="row"
                gap="200"
                justify="between"
              >
                <Container minW0>
                  <Stack gap="100">
                    <Typography size="3xl" type="title" weight="semibold">
                      {selected.name}
                    </Typography>
                    <Typography
                      mono
                      size="caption"
                      type="note"
                      variant="secondary"
                    >
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
                    onClick={() => setRunPipeline(selected)}
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
            <PhaseChain
              agents={agents}
              attempts={attempts}
              pipeline={selected}
            />
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
      {runPipeline && (
        <PipelineRunModal
          agents={agents}
          key={runPipeline.id}
          onClose={() => setRunPipeline(null)}
          onLaunch={({ project }) =>
            startRun.mutate({
              params: { id: runPipeline.id },
              body: { project },
            })
          }
          pipeline={runPipeline}
          projects={[]}
        />
      )}
      {addModal}
    </Grid>
  );
}

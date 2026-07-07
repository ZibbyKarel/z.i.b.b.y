"use client";

import {
  Button,
  Container,
  Divider,
  EntityHero,
  Grid,
  Icon,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { AVATAR_MAX, type UpdatePipelineInput } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { toastBus } from "../../components/Toaster/toastBus";
import { useAgentsQuery } from "../agents";
import { PinButton } from "../pins";
import { useNewTask } from "../tasks";
import { AgentPalette } from "./components/PipelineDialog/AgentPalette";
import { NewPipelineDialog } from "./components/NewPipelineDialog/NewPipelineDialog";
import { PipelineCard } from "./components/PipelineCard/PipelineCard";
import { PipelineCanvas } from "./components/PipelineDialog/PipelineCanvas";
import {
  INITIAL_ASSIGNMENT,
  type PipelineGraph,
  attemptsFromStageRuns,
  graphToPhases,
  makeNode,
  phasesToGraph,
  validateGraph,
} from "./components/PipelineDialog/pipeline-graph";
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

/** Read-only canvas: the editing callbacks are never invoked, so they no-op. */
const noop = () => {};

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
  const router = useRouter();

  const list = pipelines;
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  // Inline edit state, keyed by the pipeline id being edited (rather than a
  // plain boolean) so navigating to a different pipeline while mid-edit
  // implicitly exits edit mode instead of applying stale edits to the wrong
  // pipeline.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = Boolean(selected) && editingId === selected?.id;
  const [editGraph, setEditGraph] = useState<PipelineGraph>(() => phasesToGraph(selected, agents));
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showPalette, setShowPalette] = useState(false);

  // Attempt counters on the chain while the selected pipeline has a live run
  // (newest one wins — the list is newest-first).
  const { data: liveRuns = [] } = usePipelineRunsQuery();
  const currentRun = selected ? liveRuns.find((r) => r.pipelineId === selected.id) : undefined;
  const attempts = currentRun ? attemptsFromStageRuns(currentRun.stageRuns) : undefined;

  // The detail view renders the *same* node-graph the editor builds on open
  // (read-only) — identical by construction since both call `phasesToGraph`.
  const detailGraph = useMemo(() => phasesToGraph(selected, agents), [selected, agents]);

  const startEdit = () => {
    if (!selected) return;
    setEditGraph(phasesToGraph(selected, agents));
    setEditName(selected.name);
    setEditDesc(selected.desc);
    setShowPalette(false);
    setEditingId(selected.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setShowPalette(false);
  };
  const addAgentToEdit = (agentId: string, x?: number, y?: number) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setEditGraph((g) => {
      const i = g.nodes.length;
      const node = makeNode(agent, i + 1, x ?? 60 + i * 26, y ?? 150 + i * 18);
      return { ...g, nodes: [...g.nodes, node] };
    });
    setShowPalette(false);
  };
  const editValidity = validateGraph(editGraph, editName);
  const canSaveEdit = !updatePipeline.isPending && editValidity.ok;
  const saveEdit = () => {
    if (!selected || !canSaveEdit) return;
    const assignment = selected.phases[0]?.consumes ?? INITIAL_ASSIGNMENT;
    const phases = graphToPhases(editGraph, assignment);
    const patch: UpdatePipelineInput = {};
    const trimmedName = editName.trim();
    const trimmedDesc = editDesc.trim();
    if (trimmedName !== selected.name) patch.name = trimmedName;
    if (trimmedDesc !== selected.desc) patch.desc = trimmedDesc;
    const initialPhases = graphToPhases(phasesToGraph(selected, agents), assignment);
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) patch.phases = phases;
    updatePipeline.mutate(
      { params: { id: selected.id }, body: patch },
      {
        onSuccess: () => {
          setEditingId(null);
          setShowPalette(false);
        },
      },
    );
  };

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
              <EntityHero
                editable
                desc={editing ? editDesc : selected.desc}
                fit="contain"
                glyph="flow"
                height={220}
                image={selected.avatar}
                name={editing ? editName : selected.name}
                onRemove={() =>
                  updatePipeline.mutate({ params: { id: selected.id }, body: { avatar: null } })
                }
                onUpload={(dataUri) => {
                  if (dataUri.length > AVATAR_MAX) {
                    toastBus.emit({ message: t("pipelines.avatarTooLarge") });
                    return;
                  }
                  updatePipeline.mutate({ params: { id: selected.id }, body: { avatar: dataUri } });
                }}
                placeholder={t("pipelines.uploadPipelineAvatar")}
                removeLabel={t("pipelines.removeImage")}
                uploadLabel={t("pipelines.uploadImage")}
              />
              <HudPanel padding="250">
                <Stack gap="200">
                  {editing && (
                    <Stack direction="row" gap="200">
                      <Container grow minW0>
                        <TextInputField
                          label={t("forms.pipeline.nameLabel")}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={t("forms.pipeline.namePlaceholder")}
                          value={editName}
                        />
                      </Container>
                      <Container grow minW0>
                        <TextInputField
                          label={t("forms.pipeline.descLabel")}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder={t("forms.pipeline.descPlaceholder")}
                          value={editDesc}
                        />
                      </Container>
                    </Stack>
                  )}
                  <Stack wrap align="start" direction="row" gap="200" justify="between">
                    <Container minW0>
                      <Stack gap="100">
                        <Stack align="center" direction="row" gap="75">
                          <Icon name="file" size="xs" tone="faint" />
                          <Typography mono size="sm" type="note" variant="tertiary">
                            {selected.file}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Container>
                    <Stack align="center" direction="row" gap="100">
                      <PinButton id={selected.id} kind="pipeline" />
                      {editing ? (
                        <>
                          <Button intent="ghost" onClick={cancelEdit} size="sm">
                            {t("common.cancel")}
                          </Button>
                          <Button
                            disabled={!canSaveEdit}
                            icon="check"
                            intent="primary"
                            loading={updatePipeline.isPending}
                            onClick={saveEdit}
                            size="sm"
                          >
                            {t("common.save")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button icon="edit" intent="ghost" onClick={startEdit} size="sm">
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
                        </>
                      )}
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

              <HudPanel
                action={
                  editing && (
                    <Button
                      icon="plus"
                      intent="ghost"
                      onClick={() => setShowPalette((v) => !v)}
                      size="sm"
                    >
                      {t("forms.pipeline.addStep")}
                    </Button>
                  )
                }
                padding="250"
                title={t("pipelines.chainTitle")}
              >
                <Container
                  height="460px"
                  overflow="hidden"
                  position="relative"
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {editing && showPalette && (
                    <AgentPalette
                      agents={agents}
                      closeLabel={t("common.close")}
                      onAdd={(agentId) => addAgentToEdit(agentId)}
                      onClose={() => setShowPalette(false)}
                    />
                  )}
                  <PipelineCanvas
                    agents={agents}
                    attempts={attempts}
                    graph={editing ? editGraph : detailGraph}
                    onAddAgent={editing ? addAgentToEdit : noop}
                    readOnly={!editing}
                    setGraph={editing ? setEditGraph : noop}
                  />
                </Container>
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

        {addModal}
      </Stack>
    </PageContainer>
  );
}

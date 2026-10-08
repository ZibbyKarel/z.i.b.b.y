"use client";

import {
  Breadcrumb,
  Button,
  Container,
  Divider,
  EntityHero,
  Grid,
  Icon,
  Panel,
  Stack,
  type SubNavLinkComponent,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { AVATAR_MAX, type UpdateWorkflowInput, type WorkflowOutput } from "@zibby/contracts";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { toastBus } from "../../components/Toaster/toastBus";
import { useAgentsQuery } from "../agents";
import { PinButton } from "../pins";
import { useNewTask } from "../tasks";
import { OutputsEditor, outputsValid } from "./components/OutputsEditor/OutputsEditor";
import { StepSettings } from "./components/WorkflowDialog/StepSettings";
import { AgentPalette } from "./components/WorkflowDialog/AgentPalette";
import { NewWorkflowDialog } from "./components/NewWorkflowDialog/NewWorkflowDialog";
import { WorkflowCard } from "./components/WorkflowCard/WorkflowCard";
import { WorkflowCanvas } from "./components/WorkflowDialog/WorkflowCanvas";
import {
  INITIAL_ASSIGNMENT,
  type WorkflowGraph,
  attemptsFromStageRuns,
  graphToPhases,
  makeNode,
  makeStepNode,
  phasesToGraph,
  validateGraph,
} from "./components/WorkflowDialog/workflow-graph";
import {
  duplicateWorkflowBody,
  useCreateWorkflowMutation,
  useDuplicateWorkflowMutation,
  useUpdateWorkflowMutation,
} from "./mutations";
import { useWorkflowRunsQuery, useWorkflowsQuery } from "./queries";

export interface ScreenProps {
  /** Pre-selected workflow id from the [id] route segment. */
  selectedId?: string;
  /**
   * ZB-03 — the list/detail route prefix. Defaults to `/work/workflows`; a
   * department's Workflows tab hosts this same screen at
   * `/org/departments/[id]/workflows` so its editor opens under the
   * department instead of the global catalog.
   */
  basePath?: string;
}

/** Read-only canvas: the editing callbacks are never invoked, so they no-op. */
const noop = () => {};

/**
 * The `/workflows` and `/workflows/[id]` routes share this one Screen (F5,
 * docs/plans/hud2chat-F5-orchestration.md): `routeId` (the `[id]` route
 * segment, absent on the list route) drives the immersive header's title,
 * actions and `backHref` — NOT `selected`, which always falls back
 * to `list[0]` for the master/detail preview even on the plain list route.
 * Getting `backHref` right for both states is the single most likely defect
 * here: it must point at `/workflows` on the detail route (never loop back to
 * itself) and at `/chat` on the list route.
 */
export function Screen({ selectedId: routeId, basePath = "/work/workflows" }: ScreenProps) {
  const t = useTranslations();
  const workflowsQuery = useWorkflowsQuery();
  const workflows = workflowsQuery.data ?? [];
  const createWorkflow = useCreateWorkflowMutation();
  const updateWorkflow = useUpdateWorkflowMutation();
  const duplicateWorkflow = useDuplicateWorkflowMutation();
  const { data: agents = [] } = useAgentsQuery();
  const { open: openNewTask } = useNewTask();
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const list = workflows;
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  // Inline edit state, keyed by the workflow id being edited (rather than a
  // plain boolean) so navigating to a different workflow while mid-edit
  // implicitly exits edit mode instead of applying stale edits to the wrong
  // workflow.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = Boolean(selected) && editingId === selected?.id;
  const [editGraph, setEditGraph] = useState<WorkflowGraph>(() => phasesToGraph(selected, agents));
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editOutputs, setEditOutputs] = useState<WorkflowOutput[]>([]);
  const [showPalette, setShowPalette] = useState(false);

  // Attempt counters on the chain while the selected workflow has a live run
  // (newest one wins — the list is newest-first).
  const { data: liveRuns = [] } = useWorkflowRunsQuery();
  const currentRun = selected ? liveRuns.find((r) => r.workflowId === selected.id) : undefined;
  const attempts = currentRun ? attemptsFromStageRuns(currentRun.stageRuns) : undefined;

  // The detail view renders the *same* node-graph the editor builds on open
  // (read-only) — identical by construction since both call `phasesToGraph`.
  const detailGraph = useMemo(() => phasesToGraph(selected, agents), [selected, agents]);

  const startEdit = () => {
    if (!selected) return;
    setEditGraph(phasesToGraph(selected, agents));
    setEditName(selected.name);
    setEditDesc(selected.desc);
    setEditOutputs(selected.outputs);
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
  const addStepToEdit = (type: "verify" | "tool" | "workflow") => {
    setEditGraph((g) => {
      const i = g.nodes.length;
      return { ...g, nodes: [...g.nodes, makeStepNode(type, i + 1, 60 + i * 26, 150 + i * 18)] };
    });
    setShowPalette(false);
  };
  const editValidity = validateGraph(editGraph, editName);
  const canSaveEdit = !updateWorkflow.isPending && editValidity.ok && outputsValid(editOutputs);
  const saveEdit = () => {
    if (!selected || !canSaveEdit) return;
    const assignment = selected.phases[0]?.consumes ?? INITIAL_ASSIGNMENT;
    const phases = graphToPhases(editGraph, assignment);
    const patch: UpdateWorkflowInput = {};
    const trimmedName = editName.trim();
    const trimmedDesc = editDesc.trim();
    if (trimmedName !== selected.name) patch.name = trimmedName;
    if (trimmedDesc !== selected.desc) patch.desc = trimmedDesc;
    const initialPhases = graphToPhases(phasesToGraph(selected, agents), assignment);
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) patch.phases = phases;
    if (JSON.stringify(editOutputs) !== JSON.stringify(selected.outputs))
      patch.outputs = editOutputs;
    updateWorkflow.mutate(
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
    <NewWorkflowDialog
      agents={agents}
      isPending={createWorkflow.isPending}
      onClose={() => setAdding(false)}
      onCreate={(body) =>
        createWorkflow.mutate(
          { body },
          {
            onSuccess: () => {
              setAdding(false);
              router.push(`${basePath}/${body.id}` as Route);
            },
          },
        )
      }
    />
  );

  // Honest load states (F5 consolidation, mirroring automations/Screen.tsx
  // from F4): a pending/failed fetch must never read as an empty workspace.
  const body = workflowsQuery.isPending ? (
    <QueryLoading />
  ) : workflowsQuery.isError ? (
    <QueryError onRetry={() => void workflowsQuery.refetch()} />
  ) : list.length === 0 ? (
    <EmptyState
      actionLabel={t("workflows.addWorkflow")}
      description={t("workflows.emptyDescription")}
      glyph="flow"
      hint={t("workflows.emptyHint")}
      onAction={() => setAdding(true)}
      title={t("workflows.emptyTitle")}
    />
  ) : (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
      <Stack gap="150">
        {list.map((p) => (
          <WorkflowCard
            agents={agents}
            key={p.id}
            onSelect={(id: string) => router.push(`${basePath}/${id}` as Route)}
            selected={p.id === (selected?.id ?? "")}
            workflow={p}
          />
        ))}
      </Stack>

      {selected && (
        <Stack gap="250">
          {/* D13 (docs/hud2chat/DECISIONS.md, resolved F6b): the page header
              above already shows the workflow/chain's name — showIdentity={false}
              keeps the hero to a bare image/glyph band instead of repeating it. */}
          <EntityHero
            editable
            desc={editing ? editDesc : selected.desc}
            fit="contain"
            glyph="flow"
            height="lg"
            image={selected.avatar}
            name={editing ? editName : selected.name}
            onRemove={() =>
              updateWorkflow.mutate({ params: { id: selected.id }, body: { avatar: null } })
            }
            onUpload={(dataUri) => {
              if (dataUri.length > AVATAR_MAX) {
                toastBus.emit({ message: t("workflows.avatarTooLarge") });
                return;
              }
              updateWorkflow.mutate({ params: { id: selected.id }, body: { avatar: dataUri } });
            }}
            placeholder={t("workflows.uploadWorkflowAvatar")}
            removeLabel={t("workflows.removeImage")}
            showIdentity={false}
            uploadLabel={t("workflows.uploadImage")}
          />
          <Panel padding="250">
            <Stack gap="200">
              {editing && (
                <Stack direction="row" gap="200">
                  <Container grow minW0>
                    <TextInputField
                      label={t("forms.workflow.nameLabel")}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t("forms.workflow.namePlaceholder")}
                      value={editName}
                    />
                  </Container>
                  <Container grow minW0>
                    <TextInputField
                      label={t("forms.workflow.descLabel")}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder={t("forms.workflow.descPlaceholder")}
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
                  <PinButton id={selected.id} kind="workflow" />
                  {editing ? (
                    <>
                      <Button intent="ghost" onClick={cancelEdit} size="sm">
                        {t("common.cancel")}
                      </Button>
                      <Button
                        disabled={!canSaveEdit}
                        icon="check"
                        intent="primary"
                        loading={updateWorkflow.isPending}
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
                        disabled={duplicateWorkflow.isPending}
                        icon="link"
                        intent="ghost"
                        onClick={() => {
                          const body = duplicateWorkflowBody(
                            selected,
                            list.map((p) => p.id),
                          );
                          duplicateWorkflow.mutate(
                            { body },
                            {
                              onSuccess: () => router.push(`${basePath}/${body.id}` as Route),
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
                            kind: "workflow",
                            id: selected.id,
                            name: selected.name,
                            glyph: "flow",
                          })
                        }
                      >
                        {t("workflows.runWorkflow")}
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
              {selected.outputs.some((o) => o.type === "pr") && (
                <>
                  <Divider />
                  <Stack align="center" direction="row" gap="100">
                    <Icon name="branch" size="md" tone="dim" />
                    <Typography mono size="caption" type="note" variant="secondary">
                      {t("workflows.branchNote")}
                    </Typography>
                  </Stack>
                </>
              )}
            </Stack>
          </Panel>

          <Panel
            header={t("workflows.chainTitle")}
            headerEnd={
              editing && (
                <Button
                  icon="plus"
                  intent="ghost"
                  onClick={() => setShowPalette((v) => !v)}
                  size="sm"
                >
                  {t("forms.workflow.addStep")}
                </Button>
              )
            }
            padding="250"
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
                  onAddStep={addStepToEdit}
                  onClose={() => setShowPalette(false)}
                />
              )}
              <WorkflowCanvas
                agents={agents}
                attempts={attempts}
                graph={editing ? editGraph : detailGraph}
                onAddAgent={editing ? addAgentToEdit : noop}
                readOnly={!editing}
                setGraph={editing ? setEditGraph : noop}
              />
              {editing && (
                <StepSettings
                  excludeWorkflowId={selected.id}
                  graph={editGraph}
                  setGraph={setEditGraph}
                />
              )}
            </Container>
          </Panel>

          {(editing || selected.outputs.length > 0) && (
            <Panel header={t("workflows.outputsTitle")} padding="250">
              {editing ? (
                <OutputsEditor
                  onChange={setEditOutputs}
                  outputs={editOutputs}
                  produces={editGraph.nodes.map((n) => n.produces).filter(Boolean)}
                />
              ) : (
                <Stack gap="100">
                  {selected.outputs.map((o, i) => (
                    <Stack
                      align="center"
                      data-testid={`output-${i}`}
                      direction="row"
                      gap="100"
                      key={`${o.type}-${o.from}-${i}`}
                    >
                      <Icon
                        name={
                          o.type === "pr"
                            ? "branch"
                            : o.type === "folder"
                              ? "doc"
                              : o.dest === "vault"
                                ? "brain"
                                : "file"
                        }
                        size="md"
                        tone="dim"
                      />
                      <Typography size="caption" type="note" variant="secondary">
                        {o.type === "pr"
                          ? t("workflows.outputPr", { from: o.from })
                          : o.type === "folder"
                            ? t("workflows.outputFolder", { from: o.from, to: o.to })
                            : t(
                                o.dest === "vault"
                                  ? "workflows.outputFileVault"
                                  : "workflows.outputFileProject",
                                { from: o.from, to: o.to },
                              )}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Panel>
          )}
        </Stack>
      )}
    </Grid>
  );

  const title = routeId ? (selected?.name ?? selected?.id ?? routeId) : t("workflows.title");

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          {routeId && (
            <Breadcrumb
              items={[{ label: t("workflows.title"), href: basePath as Route }, { label: title }]}
              linkComponent={Link as SubNavLinkComponent}
            />
          )}

          <Stack wrap align="center" direction="row" gap="150" justify="between">
            <Typography type="h1">{title}</Typography>
            <Button icon="plus" intent="primary" onClick={() => setAdding(true)}>
              {t("workflows.addWorkflow")}
            </Button>
          </Stack>

          {body}
        </Stack>
      </PageContainer>

      {addModal}
    </Container>
  );
}

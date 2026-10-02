"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  Agent,
  CreateWorkflowInput,
  DepartmentId,
  UpdateWorkflowInput,
} from "@zibby/contracts";
import {
  Button,
  Container,
  Dialog,
  GraphInlineInput,
  IconTile,
  NumberField,
  SelectField,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useProjectsQuery } from "../../../projects/queries";
import type { Workflow } from "../../../../domain";
import { slug } from "../../../../utils/slug";
import { AgentPalette } from "./AgentPalette";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { StepSettings } from "./StepSettings";
import {
  INITIAL_ASSIGNMENT,
  type WorkflowGraph,
  graphToPhases,
  makeNode,
  makeStepNode,
  phasesToGraph,
  validateGraph,
} from "./workflow-graph";

export interface WorkflowDialogProps {
  mode: "create" | "edit";
  agents: Agent[];
  /** Edit mode: the workflow being edited (pre-fills name/desc and the graph). */
  initial?: Workflow;
  /** Disables the submit while the request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  /** Create mode submit. */
  onCreate?: (input: CreateWorkflowInput) => void;
  /** Edit mode submit — only the fields that actually changed. */
  onSave?: (id: string, patch: UpdateWorkflowInput) => void;
  /**
   * Create mode only: pre-fills the created workflow's `department` (Phase 85
   * Roster tab's "no workflow yet" affordance opens this dialog scoped to the
   * department it was opened from). No picker UI — the value flows straight into
   * the create payload.
   */
  defaultOwnerDepartment?: DepartmentId;
}

/**
 * The workflow authoring dialog — a node-graph canvas editor for both create and
 * edit. Agents drag from the left palette onto the canvas; arrows wire the flow
 * (output → input, carrying a hand-off filename) and rework back-edges (top port
 * → an earlier node, with max-retries + escalate). The graph is the editing
 * surface only; on submit it projects to the contract's flat `phases[]`.
 */
export function WorkflowDialog({
  mode,
  agents,
  initial,
  isPending = false,
  onClose,
  onCreate,
  onSave,
  defaultOwnerDepartment,
}: WorkflowDialogProps) {
  const t = useTranslations();
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [budget, setBudget] = useState<number | null>(initial?.budget?.maxCostUsd ?? null);
  const [project, setProject] = useState(initial?.project ?? "");
  const { data: projects = [] } = useProjectsQuery();
  const [fullscreen, setFullscreen] = useState(false);
  const [graph, setGraph] = useState<WorkflowGraph>(() => phasesToGraph(initial, agents));

  // First-phase assignment is ZIBBY-internal convention; an edited workflow keeps
  // whatever its first phase already consumed.
  const assignment = initial?.phases[0]?.consumes ?? INITIAL_ASSIGNMENT;

  const addAgent = (agentId: string, x?: number, y?: number) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setGraph((g) => {
      const i = g.nodes.length;
      const node = makeNode(agent, i + 1, x ?? 60 + i * 26, y ?? 150 + i * 18);
      return { ...g, nodes: [...g.nodes, node] };
    });
  };

  const addStep = (type: "verify" | "tool" | "workflow") =>
    setGraph((g) => {
      const i = g.nodes.length;
      return { ...g, nodes: [...g.nodes, makeStepNode(type, i + 1, 60 + i * 26, 150 + i * 18)] };
    });

  const validity = validateGraph(graph, name);
  const canSubmit = !isPending && validity.ok;
  const id = mode === "edit" && initial ? initial.id : slug(name, "novy");

  const submit = () => {
    if (!canSubmit) return;
    const description = desc.trim() || t("defaults.workflow");
    const phases = graphToPhases(graph, assignment);
    if (mode === "create") {
      onCreate?.({
        id,
        name: name.trim() || id,
        desc: description,
        instructions: description,
        phases,
        // Delivery sinks aren't edited here — configured in the .workflow.md `outputs:`.
        outputs: [],
        // NS2 F9's ladder rung isn't authored in this dialog either (same reason
        // as `outputs`), so a dialog-created workflow starts on the middle rung —
        // the contract's own default — and is graded in the `.workflow.md`.
        complexity: "standard",
        ...(defaultOwnerDepartment ? { department: defaultOwnerDepartment } : {}),
        ...(budget ? { budget: { maxCostUsd: budget, warnAtPct: 70 } } : {}),
        ...(project ? { project } : {}),
      });
      return;
    }
    if (!initial) return;
    // PATCH only what changed — storage merges the partial (keeps outputs/instructions).
    const patch: UpdateWorkflowInput = {};
    if (name.trim() !== initial.name) patch.name = name.trim();
    if (desc.trim() !== (initial.desc ?? "")) patch.desc = desc.trim();
    const initialPhases = graphToPhases(phasesToGraph(initial, agents), assignment);
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) patch.phases = phases;
    // ponytail: the contract can't unset budget/project (no null), so a cleared
    // field is simply not patched — only set/changed values are sent.
    if (budget && budget !== initial.budget?.maxCostUsd) {
      patch.budget = { maxCostUsd: budget, warnAtPct: initial.budget?.warnAtPct ?? 70 };
    }
    if (project && project !== (initial.project ?? "")) patch.project = project;
    onSave?.(initial.id, patch);
  };

  const title = mode === "create" ? t("forms.workflow.title") : t("forms.workflow.editTitle");
  const validityHint = validity.reason ? t(`forms.workflow.invalid.${validity.reason}`) : null;

  return (
    <Dialog
      open
      actions={
        <>
          <Container grow minW0>
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {validityHint ??
                t("forms.workflow.graphSummary", {
                  nodes: graph.nodes.length,
                  edges: graph.flow.length,
                  rework: graph.rework.length,
                })}
            </Typography>
          </Container>
          <Button intent="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!canSubmit}
            form="workflow-dialog-form"
            icon={mode === "create" ? "plus" : "edit"}
            intent="primary"
            loading={isPending}
            type="submit"
          >
            {mode === "create" ? t("forms.workflow.submitLabel") : t("forms.workflow.saveLabel")}
          </Button>
        </>
      }
      ariaLabel={title}
      closeLabel={t("common.close")}
      description={t("forms.workflow.subtitle")}
      fullscreen={fullscreen}
      onClose={onClose}
      title={title}
      width="full"
    >
      <Container
        as="form"
        height="100%"
        id="workflow-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        {/* topbar: name + description */}
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <GraphInlineInput
            aria-label={t("forms.workflow.nameLabel")}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("forms.workflow.namePlaceholder")}
            style={{ width: "224px" }}
            value={name}
            variant="field"
            weight="bold"
          />
          <GraphInlineInput
            aria-label={t("forms.workflow.descLabel")}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("forms.workflow.descPlaceholder")}
            style={{ flex: 1 }}
            value={desc}
            variant="field"
          />
          <Button
            aria-label={
              fullscreen ? t("forms.workflow.exitFullscreen") : t("forms.workflow.enterFullscreen")
            }
            icon={fullscreen ? "collapse" : "expand"}
            intent="ghost"
            onClick={() => setFullscreen((v) => !v)}
            size="sm"
            title={
              fullscreen ? t("forms.workflow.exitFullscreen") : t("forms.workflow.enterFullscreen")
            }
          />
        </Stack>

        {/* run-level settings: spend cap + default project */}
        <Stack align="start" direction="row" gap="150">
          <NumberField
            hint={t("forms.workflow.budgetHint")}
            label={t("forms.workflow.budgetLabel")}
            min={0}
            onValueChange={setBudget}
            step="any"
            value={budget}
          />
          <SelectField
            label={t("forms.workflow.projectLabel")}
            onValueChange={setProject}
            options={[
              { value: "", label: t("forms.workflow.projectNone") },
              ...projects.map((p) => ({ value: p.id, label: p.name ?? p.id })),
            ]}
            value={project}
          />
        </Stack>

        {/* split: agent palette + canvas + step settings */}
        <Container
          grow
          minHeight="0"
          style={{
            display: "flex",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <AgentPalette
            agents={agents}
            onAdd={(agentId) => addAgent(agentId)}
            onAddStep={addStep}
          />
          <WorkflowCanvas agents={agents} graph={graph} onAddAgent={addAgent} setGraph={setGraph} />
          <StepSettings excludeWorkflowId={initial?.id} graph={graph} setGraph={setGraph} />
        </Container>
      </Container>
    </Dialog>
  );
}

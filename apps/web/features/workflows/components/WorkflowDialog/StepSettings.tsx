"use client";
import { useTranslations } from "next-intl";
import {
  Container,
  SelectField,
  TextAreaField,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import { useSkillsQuery } from "../../../skills";
import { CommandLine } from "../../../tasks/components/CommandLine/CommandLine";
import { useWorkflowsQuery } from "../../queries/useWorkflowsQuery";
import { type GraphNode, type WorkflowGraph, orderNodes } from "./workflow-graph";

export interface StepSettingsProps {
  graph: WorkflowGraph;
  setGraph: (update: (g: WorkflowGraph) => WorkflowGraph) => void;
  /** The workflow being edited — a workflow step can never run itself. */
  excludeWorkflowId?: string;
}

/**
 * Right rail of the workflow editor: per-step settings that don't fit on a canvas
 * card — the custom prompt of an agent step (with a `/skill` tag), the commands of
 * a tool step (one per line) and the "human check after this step" checkpoint. Steps are listed in flow order.
 */
export function StepSettings({ graph, setGraph, excludeWorkflowId }: StepSettingsProps) {
  const t = useTranslations("forms.workflow");
  const { data: workflows = [] } = useWorkflowsQuery();
  const { data: skills = [] } = useSkillsQuery();
  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  const childOptions = workflows
    .filter((p) => p.id !== excludeWorkflowId)
    .map((p) => ({ value: p.id, label: p.name }));
  const patch = (id: string, change: Partial<GraphNode>) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...change } : n)) }));
  const nodes = orderNodes(graph);

  return (
    <Container
      data-testid="step-settings"
      height="100%"
      minHeight="0"
      overflowY="auto"
      padding={["100", "100", "150", "100"]}
      shrink={false}
      style={{
        borderLeft: "1px solid var(--color-border)",
        background: "var(--color-background-deep)",
      }}
      width="280px"
    >
      <Container padding={["50", "100", "100", "100"]}>
        <Typography uppercase size="2xs" type="note" variant="tertiary">
          {t("stepsTitle")}
        </Typography>
      </Container>
      {nodes.map((n, i) => {
        const name =
          n.type === "tool" ? t("typeTool") : n.type === "workflow" ? t("typeWorkflow") : n.agent;
        return (
          <Container data-testid={`step-settings-${n.id}`} key={n.id} padding={["100", "100"]}>
            <Typography mono truncate size="xs" type="note" weight="bold">
              {`${i + 1}. ${name}`}
            </Typography>
            {n.type === "workflow" && (
              <Container data-testid={`step-workflow-${n.id}`}>
                <SelectField
                  label={t("workflowLabel")}
                  onValueChange={(workflow) => patch(n.id, { workflow })}
                  options={[{ value: "", label: t("workflowPlaceholder") }, ...childOptions]}
                  value={n.workflow ?? ""}
                />
              </Container>
            )}
            {n.type === "agent" && (
              <Container
                data-testid={`step-prompt-${n.id}`}
                // Remount once the skill catalog resolves the saved skill's name, so
                // the seeded `/Name` tag matches the text.
                key={n.skill ? skillName(n.skill) : ""}
              >
                <CommandLine
                  allowSkillMentions
                  allowTargetMentions={false}
                  chrome={false}
                  initialSkill={n.skill ? { id: n.skill, name: skillName(n.skill) } : undefined}
                  initialText={n.prompt}
                  label={t("promptLabel")}
                  maxRows={8}
                  onSkillChange={(skill) => patch(n.id, { skill })}
                  onSubmit={() => {}}
                  onTextChange={(text) => patch(n.id, { prompt: text || undefined })}
                  placeholder={t("promptPlaceholder")}
                  renderTrailing={() => null}
                  resetOnSubmit={false}
                  rows={2}
                  showAttach={false}
                />
              </Container>
            )}
            {n.type === "tool" && (
              <TextAreaField
                data-testid={`step-commands-${n.id}`}
                hint={t("commandsHintTool")}
                label={t("commandsLabel")}
                onChange={(e) => patch(n.id, { commands: e.target.value })}
                placeholder={t("commandsPlaceholder")}
                rows={3}
                value={n.commands}
              />
            )}
            <ToggleField
              checked={n.approval === "ask"}
              data-testid={`step-approval-${n.id}`}
              label={t("approvalLabel")}
              onChange={(on) => patch(n.id, { approval: on ? "ask" : undefined })}
              size="sm"
            />
          </Container>
        );
      })}
    </Container>
  );
}

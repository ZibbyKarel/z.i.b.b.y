"use client";
import { useTranslations } from "next-intl";
import {
  Container,
  SelectField,
  TextAreaField,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import { usePipelinesQuery } from "../../queries/usePipelinesQuery";
import { type GraphNode, type PipelineGraph, orderNodes } from "./pipeline-graph";

export interface StepSettingsProps {
  graph: PipelineGraph;
  setGraph: (update: (g: PipelineGraph) => PipelineGraph) => void;
  /** The pipeline being edited — a workflow step can never run itself. */
  excludePipelineId?: string;
}

/**
 * Right rail of the pipeline editor: per-step settings that don't fit on a canvas
 * card — the commands of a verify/tool step (one per line) and the "human check
 * after this step" checkpoint. Steps are listed in flow order.
 */
export function StepSettings({ graph, setGraph, excludePipelineId }: StepSettingsProps) {
  const t = useTranslations("forms.pipeline");
  const { data: pipelines = [] } = usePipelinesQuery();
  const childOptions = pipelines
    .filter((p) => p.id !== excludePipelineId)
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
        <Typography mono uppercase size="2xs" tracking="widest" type="note" variant="tertiary">
          {t("stepsTitle")}
        </Typography>
      </Container>
      {nodes.map((n, i) => {
        const name =
          n.type === "verify"
            ? t("typeVerify")
            : n.type === "tool"
              ? t("typeTool")
              : n.type === "pipeline"
                ? t("typePipeline")
                : n.agent;
        return (
          <Container data-testid={`step-settings-${n.id}`} key={n.id} padding={["100", "100"]}>
            <Typography mono truncate size="xs" type="note" weight="bold">
              {`${i + 1}. ${name}`}
            </Typography>
            {n.type === "pipeline" && (
              <Container data-testid={`step-pipeline-${n.id}`}>
                <SelectField
                  label={t("pipelineLabel")}
                  onValueChange={(pipeline) => patch(n.id, { pipeline })}
                  options={[{ value: "", label: t("pipelinePlaceholder") }, ...childOptions]}
                  value={n.pipeline ?? ""}
                />
              </Container>
            )}
            {(n.type === "verify" || n.type === "tool") && (
              <TextAreaField
                data-testid={`step-commands-${n.id}`}
                hint={n.type === "verify" ? t("commandsHintVerify") : t("commandsHintTool")}
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

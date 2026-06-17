"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Agent, CreatePipelineInput, UpdatePipelineInput } from "@zibby/contracts";
import { Button, Container, Dialog, IconTile, Stack, Typography } from "@zibby/design-system";
import type { Pipeline } from "../../../../domain";
import { slug } from "../../../../utils/slug";
import { AgentPalette } from "./AgentPalette";
import { PipelineCanvas } from "./PipelineCanvas";
import {
  INITIAL_ASSIGNMENT,
  type PipelineGraph,
  graphToPhases,
  makeNode,
  phasesToGraph,
  validateGraph,
} from "./pipeline-graph";

export interface PipelineDialogProps {
  mode: "create" | "edit";
  agents: Agent[];
  /** Edit mode: the pipeline being edited (pre-fills name/desc and the graph). */
  initial?: Pipeline;
  /** Disables the submit while the request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  /** Create mode submit. */
  onCreate?: (input: CreatePipelineInput) => void;
  /** Edit mode submit — only the fields that actually changed. */
  onSave?: (id: string, patch: UpdatePipelineInput) => void;
}

/**
 * The pipeline authoring dialog — a node-graph canvas editor for both create and
 * edit. Agents drag from the left palette onto the canvas; arrows wire the flow
 * (output → input, carrying a hand-off filename) and rework back-edges (top port
 * → an earlier node, with max-retries + escalate). The graph is the editing
 * surface only; on submit it projects to the contract's flat `phases[]`.
 */
export function PipelineDialog({
  mode,
  agents,
  initial,
  isPending = false,
  onClose,
  onCreate,
  onSave,
}: PipelineDialogProps) {
  const t = useTranslations();
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [graph, setGraph] = useState<PipelineGraph>(() => phasesToGraph(initial, agents));

  // First-phase assignment is ZIBBY-internal convention; an edited pipeline keeps
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

  const validity = validateGraph(graph, name);
  const canSubmit = !isPending && validity.ok;
  const id = mode === "edit" && initial ? initial.id : slug(name, "novy");

  const submit = () => {
    if (!canSubmit) return;
    const description = desc.trim() || t("defaults.pipeline");
    const phases = graphToPhases(graph, assignment);
    if (mode === "create") {
      onCreate?.({
        id,
        name: name.trim() || id,
        desc: description,
        instructions: description,
        phases,
        // Delivery sinks aren't edited here — configured in the .pipeline.md `outputs:`.
        outputs: [],
      });
      return;
    }
    if (!initial) return;
    // PATCH only what changed — storage merges the partial (keeps outputs/instructions).
    const patch: UpdatePipelineInput = {};
    if (name.trim() !== initial.name) patch.name = name.trim();
    if (desc.trim() !== (initial.desc ?? "")) patch.desc = desc.trim();
    const initialPhases = graphToPhases(phasesToGraph(initial, agents), assignment);
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) patch.phases = phases;
    onSave?.(initial.id, patch);
  };

  const title = mode === "create" ? t("forms.pipeline.title") : t("forms.pipeline.editTitle");
  const validityHint = validity.reason ? t(`forms.pipeline.invalid.${validity.reason}`) : null;

  return (
    <Dialog
      open
      actions={
        <>
          <Container grow minW0>
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {validityHint ??
                t("forms.pipeline.graphSummary", {
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
            form="pipeline-dialog-form"
            icon={mode === "create" ? "plus" : "edit"}
            intent="primary"
            loading={isPending}
            type="submit"
          >
            {mode === "create" ? t("forms.pipeline.submitLabel") : t("forms.pipeline.saveLabel")}
          </Button>
        </>
      }
      ariaLabel={title}
      closeLabel={t("common.close")}
      description={t("forms.pipeline.subtitle")}
      onClose={onClose}
      title={title}
      width="full"
    >
      <Container
        as="form"
        height="100%"
        id="pipeline-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        {/* topbar: name + description */}
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <input
            aria-label={t("forms.pipeline.nameLabel")}
            className="w-56 rounded-sm border border-border bg-[var(--color-background-deep)] px-2 py-1 font-mono text-sm font-bold text-foreground outline-none focus:border-accent"
            onChange={(e) => setName(e.target.value)}
            placeholder={t("forms.pipeline.namePlaceholder")}
            spellCheck={false}
            value={name}
          />
          <input
            aria-label={t("forms.pipeline.descLabel")}
            className="min-w-0 flex-1 rounded-sm border border-border bg-[var(--color-background-deep)] px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-accent"
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("forms.pipeline.descPlaceholder")}
            spellCheck={false}
            value={desc}
          />
        </Stack>

        {/* split: agent palette + canvas */}
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
          <AgentPalette agents={agents} onAdd={(agentId) => addAgent(agentId)} />
          <PipelineCanvas agents={agents} graph={graph} onAddAgent={addAgent} setGraph={setGraph} />
        </Container>
      </Container>
    </Dialog>
  );
}

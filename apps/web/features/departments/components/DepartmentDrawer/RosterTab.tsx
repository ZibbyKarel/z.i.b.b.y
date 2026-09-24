"use client";

import type { Agent, RosterIntegrationRef, SubsystemWithStatus } from "@zibby/contracts";
import { Card, Container, type IconName, IconTile, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { EmptyState } from "../../../../components/EmptyState/EmptyState";
import { ModelBadge } from "../../../../components/RuntimeBadges/RuntimeBadges";
import type { Pipeline } from "../../../../domain";
import { useAgentsQuery } from "../../../agents";
import { useSubsystemRosterQuery } from "../../queries/useSubsystemRosterQuery";
import { NewPipelineDialog } from "../../../pipelines/components/NewPipelineDialog/NewPipelineDialog";
import { PipelineCanvas } from "../../../pipelines/components/PipelineDialog/PipelineCanvas";
import { PipelineDialog } from "../../../pipelines/components/PipelineDialog/PipelineDialog";
import {
  CANVAS_H,
  CANVAS_W,
  type GraphNode,
  NODE_H,
  NODE_W,
  type PipelineGraph,
  phasesToGraph,
} from "../../../pipelines/components/PipelineDialog/pipeline-graph";
import {
  useCreatePipelineMutation,
  usePipelinesQuery,
  useUpdatePipelineMutation,
} from "../../../pipelines";

export enum RosterTabTestId {
  Root = "roster-tab-root",
  PipelinePanel = "roster-pipeline-panel",
  /** The fit-to-view transform wrapper — tests read its `style.transform` to
   * assert the scale/translate derives correctly from the graph's bbox. */
  PipelineFit = "roster-pipeline-fit",
  /** Phase 124 / NS2 F1c: the "Posádka" (crew) list above the pipeline canvases. */
  CrewSection = "roster-crew-section",
  CrewRow = "roster-crew-row",
  /** NS2 F1c: owned integrations + their CI-monitor subset. */
  IntegrationSection = "roster-integration-section",
  IntegrationRow = "roster-integration-row",
  MonitorSection = "roster-monitor-section",
  MonitorRow = "roster-monitor-row",
}

export interface RosterTabProps {
  subsystem: SubsystemWithStatus;
}

/** The read-only canvas needs no editing callbacks — they never fire. */
const noop = () => {};
/**
 * Bounds each owned pipeline's canvas panel. `phasesToGraph`'s auto-layout
 * always targets the full-size `/pipelines` canvas (`CANVAS_W`/`CANVAS_H` in
 * `pipeline-graph.ts`, single node row at `y: 200`), which is far wider than
 * this drawer's ~380-440px panel — left unscaled, only the first node was
 * visible and the rest sat off-viewport (architect review, phase-85 audit).
 * `PipelineRosterCanvas` below fixes this with a fit-to-view CSS transform
 * scoped to *this* panel, so `CANVAS_HEIGHT` just needs to be "a reasonable
 * box for one scaled-down row" rather than tall enough to clear the raw
 * `y: 200` layout offset.
 */
const CANVAS_HEIGHT_PX = 340;
const CANVAS_HEIGHT = `${CANVAS_HEIGHT_PX}px`;
/** Best guess for the panel's rendered width before `ResizeObserver` reports
 * the real one (drawer is `lg:w-[380px]`, minus the `HudPanel`'s own `150`
 * padding) — keeps the *first* paint already fit instead of flashing the
 * full unscaled canvas for one frame. */
const DEFAULT_CANVAS_VIEWPORT_W = 340;
/** Inset so a node's border/shadow never touches the panel edge post-scale. */
const CANVAS_FIT_PADDING = 16;

export interface FitTransform {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Fit-to-view: scale (never up, only down — `Math.min(1, …)`) and center the
 * graph's node bounding box inside a `viewportW × viewportH` panel. Pure and
 * side-effect-free so it's unit-testable without a real layout pass — the
 * component below feeds it the panel's real measured size.
 *
 * Applied as `translate(tx, ty) scale(scale)`: CSS composes transforms
 * right-to-left, so `scale` runs first (mapping graph point `(x, y)` to
 * `(scale·x, scale·y)`), then `translate` adds `(tx, ty)` as a flat pixel
 * offset in that already-scaled space — exactly `tx = -minX·scale + centering`.
 */
export function computeFitTransform(
  nodes: readonly GraphNode[],
  viewportW: number,
  viewportH: number,
): FitTransform {
  if (nodes.length === 0 || viewportW <= 0 || viewportH <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const availW = Math.max(1, viewportW - CANVAS_FIT_PADDING * 2);
  const availH = Math.max(1, viewportH - CANVAS_FIT_PADDING * 2);
  const scale = Math.min(1, availW / bboxW, availH / bboxH);
  const tx = (viewportW - bboxW * scale) / 2 - minX * scale;
  const ty = (viewportH - bboxH * scale) / 2 - minY * scale;
  return { scale, tx, ty };
}

interface CrewRowProps {
  agent: Agent;
}

/** One crew member — mirrors the design's `VcCrew` row: avatar/glyph tile,
 * name + role, and the agent's own model as a trailing mono badge. Navigates
 * to the agent's own detail page (NS2 F1c — the crew is a stored roster now,
 * not just a read-only derivation, so it's worth a click-through). */
function CrewRow({ agent }: CrewRowProps) {
  const name = agent.name ?? agent.id;
  const role = agent.description ?? agent.category;

  return (
    <Link href={`/agents/${agent.id}` as Route}>
      <Card
        bordered
        interactive
        background="surface"
        data-testid={RosterTabTestId.CrewRow}
        radius="sm"
      >
        <Container padding="100">
          <Stack align="center" direction="row" gap="150">
            <IconTile
              alt={name}
              glyph={(agent.glyph as IconName | undefined) ?? "bot"}
              size="sm"
              src={agent.avatar}
            />
            <Container grow minW0>
              <Stack gap="25">
                <Typography truncate size="sm" type="note" weight="medium">
                  {name}
                </Typography>
                {role != null && role !== "" && (
                  <Typography truncate size="caption" type="note" variant="tertiary">
                    {role}
                  </Typography>
                )}
              </Stack>
            </Container>
            {agent.model && <ModelBadge model={agent.model} />}
          </Stack>
        </Container>
      </Card>
    </Link>
  );
}

interface IntegrationRowProps {
  integration: RosterIntegrationRef;
  testId: RosterTabTestId.IntegrationRow | RosterTabTestId.MonitorRow;
}

/** One owned integration (or monitor) — a minimal ref row (id/name/kind only,
 * per the roster contract's lean payload); no click target — integration
 * detail lives under its owning project, not a standalone route. */
function IntegrationRow({ integration, testId }: IntegrationRowProps) {
  return (
    <Card bordered background="surface" data-testid={testId} radius="sm">
      <Container padding="100">
        <Stack align="center" direction="row" gap="150" justify="between">
          <Typography truncate size="sm" type="note" weight="medium">
            {integration.name ?? integration.id}
          </Typography>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {integration.kind}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}

interface PipelineRosterCanvasProps {
  pipeline: Pipeline;
  graph: PipelineGraph;
  agents: Agent[];
  onNodeClick: () => void;
}

/**
 * One owned pipeline's read-only canvas, fit to the panel's own rendered
 * size on first paint (see `CANVAS_HEIGHT`'s doc comment above for why). A
 * `ResizeObserver` on the outer bordered `Container` tracks the panel's real
 * width (the drawer is responsive — full-width sheet below `lg`, fixed above
 * it) and re-fits on change; `DEFAULT_CANVAS_VIEWPORT_W` covers the frame
 * before that first measurement lands.
 *
 * The scale is a CSS `transform` on a wrapper `Container` around
 * `PipelineCanvas` — routed through the DS `Container`'s own `style`
 * passthrough (no raw-DOM inline style), same idiom as `SubsystemDrawer`'s
 * hero-band gradient. `pipeline-graph.ts`'s coordinate math and
 * `PipelineCanvas` itself are untouched: the transform only scales *paint*,
 * so native click hit-testing (and therefore `onNodeClick`) keeps working
 * through it — no manual coordinate math needed since the read-only canvas
 * wires no drag/edge-drop handlers that would need it.
 *
 * The transform wrapper is sized to `CANVAS_W × CANVAS_H` — `PipelineCanvas`'s
 * own root is `overflow: auto` with no explicit width, so it fills *whatever*
 * parent it's given; giving it anything narrower than the fixed-size
 * `1680×940` canvas inside it makes it scroll-clip to that narrow width
 * *before* any transform runs (a transform on an ancestor only rescales an
 * already-clipped paint, it can't retroactively grow a descendant's own
 * overflow box). Matching the wrapper to the canvas's real size means nothing
 * clips internally; the outer bordered `Container` (fixed drawer-panel size,
 * `overflow: hidden`) is what actually crops the final scaled-down paint to
 * the visible viewport.
 */
function PipelineRosterCanvas({ pipeline, graph, agents, onNodeClick }: PipelineRosterCanvasProps) {
  const boxRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({
    w: DEFAULT_CANVAS_VIEWPORT_W,
    h: CANVAS_HEIGHT_PX,
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { scale, tx, ty } = computeFitTransform(graph.nodes, viewport.w, viewport.h);

  return (
    <HudPanel data-testid={RosterTabTestId.PipelinePanel} padding="150" title={pipeline.name}>
      <Container
        height={CANVAS_HEIGHT}
        overflow="hidden"
        position="relative"
        ref={boxRef}
        style={{ border: "1px solid var(--color-border)", borderRadius: 6 }}
      >
        <Container
          data-testid={RosterTabTestId.PipelineFit}
          height={`${CANVAS_H}px`}
          left="0"
          position="absolute"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
          top="0"
          width={`${CANVAS_W}px`}
        >
          <PipelineCanvas
            readOnly
            agents={agents}
            graph={graph}
            onAddAgent={noop}
            onNodeClick={onNodeClick}
            setGraph={noop}
          />
        </Container>
      </Container>
    </HudPanel>
  );
}

/**
 * Roster tab (Phase 85, stored roster NS2 F1c): the subsystem's owned
 * pipelines rendered with the *exact same* node-graph canvas `/pipelines`
 * uses (`PipelineCanvas` + `pipeline-graph.ts`), filtered client-side to
 * `ownerSubsystem === subsystem.id` — zero new graph code, per the design doc
 * ("not a new editor"). Clicking a node opens the pipeline's existing config
 * surface: `PipelineDialog` in edit mode, the same dialog `/pipelines`
 * already ships for creating pipelines (its edit mode moved inline into that
 * page's own detail view, but the dialog itself stayed fully wired — see
 * `PipelineDialog.test.tsx`'s header comment).
 *
 * The crew (Posádka), integrations, and monitors sections read from
 * `useSubsystemRosterQuery` — the server-stored `ownerSubsystem` tags, NOT a
 * client-side derivation from pipeline phases (the old `deriveCrew`, removed
 * in F1c). The roster's agent refs are cross-referenced against the already-
 * fetched `agents` list (needed anyway for `phasesToGraph`) to hydrate the
 * crew row's glyph/model/description — keeps the roster wire payload lean
 * while the rich row rendering is unchanged. `monitors` is the subset of
 * `integrations` that are a `ci`-stream GitHub integration; the integrations
 * section below excludes them so a monitor doesn't render twice.
 */
export function RosterTab({ subsystem }: RosterTabProps) {
  const t = useTranslations("subsystems.roster");
  const tPipelines = useTranslations("pipelines");

  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();
  const { data: roster } = useSubsystemRosterQuery(subsystem.id);
  const createPipeline = useCreatePipelineMutation();
  const updatePipeline = useUpdatePipelineMutation();

  const ownedPipelines = pipelines.filter((p) => p.ownerSubsystem === subsystem.id);
  const crew = (roster?.agents ?? [])
    .map((ref) => agents.find((a) => a.id === ref.id))
    .filter((a): a is Agent => a != null);
  const monitors = roster?.monitors ?? [];
  const monitorIds = new Set(monitors.map((m) => m.id));
  const integrations = (roster?.integrations ?? []).filter((i) => !monitorIds.has(i.id));

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPipeline = ownedPipelines.find((p) => p.id === editingId);

  return (
    <Stack data-testid={RosterTabTestId.Root} gap="200">
      {crew.length > 0 && (
        <Stack data-testid={RosterTabTestId.CrewSection} gap="100">
          <Typography type="label">{t("crewTitle")}</Typography>
          {crew.map((agent) => (
            <CrewRow agent={agent} key={agent.id} />
          ))}
        </Stack>
      )}

      {integrations.length > 0 && (
        <Stack data-testid={RosterTabTestId.IntegrationSection} gap="100">
          <Typography type="label">{t("integrationsTitle")}</Typography>
          {integrations.map((integration) => (
            <IntegrationRow
              integration={integration}
              key={integration.id}
              testId={RosterTabTestId.IntegrationRow}
            />
          ))}
        </Stack>
      )}

      {monitors.length > 0 && (
        <Stack data-testid={RosterTabTestId.MonitorSection} gap="100">
          <Typography type="label">{t("monitorsTitle")}</Typography>
          {monitors.map((integration) => (
            <IntegrationRow
              integration={integration}
              key={integration.id}
              testId={RosterTabTestId.MonitorRow}
            />
          ))}
        </Stack>
      )}

      {ownedPipelines.length === 0 ? (
        <EmptyState
          actionLabel={tPipelines("addPipeline")}
          description={t("emptyDescription")}
          glyph="flow"
          onAction={() => setAdding(true)}
          title={t("emptyTitle")}
        />
      ) : (
        <Stack gap="200">
          {ownedPipelines.map((pipeline) => (
            <PipelineRosterCanvas
              agents={agents}
              graph={phasesToGraph(pipeline, agents)}
              key={pipeline.id}
              onNodeClick={() => setEditingId(pipeline.id)}
              pipeline={pipeline}
            />
          ))}
        </Stack>
      )}

      {adding && (
        <NewPipelineDialog
          agents={agents}
          defaultOwnerSubsystem={subsystem.id}
          isPending={createPipeline.isPending}
          onClose={() => setAdding(false)}
          onCreate={(body) =>
            createPipeline.mutate({ body }, { onSuccess: () => setAdding(false) })
          }
        />
      )}

      {editingPipeline && (
        <PipelineDialog
          agents={agents}
          initial={editingPipeline}
          isPending={updatePipeline.isPending}
          mode="edit"
          onClose={() => setEditingId(null)}
          onSave={(id, patch) =>
            updatePipeline.mutate(
              { params: { id }, body: patch },
              { onSuccess: () => setEditingId(null) },
            )
          }
        />
      )}
    </Stack>
  );
}

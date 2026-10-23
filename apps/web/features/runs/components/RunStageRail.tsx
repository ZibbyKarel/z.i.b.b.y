"use client";

import {
  AgentBadge,
  Container,
  Divider,
  RailItem,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useAgentSymbol } from "../../agents";
import { toClientTarget } from "../../tasks";
import { useWorkflowsQuery } from "../../workflows/queries";
import type { RunView } from "../run";
import type { StageRailRow } from "../runDetailModel";

export enum RunStageRailTestId {
  Root = "run-stage-rail",
  /** Suffixed with the phase id, e.g. `run-stage-rail-stage-coder`. */
  Stage = "run-stage-rail-stage",
  Routed = "run-stage-rail-routed",
  Checkpoint = "run-stage-rail-checkpoint",
}

export interface RunStageRailProps {
  run: RunView;
  rows: StageRailRow[];
  selectedPhaseId: string | null;
  onSelect: (phaseId: string) => void;
}

/** `SWITCHBOARD → {dept} → {unit} · {pct}%` — the switchboard's routing trace, or null when the run was never classified. */
function useRouteTrace(run: RunView): string | null {
  const t = useTranslations("runs.detail.rail");
  const departments = useDepartmentLookup();
  const c = run.classification;
  if (!c) return null;
  const dept = c.department ? departments.name(c.department) : null;
  // Delegated to a department → the unit is whatever the run resolved to; otherwise stage-1 picked it.
  const unit = dept ? (run.processor?.name ?? run.owner) : toClientTarget(c.stage1).name;
  return [t("switchboard"), dept, `${unit} · ${Math.round(c.confidence * 100)}%`]
    .filter(Boolean)
    .join(" → ");
}

/** The run's stage list (one RailItem per phase) with the ROUTED / CHECKPOINTS footer. */
export function RunStageRail({ run, rows, selectedPhaseId, onSelect }: RunStageRailProps) {
  const t = useTranslations("runs.detail");
  const route = useRouteTrace(run);
  const symbolOf = useAgentSymbol();
  // A stage row is named by its phase id; the symbol belongs to the phase's agent.
  const { data: workflows } = useWorkflowsQuery();
  const phases = run.kind === "workflow" ? workflows?.find((w) => w.id === run.owner)?.phases : [];
  const agentOf = (phaseId: string) => phases?.find((p) => p.id === phaseId)?.agent ?? phaseId;
  const checkpoints = run.checkpoints ?? [];
  const selected = selectedPhaseId ?? rows.find((r) => r.current)?.phaseId ?? null;
  const hasFooter = route || checkpoints.length > 0;

  return (
    <Stack grow data-testid={RunStageRailTestId.Root} gap="0">
      <Container padding={["150", "200", "100", "200"]}>
        <Typography as="span" type="labelSm">
          {t("rail.title", { n: String(rows.length).padStart(2, "0") })}
        </Typography>
      </Container>
      {rows.map((row) => (
        <RailItem
          data-testid={`${RunStageRailTestId.Stage}-${row.phaseId}`}
          key={row.phaseId}
          leading={<AgentBadge {...symbolOf(agentOf(row.phaseId))} />}
          meta={
            <>
              <StatusDot size="75" tone={row.state} />
              {`${t(`stage.${row.stateKey}`)} · ${row.meta}`}
            </>
          }
          onClick={() => onSelect(row.phaseId)}
          running={row.state === "working"}
          selected={row.phaseId === selected}
          title={`${row.n} · ${row.name}`}
        />
      ))}
      <Container grow />
      {hasFooter && (
        <>
          <Divider />
          <Container padding={["150", "200"]}>
            <Stack gap="75">
              {route && (
                <Stack data-testid={RunStageRailTestId.Routed} gap="75">
                  <Typography as="span" type="labelSm">
                    {t("rail.routed")}
                  </Typography>
                  <Typography mono as="span" size="xs" type="note" variant="secondary">
                    {route}
                  </Typography>
                </Stack>
              )}
              {checkpoints.length > 0 && (
                <Typography as="span" type="labelSm">
                  {t("rail.checkpoints")}
                </Typography>
              )}
              {checkpoints.map((c) => (
                <Stack
                  data-testid={RunStageRailTestId.Checkpoint}
                  direction="row"
                  justify="between"
                  key={`${c.phaseId}-${c.sha}`}
                >
                  <Typography mono as="span" size="xs" type="note" variant="secondary">
                    {c.phaseId}
                  </Typography>
                  <Typography mono as="span" size="xs" type="note" variant="secondary">
                    {c.sha.slice(0, 7)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Container>
        </>
      )}
    </Stack>
  );
}

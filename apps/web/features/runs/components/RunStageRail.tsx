"use client";

import {
  AgentBadge,
  Container,
  Divider,
  Pressable,
  RailItem,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useAgentSymbol } from "../../agents";
import { toClientTarget } from "../../tasks";
import type { RunView } from "../run";
import type { StageRailRow } from "../runDetailModel";

export enum RunStageRailTestId {
  Root = "run-stage-rail",
  /** Suffixed with the phase id, e.g. `run-stage-rail-stage-coder`. */
  Stage = "run-stage-rail-stage",
  Routed = "run-stage-rail-routed",
  Checkpoint = "run-stage-rail-checkpoint",
  OpenFolder = "run-stage-rail-open-folder",
}

export interface RunStageRailProps {
  run: RunView;
  rows: StageRailRow[];
  selectedPhaseId: string | null;
  onSelect: (phaseId: string) => void;
  onOpenFolder?: () => void;
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

/** The run's stage list (one RailItem per phase) with the ROUTED / CHECKPOINTS / OPEN TASK FOLDER footer. */
export function RunStageRail({
  run,
  rows,
  selectedPhaseId,
  onSelect,
  onOpenFolder,
}: RunStageRailProps) {
  const t = useTranslations("runs.detail");
  const route = useRouteTrace(run);
  const symbolOf = useAgentSymbol();
  const checkpoints = run.checkpoints ?? [];
  const selected = selectedPhaseId ?? rows.find((r) => r.current)?.phaseId ?? null;
  const showFolder = run.kind === "workflow" && onOpenFolder;
  const hasFooter = route || checkpoints.length > 0 || showFolder;

  return (
    <Stack grow data-testid={RunStageRailTestId.Root} gap="0">
      <Container padding={["150", "200", "100", "200"]}>
        <Typography as="span" type="labelSm">
          {`${t("rail.title", { n: String(rows.length).padStart(2, "0") })} · ${run.owner.toUpperCase()}`}
        </Typography>
      </Container>
      {rows.map((row) => (
        <RailItem
          data-testid={`${RunStageRailTestId.Stage}-${row.phaseId}`}
          key={row.phaseId}
          leading={<AgentBadge {...symbolOf(row.name)} />}
          meta={
            <>
              <StatusDot size="75" tone={row.state} />
              {`${t(`stage.${row.stateKey}`)} · ${row.meta}`}
            </>
          }
          onClick={() => onSelect(row.phaseId)}
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
              {showFolder && (
                // Row wrapper: a stretched <button> centres its label; the design left-aligns it.
                <Stack direction="row">
                  <Pressable data-testid={RunStageRailTestId.OpenFolder} onClick={onOpenFolder}>
                    <Typography as="span" type="labelSm" variant="primary">
                      {t("rail.openFolder")}
                    </Typography>
                  </Pressable>
                </Stack>
              )}
            </Stack>
          </Container>
        </>
      )}
    </Stack>
  );
}

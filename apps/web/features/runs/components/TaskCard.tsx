import {
  Card,
  Container,
  Icon,
  type IconName,
  Stack,
  Typography,
} from "@zibby/design-system";
import { type RunView, runTitle } from "../run";
import { RunStateBadge } from "./RunStateBadge";

export interface TaskCardProps {
  run: RunView;
  /** Glyph of the routed agent/pipeline (or the kind fallback). */
  glyph: IconName;
  selected: boolean;
  stateLabel: string;
  startedLabel: string;
  onSelect: (id: string) => void;
}

/**
 * One row in the task feed (master list). Task-first: what the user asked for is
 * the headline; the routed agent/pipeline is just a small glyph + id in the
 * footer next to state and time.
 */
export function TaskCard({
  run,
  glyph,
  selected,
  stateLabel,
  startedLabel,
  onSelect,
}: TaskCardProps) {
  const live = run.status === "running" || run.status === "awaiting-approval";
  const headline = runTitle(run);
  return (
    <Card
      as="button"
      corners={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
      tone={live ? (run.status === "running" ? "run" : "warn") : undefined}
    >
      <Container padding="200">
        <Stack gap="100">
          <Typography mono truncate type="note" weight="bold">
            {headline}
          </Typography>
          {run.prompt && run.prompt !== headline && (
            <Typography truncate size="sm" type="text" variant="secondary">
              {run.prompt}
            </Typography>
          )}
          <Stack align="center" direction="row" gap="100" justify="between">
            <RunStateBadge
              canonTitle={run.status}
              label={stateLabel}
              status={run.status}
            />
            <Stack align="center" direction="row" gap="50">
              {run.owner && <Icon name={glyph} size="xs" tone="faint" />}
              <Typography mono size="2xs" type="note" variant="tertiary">
                {run.owner ? `${run.owner} · ` : ""}
                {run.project ? `${run.project} · ` : ""}
                {startedLabel}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

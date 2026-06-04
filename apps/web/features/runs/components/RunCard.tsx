import { Card, Container, Icon, type IconName, Progress, Stack, Typography } from "@zibby/design-system";
import type { RunView } from "../run";
import { RunStateBadge } from "./RunStateBadge";

export interface RunCardProps {
  run: RunView;
  glyph: IconName;
  selected: boolean;
  stateLabel: string;
  kindLabel: string;
  startedLabel: string;
  onSelect: (id: string) => void;
}

/** One row in the runs feed (master list). */
export function RunCard({
  run,
  glyph,
  selected,
  stateLabel,
  kindLabel,
  startedLabel,
  onSelect,
}: RunCardProps) {
  const showBar = run.pct !== null && (run.status === "running" || run.status === "awaiting-approval");
  return (
    <Card
      corners
      as="button"
      background="panel"
      onClick={() => onSelect(run.runId)}
      radius="sm"
      selected={selected}
    >
      <Container padding="200">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100">
            <Icon name={glyph} size="sm" tone="accent" />
            <Container minW0>
              <Typography mono truncate type="note" weight="bold">
                {run.owner}
              </Typography>
            </Container>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {kindLabel}
            </Typography>
          </Stack>
          {run.prompt && (
            <Typography truncate size="sm" type="text" variant="secondary">
              {run.prompt}
            </Typography>
          )}
          {showBar && (
            <Stack align="center" direction="row" gap="100">
              <Container grow>
                <Progress glow tone={run.status === "awaiting-approval" ? "warn" : "accent"} value={run.pct ?? 0} />
              </Container>
              <Typography mono size="2xs" tone={run.status === "awaiting-approval" ? "warn" : "accent"} type="note" weight="semibold">
                {run.pct}%
              </Typography>
            </Stack>
          )}
          <Stack align="center" direction="row" gap="100" justify="between">
            <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />
            <Typography mono size="2xs" type="note" variant="tertiary">
              {run.project ? `${run.project} · ` : ""}
              {startedLabel}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

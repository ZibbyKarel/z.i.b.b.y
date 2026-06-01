import {
  Container,
  Divider,
  Icon,
  IconTile,
  Progress,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { RunningAgent } from "../../../domain";

export interface AgentRowProps {
  agent: RunningAgent;
  onStop?: (agent: RunningAgent) => void;
  /** Render the trailing hairline (omit on the last row of a list). */
  divider?: boolean;
}

export function AgentRow({ agent, onStop, divider = true }: AgentRowProps) {
  const tone = agent.ctx === "work" ? "work" : "home";
  return (
    <>
      <Container padding={["150", "0"]}>
        <Stack direction="row" align="center" gap="150">
          <StatusDot tone={tone} pulse />
          <Container grow minW0>
            <Stack gap="25">
              <Stack direction="row" align="baseline" gap="100">
                <Typography type="note" mono size="base" weight="semibold" nowrap>
                  {agent.skill}
                </Typography>
                <Container minW0>
                  <Typography type="note" mono size="sm" variant="tertiary" truncate>
                    · {agent.project}
                  </Typography>
                </Container>
              </Stack>
              <Typography type="note" size="caption" variant="secondary" truncate>
                {agent.prompt}
              </Typography>
              <Stack direction="row" align="center" gap="100">
                <Container grow minW0>
                  <Progress
                    value={agent.pct}
                    tone="accent"
                    height="50"
                    glow
                    label={`postup ${agent.skill}`}
                  />
                </Container>
                <Typography type="note" mono size="sm" weight="semibold" tone="accent">
                  {agent.pct}%
                </Typography>
              </Stack>
            </Stack>
          </Container>
          <IconTile
            as="button"
            interactive
            tone="neutral"
            size="sm"
            radius="default"
            aria-label={`Zastavit ${agent.skill}`}
            onClick={() => onStop?.(agent)}
          >
            <Icon name="stop" size="xs" />
          </IconTile>
        </Stack>
      </Container>
      {divider && <Divider />}
    </>
  );
}

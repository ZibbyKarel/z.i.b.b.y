import { useTranslations } from "next-intl";
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
  const t = useTranslations("agents");
  return (
    <>
      <Container padding={["150", "0"]}>
        <Stack align="center" direction="row" gap="150">
          <StatusDot pulse tone="accent" />
          <Container grow minW0>
            <Stack gap="25">
              <Stack align="baseline" direction="row" gap="100">
                <Typography mono nowrap size="base" type="note" weight="semibold">
                  {agent.skill}
                </Typography>
                <Container minW0>
                  <Typography mono truncate size="sm" type="note" variant="tertiary">
                    · {agent.project}
                  </Typography>
                </Container>
              </Stack>
              <Typography truncate size="caption" type="note" variant="secondary">
                {agent.prompt}
              </Typography>
              <Stack align="center" direction="row" gap="100">
                <Container grow minW0>
                  <Progress
                    glow
                    height="50"
                    label={t("progressAria", { skill: agent.skill })}
                    tone="accent"
                    value={agent.pct}
                  />
                </Container>
                <Typography mono size="sm" tone="accent" type="note" weight="semibold">
                  {agent.pct}%
                </Typography>
              </Stack>
            </Stack>
          </Container>
          <IconTile
            interactive
            aria-label={t("stopAria", { skill: agent.skill })}
            as="button"
            onClick={() => onStop?.(agent)}
            radius="default"
            size="sm"
            tone="neutral"
          >
            <Icon name="stop" size="xs" />
          </IconTile>
        </Stack>
      </Container>
      {divider && <Divider />}
    </>
  );
}

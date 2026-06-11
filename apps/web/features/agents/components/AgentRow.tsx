import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  Icon,
  IconTile,
  Pressable,
  Progress,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { DotTone, ProgressTone } from "@zibby/design-system";
import type { AgentRun } from "@zibby/contracts";

export interface AgentRowProps {
  run: AgentRun;
  /** Open the run's detail (log viewer). Wraps the row body in a button when set. */
  onOpen?: (run: AgentRun) => void;
  onStop?: (run: AgentRun) => void;
  /** Render the trailing hairline (omit on the last row of a list). */
  divider?: boolean;
}

/** Color = state: running has its own color, distinct from the accent. */
const statusDotTone: Record<AgentRun["status"], DotTone> = {
  running: "run",
  done: "ok",
  error: "bad",
  interrupted: "idle",
  "awaiting-approval": "wait",
};

const statusBarTone: Record<AgentRun["status"], ProgressTone> = {
  running: "run",
  done: "ok",
  error: "bad",
  interrupted: "warn",
  "awaiting-approval": "warn",
};

/** Live states — the only ones that pulse. */
const liveStatuses: ReadonlySet<AgentRun["status"]> = new Set([
  "running",
  "awaiting-approval",
]);

export function AgentRow({ run, onOpen, onStop, divider = true }: AgentRowProps) {
  const t = useTranslations("agents");
  const name = run.agentId;

  const body = (
    <Stack gap="25">
      <Stack align="baseline" direction="row" gap="100">
        <Typography mono nowrap size="base" type="note" weight="semibold">
          {name}
        </Typography>
        <Container minW0>
          <Typography mono truncate size="sm" type="note" variant="tertiary">
            · {run.project}
          </Typography>
        </Container>
      </Stack>
      <Typography truncate size="caption" type="note" variant="secondary">
        {run.prompt}
      </Typography>
      <Stack align="center" direction="row" gap="100">
        <Container grow minW0>
          <Progress
            height="50"
            label={t("progressAria", { skill: name })}
            tone={statusBarTone[run.status]}
            value={run.pct}
          />
        </Container>
        <Typography mono size="sm" tone="accent" type="note" weight="semibold">
          {run.pct}%
        </Typography>
      </Stack>
    </Stack>
  );

  return (
    <>
      <Container padding={["150", "0"]}>
        <Stack align="center" direction="row" gap="150">
          <StatusDot pulse={liveStatuses.has(run.status)} tone={statusDotTone[run.status]} />
          <Container grow minW0>
            {onOpen ? (
              <Stack>
                <Pressable aria-label={t("openAria", { name })} onClick={() => onOpen(run)}>
                  <Container textAlign="left">{body}</Container>
                </Pressable>
              </Stack>
            ) : (
              body
            )}
          </Container>
          <IconTile
            interactive
            aria-label={t("stopAria", { skill: name })}
            as="button"
            onClick={() => onStop?.(run)}
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

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
import type { AgentRun } from "@zibby/contracts";

export interface AgentRowProps {
  run: AgentRun;
  /** Open the run's detail (log viewer). Wraps the row body in a button when set. */
  onOpen?: (run: AgentRun) => void;
  onStop?: (run: AgentRun) => void;
  /** Render the trailing hairline (omit on the last row of a list). */
  divider?: boolean;
}

/** Literal union assignable to both StatusDot's `DotTone` and Progress's `ProgressTone`. */
const statusTone: Record<AgentRun["status"], "accent" | "ok" | "bad" | "warn"> = {
  running: "accent",
  done: "ok",
  error: "bad",
  interrupted: "warn",
  // Phase 3: paused on an approval — amber, like an interrupted-but-recoverable run.
  "awaiting-approval": "warn",
};

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
            glow
            height="50"
            label={t("progressAria", { skill: name })}
            tone={statusTone[run.status]}
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
          <StatusDot pulse={run.status === "running"} tone={statusTone[run.status]} />
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

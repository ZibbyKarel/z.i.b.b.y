import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  Icon,
  Panel,
  Progress,
  type ProgressTone,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useRunLog } from "../useRunLog";
import { RunTranscript } from "./RunTranscript";

export interface RunLogStreamProps {
  /** The run whose log to tail (an agent run id, or a goal child's runRef). */
  runId: string;
  /** Whether the run is still producing output (drives the live caret + label). */
  live: boolean;
  liveLabel: string;
  logLabel: string;
  linesLabel: (n: number) => string;
  /**
   * The run's completion percentage (0-100) — renders the v-runs.png "ŽIVÝ LOG"
   * footer progress bar + `NN%` label. Omit (a folded goal-iteration maker/
   * verifier log has no run-level percentage of its own) to render no footer.
   */
  pct?: number | null;
  /** Tone for the footer bar/label — the run's state-tone (`run` while live). */
  tone?: ProgressTone;
}

/**
 * Live, offset-polled log tail for a run — appends as the backend file grows.
 * Ref-driven (id + live) so any holder of a bare run id can mount it — a run detail,
 * or a folded goal-iteration child (Phase 27). The log is read from the unified
 * `/api/tasks/runs/:runId/logs` surface. Mount with `key={runId}`.
 */
export function RunLogStream({
  runId,
  live,
  liveLabel,
  logLabel,
  linesLabel,
  pct,
  tone = "run",
}: RunLogStreamProps) {
  const { text, done } = useRunLog(runId);
  const lineCount = text ? text.replace(/\n$/, "").split("\n").length : 0;
  const t = useTranslations("runs");

  return (
    <Panel
      header={
        <>
          <Icon name="pulse" size="sm" tone={live ? "accent" : "faint"} />
          <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="secondary">
            {live ? liveLabel : logLabel}
          </Typography>
        </>
      }
      headerEnd={
        <Typography mono size="2xs" type="note" variant="tertiary">
          {linesLabel(lineCount)}
        </Typography>
      }
      live={live}
    >
      <RunTranscript
        live={live && !done}
        maxHeight="viewport"
        placeholder={`${liveLabel}…`}
        scrollKey={text}
        text={text.replace(/\n$/, "")}
        toggleLabel={t("toggleToolOutput")}
      />
      {pct != null && (
        <>
          <Divider />
          <Container padding="150">
            <Stack align="center" direction="row" gap="100">
              <Container grow>
                <Progress tone={tone} value={pct} />
              </Container>
              <Typography mono size="2xs" tone={tone} type="note">
                {pct}%
              </Typography>
            </Stack>
          </Container>
        </>
      )}
    </Panel>
  );
}

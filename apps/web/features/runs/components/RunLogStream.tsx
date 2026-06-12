import { CodeBlock, Icon, Panel, Typography } from "@zibby/design-system";
import type { RunView } from "../run";
import { useRunLog } from "../useRunLog";

export interface RunLogStreamProps {
  run: RunView;
  liveLabel: string;
  logLabel: string;
  linesLabel: (n: number) => string;
}

/** Live, offset-polled log tail for a run — appends as the backend file grows. */
export function RunLogStream({
  run,
  liveLabel,
  logLabel,
  linesLabel,
}: RunLogStreamProps) {
  const { text, done } = useRunLog(run.runId, run.logBase);
  const live = run.status === "running";
  const lineCount = text ? text.replace(/\n$/, "").split("\n").length : 0;

  return (
    <Panel
      header={
        <>
          <Icon name="pulse" size="sm" tone={live ? "accent" : "faint"} />
          <Typography
            mono
            uppercase
            size="2xs"
            tracking="wide"
            type="note"
            variant="secondary"
          >
            {live ? liveLabel : logLabel}
          </Typography>
        </>
      }
      headerEnd={
        <Typography mono size="2xs" type="note" variant="tertiary">
          {linesLabel(lineCount)}
        </Typography>
      }
    >
      <CodeBlock
        followTail
        caret={live && !done}
        maxHeight="viewport"
        placeholder={`${liveLabel}…`}
        scrollKey={text}
        text={text.replace(/\n$/, "")}
      />
    </Panel>
  );
}

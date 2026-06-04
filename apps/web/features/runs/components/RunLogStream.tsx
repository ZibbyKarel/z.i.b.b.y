import { useEffect, useRef } from "react";
import { Container, Icon, Typography } from "@zibby/design-system";
import { useRunLog } from "../useRunLog";
import type { RunView } from "../run";

export interface RunLogStreamProps {
  run: RunView;
  liveLabel: string;
  logLabel: string;
  linesLabel: (n: number) => string;
}

const MONO = "var(--font-mono, ui-monospace, monospace)";

/** Live, offset-polled log tail for a run — appends as the backend file grows. */
export function RunLogStream({ run, liveLabel, logLabel, linesLabel }: RunLogStreamProps) {
  const { text, done } = useRunLog(run.runId, run.logBase);
  const scrollRef = useRef<HTMLDivElement>(null);
  const live = run.status === "running";
  const lines = text ? text.replace(/\n$/, "").split("\n") : [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-background)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <Icon name="pulse" size="sm" tone={live ? "accent" : "faint"} />
        <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="secondary">
          {live ? liveLabel : logLabel}
        </Typography>
        <span style={{ marginLeft: "auto" }}>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {linesLabel(lines.length)}
          </Typography>
        </span>
      </div>
      <div ref={scrollRef} style={{ maxHeight: 340, overflow: "auto", padding: "0.75rem", fontFamily: MONO, fontSize: 12, lineHeight: 1.7 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ color: "var(--color-foreground)", whiteSpace: "pre-wrap" }}>
            {line}
          </div>
        ))}
        {live && !done && <span style={{ color: "var(--color-accent)" }}>▍</span>}
        {lines.length === 0 && (
          <Container>
            <Typography mono size="xs" type="note" variant="tertiary">
              {liveLabel}…
            </Typography>
          </Container>
        )}
      </div>
    </div>
  );
}

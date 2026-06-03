"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Container,
  Dialog,
  IconTile,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { AgentRun } from "@zibby/contracts";
import { useRunLogQuery } from "../queries";

export interface RunLogModalProps {
  run: AgentRun;
  onClose: () => void;
}

/**
 * Live log viewer for a single run. Tails the backend log via {@link useRunLogQuery}
 * (offset polling) and auto-scrolls as output arrives. A local composite — the DS
 * has no log/terminal primitive and this isn't reused yet; promote to the DS only
 * if a second consumer appears.
 */
export function RunLogModal({ run, onClose }: RunLogModalProps) {
  const t = useTranslations("runLog");
  const { text, done } = useRunLogQuery(run.runId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <Dialog
      open
      ariaLabel={t("aria", { agent: run.agentId })}
      closeLabel={t("close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="pulse" size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {run.agentId}
            </Typography>
            <Typography mono size="sm" type="note" variant="secondary">
              {run.runId}
            </Typography>
          </Container>
        </Stack>
      }
      width="lg"
    >
      <Stack gap="150">
        <div
          ref={scrollRef}
          style={{
            maxHeight: "55vh",
            overflow: "auto",
            background: "var(--color-background)",
            borderRadius: "var(--radius-sm)",
            padding: "0.75rem 1rem",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text || t("waiting")}
          </pre>
        </div>
        <Stack align="center" direction="row" gap="100">
          <StatusDot pulse={!done} tone={done ? "ok" : "accent"} />
          <Typography mono size="sm" type="note" variant="secondary">
            {done ? t("finished") : t("streaming")}
          </Typography>
        </Stack>
      </Stack>
    </Dialog>
  );
}

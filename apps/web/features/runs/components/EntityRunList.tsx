"use client";

import { Pressable, Stack, StatePill, type StateTone, Tag, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { compactAgo } from "../../../utils/time";

export enum EntityRunListTestId {
  Root = "entity-run-list",
  Row = "entity-run-row",
  Latest = "entity-run-latest",
}

export interface EntityRunRow {
  /** The run detail id (`runRef ?? taskId`). */
  id: string;
  label: string;
  stateLabel: string;
  tone: StateTone;
  startedAt: string;
  finishedAt?: string;
  auto?: boolean;
}

export interface EntityRunListProps {
  rows: readonly EntityRunRow[];
  onOpen: (runId: string) => void;
}

/** The runs of one issue / PR, newest first; the latest is emphasised. Empty → nothing. */
export function EntityRunList({ rows, onOpen }: EntityRunListProps) {
  const t = useTranslations("runs.entity");
  const [now] = useState(() => Date.now());
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return (
    <Stack data-testid={EntityRunListTestId.Root} gap="100">
      {sorted.map((r, i) => (
        <Pressable
          aria-label={`${r.label} · ${r.stateLabel}`}
          data-latest={i === 0 || undefined}
          data-testid={EntityRunListTestId.Row}
          key={`${r.id}:${r.startedAt}`}
          onClick={() => onOpen(r.id)}
        >
          <Stack wrap align="center" direction="row" gap="150">
            <StatePill label={r.stateLabel} state={r.tone} />
            <Typography as="span" type="label" variant={i === 0 ? "primary" : "secondary"}>
              {r.label}
            </Typography>
            {r.auto ? (
              <Typography as="span" type="labelSm" variant="secondary">
                {t("auto")}
              </Typography>
            ) : null}
            {i === 0 ? (
              <Tag data-testid={EntityRunListTestId.Latest} tone="accent">
                {t("latest")}
              </Tag>
            ) : null}
            <Typography as="span" type="labelSm" variant="secondary">
              {compactAgo(r.startedAt, now)}
            </Typography>
          </Stack>
        </Pressable>
      ))}
    </Stack>
  );
}

/** PR action state → tone. */
export function prRunTone(state: string): StateTone {
  switch (state) {
    case "running":
      return "working";
    case "awaiting-approval":
      return "blocked";
    case "posted":
    case "pushed":
      return "done";
    case "failed":
      return "error";
    default:
      return "idle"; // discarded
  }
}

/** Issue run outcome → tone. */
export function issueRunTone(outcome: string): StateTone {
  switch (outcome) {
    case "running":
      return "working";
    case "awaiting-merge":
      return "blocked";
    case "done":
      return "done";
    case "failed":
      return "error";
    default:
      return "idle";
  }
}

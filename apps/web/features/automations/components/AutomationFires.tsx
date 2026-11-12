"use client";

import type { AutomationFire } from "@zibby/contracts";
import {
  Pressable,
  Stack,
  StatePill,
  type StateTone,
  Typography,
  normalizeStateTone,
} from "@zibby/design-system";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { formatDuration } from "../../../utils/time";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runStateTone } from "../../runs/run";
import { useAutomationFiresQuery } from "../queries";
import { SCHEDULE_TIME_ZONE } from "../schedule";
import { AutomationFireLog } from "./AutomationFireLog";

export enum AutomationFiresTestId {
  List = "automation-fires-list",
  Row = "automation-fires-row",
  Status = "automation-fires-status",
  Log = "automation-fire-log",
  OpenRun = "automation-fire-open-run",
}

const STATUS_TONE: Record<AutomationFire["status"], StateTone> = {
  running: "working",
  done: "done",
  error: "error",
};

/**
 * A fire's status as a localized `StatePill` (shared by the history and the sheet). A
 * run-backed fire's own "done" only means "dispatched", so it shows its run's state — or
 * "Dispatched" while that run isn't in the runs cache.
 */
export function AutomationFireStatus({ fire }: { fire: AutomationFire }) {
  const t = useTranslations("automations");
  const tRuns = useTranslations("runs");
  const { runs } = useRunsQuery();
  const run = fire.runRef ? runs.find((r) => r.runId === fire.runRef) : undefined;
  const [label, state] = run
    ? [tRuns(`state.${run.status}`), normalizeStateTone(runStateTone(run.status) ?? "idle")]
    : fire.runRef && fire.status === "done"
      ? [t("fireStatus.dispatched"), "idle" as const]
      : [t(`fireStatus.${fire.status}`), STATUS_TONE[fire.status]];
  return (
    <span data-testid={AutomationFiresTestId.Status}>
      <StatePill label={label} state={state} />
    </span>
  );
}

export interface AutomationFiresProps {
  automationId: string;
}

/**
 * The automation detail's "Runs" history (todo-4): every recorded fire newest first
 * (time, source, status, duration, result/error); selecting one shows its log below.
 * Kept live by the `automation-fires` events scope — no polling.
 */
export function AutomationFires({ automationId }: AutomationFiresProps) {
  const t = useTranslations("automations");
  const format = useFormatter();
  const { data } = useAutomationFiresQuery(automationId);
  const fires = data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fires.find((f) => f.id === selectedId) ?? fires[0];

  return (
    <Stack data-testid={AutomationFiresTestId.List} gap="150">
      {fires.length === 0 ? (
        <Typography size="sm" type="note" variant="secondary">
          {t("firesEmpty")}
        </Typography>
      ) : (
        fires.map((fire) => (
          <Pressable
            aria-pressed={fire.id === selected?.id}
            data-testid={AutomationFiresTestId.Row}
            key={fire.id}
            onClick={() => setSelectedId(fire.id)}
          >
            <Stack align="center" direction="row" gap="150">
              <Typography mono size="sm" type="note">
                {format.dateTime(new Date(fire.startedAt), {
                  dateStyle: "short",
                  timeStyle: "short",
                  hourCycle: "h23",
                  timeZone: SCHEDULE_TIME_ZONE,
                })}
              </Typography>
              <Typography size="sm" type="note" variant="secondary">
                {t(`fireSource.${fire.source}`)}
              </Typography>
              <AutomationFireStatus fire={fire} />
              {fire.durationMs !== undefined && (
                <Typography mono size="sm" type="note" variant="tertiary">
                  {formatDuration(fire.durationMs)}
                </Typography>
              )}
              <Typography truncate size="sm" type="note" variant="secondary">
                {fire.error ?? fire.result ?? ""}
              </Typography>
            </Stack>
          </Pressable>
        ))
      )}
      {selected && <AutomationFireLog fire={selected} key={selected.id} />}
    </Stack>
  );
}

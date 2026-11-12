"use client";

import type { AutomationFire } from "@zibby/contracts";
import { Pressable, Stack, StatePill, type StateTone, Typography } from "@zibby/design-system";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { formatDuration } from "../../../utils/time";
import { useAutomationFiresQuery } from "../queries";
import { SCHEDULE_TIME_ZONE } from "../schedule";
import { AutomationFireLog, AutomationFiresTestId } from "./AutomationFireLog";

export { AutomationFiresTestId };

const STATUS_TONE: Record<AutomationFire["status"], StateTone> = {
  running: "working",
  done: "done",
  error: "error",
};

/** A fire's status as a localized `StatePill` (shared by the history and the sheet). */
export function AutomationFireStatus({ fire }: { fire: AutomationFire }) {
  const t = useTranslations("automations");
  return (
    <span data-testid={AutomationFiresTestId.Status}>
      <StatePill label={t(`fireStatus.${fire.status}`)} state={STATUS_TONE[fire.status]} />
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

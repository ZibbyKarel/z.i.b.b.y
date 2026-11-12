"use client";

import type { Automation } from "@zibby/contracts";
import {
  AnchoredSheet,
  SheetAction,
  SheetBlock,
  SheetSection,
  SheetText,
  Stack,
} from "@zibby/design-system";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTriggerAutomationMutation } from "../../../automations/mutations";
import { useAutomationsQuery } from "../../../automations/queries";
import { useCronLabel } from "../../../automations/useCronLabel";
import { SCHEDULE_TIME_ZONE } from "../../../automations/schedule";
import { AutomationFireLog } from "../../../automations/components/AutomationFireLog";
import { AutomationFireStatus } from "../../../automations/components/AutomationFires";
import { formatDuration } from "../../../../utils/time";
import { type SheetProps, geometry } from "./sheetTypes";

export enum AutomationSheetTestId {
  Schedule = "automation-sheet-schedule",
  Prompt = "automation-sheet-prompt",
  RunNow = "automation-sheet-run-now",
  /** The latest fire's summary line (status · start · duration) — todo-5. */
  LastFire = "automation-sheet-last-fire",
}

/** What the automation fires, as one short label. */
function targetLabel(target: Automation["target"]): string {
  if (target.type === "agent") return `agent · ${target.agentId}`;
  if (target.type === "workflow") return `workflow · ${target.workflowId}`;
  if (target.type === "task") return target.target?.name ?? target.text;
  return target.type;
}

/**
 * Automation detail (Bridge "Automation runs" widget): schedule, target, prompt and last run,
 * with "Run now" top-right — the same `POST /automations/:id/trigger` as the automations page.
 */
export function AutomationSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const a = useTranslations("bridge.widgets.automationRuns");
  const router = useRouter();
  const format = useFormatter();
  const cronLabel = useCronLabel();
  const { data: automations } = useAutomationsQuery();
  const trigger = useTriggerAutomationMutation();

  const automation = automations?.find((x) => x.id === id);
  if (!automation) return null;
  const { trigger: when, prompt, lastFiredAt, lastFire } = automation;
  const stamp = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: "short",
      timeStyle: "short",
      hourCycle: "h23",
      timeZone: SCHEDULE_TIME_ZONE,
    });

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        <SheetAction
          data-testid={AutomationSheetTestId.RunNow}
          disabled={trigger.isPending}
          intent="primary"
          onClick={() => trigger.mutate({ params: { id }, body: {} })}
        >
          {a("runNow")}
        </SheetAction>
      }
      chips={[targetLabel(automation.target), ...(automation.enabled ? [] : [a("disabled")])]}
      closeLabel={t("bridge.sheet.close")}
      kind={t("bridge.sheet.kind.automation")}
      onClose={onClose}
      onTitleClick={() => router.push(`/work/automations/${encodeURIComponent(id)}` as Route)}
      title={automation.name ?? automation.id}
    >
      <SheetSection>
        {when.type === "cron" ? (
          <SheetBlock label={a("schedule")}>
            <div data-testid={AutomationSheetTestId.Schedule}>
              <SheetText lines={[cronLabel(when.expr)]} />
            </div>
          </SheetBlock>
        ) : null}
        {prompt ? (
          <SheetBlock label={a("prompt")}>
            <div data-testid={AutomationSheetTestId.Prompt}>
              <SheetText lines={prompt.split("\n")} />
            </div>
          </SheetBlock>
        ) : null}
        <SheetBlock label={a("lastFired")}>
          {lastFire ? (
            // todo-5: the latest fire — status · start · duration, then its log (live
            // while running) or, for a run-backed fire, a link to the run.
            <Stack gap="100">
              <div data-testid={AutomationSheetTestId.LastFire}>
                <Stack align="center" direction="row" gap="100">
                  <AutomationFireStatus fire={lastFire} />
                  <SheetText
                    lines={[
                      [
                        stamp(lastFire.startedAt),
                        lastFire.durationMs === undefined
                          ? undefined
                          : formatDuration(lastFire.durationMs),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    ]}
                  />
                </Stack>
              </div>
              <AutomationFireLog fire={lastFire} key={lastFire.id} />
            </Stack>
          ) : (
            <SheetText lines={[lastFiredAt ? stamp(lastFiredAt) : a("never")]} />
          )}
        </SheetBlock>
      </SheetSection>
    </AnchoredSheet>
  );
}

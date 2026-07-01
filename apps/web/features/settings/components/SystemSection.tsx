"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Divider, NumberField, Stack, ToggleField, Typography } from "@zibby/design-system";
import type { SystemConfig } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";

/** Testids for the system config editor (the screen + tests select via these). */
export enum SystemSectionTestId {
  TaskTick = "system-task-tick",
  ChannelTick = "system-channel-tick",
  MonitorTick = "system-monitor-tick",
  AutomationTick = "system-automation-tick",
  LimitResumeTick = "system-limit-resume-tick",
  LimitResumeMax = "system-limit-resume-max",
  GoalVerifyTimeout = "system-goal-verify-timeout",
  GoalAutoResume = "system-goal-auto-resume",
  Save = "system-save",
}

/**
 * The operator-owned runtime system config editor. These knobs were formerly
 * start-only environment variables (tick intervals, channel adapter mode, goal
 * auto-resume, …); they are now file-backed and live-editable here. The schedulers
 * re-arm their timers the moment the config is saved — no restart needed — except
 * `goalAutoResume`, which applies on the next boot. Local form state is seeded from
 * the loaded config and the whole document is PUT on Save (same posture as research).
 */
export function SystemSection() {
  const { data: config } = useSystemConfigQuery();
  if (!config) return null;
  // Remount the editor when the persisted config changes so local state reseeds.
  return <SystemEditor config={config} key={JSON.stringify(config)} />;
}

function SystemEditor({ config }: { config: SystemConfig }) {
  const t = useTranslations("settings");
  const setConfig = useSetSystemConfigMutation();

  const [taskTickMs, setTaskTickMs] = useState<number | null>(config.taskTickMs);
  const [channelTickMs, setChannelTickMs] = useState<number | null>(config.channelTickMs);
  const [monitorTickMs, setMonitorTickMs] = useState<number | null>(config.monitorTickMs);
  const [automationTickMs, setAutomationTickMs] = useState<number | null>(config.automationTickMs);
  const [limitResumeTickMs, setLimitResumeTickMs] = useState<number | null>(
    config.limitResumeTickMs,
  );
  const [limitResumeMax, setLimitResumeMax] = useState<number | null>(config.limitResumeMax);
  const [goalVerifyTimeoutMs, setGoalVerifyTimeoutMs] = useState<number | null>(
    config.goalVerifyTimeoutMs,
  );
  const [goalAutoResume, setGoalAutoResume] = useState(config.goalAutoResume);

  /** Coerce a possibly-cleared tick to a non-negative integer (empty → 0 = disabled). */
  const tick = (value: number | null) => Math.max(0, Math.floor(value ?? 0));
  /** Coerce a possibly-cleared positive knob to `>= min` (empty/low → min). */
  const positive = (value: number | null, min: number) => Math.max(min, Math.floor(value ?? min));

  const save = () =>
    setConfig.mutate({
      body: {
        taskTickMs: tick(taskTickMs),
        channelTickMs: tick(channelTickMs),
        monitorTickMs: tick(monitorTickMs),
        automationTickMs: tick(automationTickMs),
        limitResumeTickMs: tick(limitResumeTickMs),
        limitResumeMax: positive(limitResumeMax, 1),
        goalVerifyTimeoutMs: positive(goalVerifyTimeoutMs, 1),
        goalAutoResume,
        // Not edited here — passed through so a runtime save can't reset the operator's
        // chosen chat persona (the whole document is PUT). Owned by the Chat section.
        chatPersona: config.chatPersona,
      },
    });

  return (
    <HudPanel padding="300" title={t("runtime.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("runtime.hint")}
        </Typography>

        <NumberField
          data-testid={SystemSectionTestId.TaskTick}
          hint={t("runtime.tickHint")}
          label={t("runtime.taskTick")}
          min={0}
          onValueChange={setTaskTickMs}
          step={1000}
          value={taskTickMs}
        />
        <NumberField
          data-testid={SystemSectionTestId.ChannelTick}
          hint={t("runtime.tickHint")}
          label={t("runtime.channelTick")}
          min={0}
          onValueChange={setChannelTickMs}
          step={1000}
          value={channelTickMs}
        />
        <NumberField
          data-testid={SystemSectionTestId.MonitorTick}
          hint={t("runtime.tickHint")}
          label={t("runtime.monitorTick")}
          min={0}
          onValueChange={setMonitorTickMs}
          step={1000}
          value={monitorTickMs}
        />
        <NumberField
          data-testid={SystemSectionTestId.AutomationTick}
          hint={t("runtime.tickHint")}
          label={t("runtime.automationTick")}
          min={0}
          onValueChange={setAutomationTickMs}
          step={1000}
          value={automationTickMs}
        />
        <NumberField
          data-testid={SystemSectionTestId.LimitResumeTick}
          hint={t("runtime.tickHint")}
          label={t("runtime.limitResumeTick")}
          min={0}
          onValueChange={setLimitResumeTickMs}
          step={1000}
          value={limitResumeTickMs}
        />

        <Divider />

        <NumberField
          data-testid={SystemSectionTestId.LimitResumeMax}
          hint={t("runtime.limitResumeMaxHint")}
          label={t("runtime.limitResumeMax")}
          min={1}
          onValueChange={setLimitResumeMax}
          value={limitResumeMax}
        />
        <NumberField
          data-testid={SystemSectionTestId.GoalVerifyTimeout}
          hint={t("runtime.goalVerifyTimeoutHint")}
          label={t("runtime.goalVerifyTimeout")}
          min={1}
          onValueChange={setGoalVerifyTimeoutMs}
          step={1000}
          value={goalVerifyTimeoutMs}
        />

        <Divider />

        <ToggleField
          checked={goalAutoResume}
          data-testid={SystemSectionTestId.GoalAutoResume}
          hint={t("runtime.goalAutoResumeHint")}
          label={t("runtime.goalAutoResume")}
          onChange={setGoalAutoResume}
        />

        <Stack align="center" direction="row" justify="end">
          <Button
            data-testid={SystemSectionTestId.Save}
            disabled={setConfig.isPending}
            icon="check"
            intent="primary"
            onClick={save}
          >
            {t("runtime.save")}
          </Button>
        </Stack>
      </Stack>
    </HudPanel>
  );
}

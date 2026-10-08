"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Divider,
  NumberField,
  Panel,
  Stack,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import type { SystemConfig } from "@zibby/contracts";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";
import { DurationField } from "./DurationField";

/** Testids for the system config editor (the screen + tests select via these). */
export enum SystemSectionTestId {
  TaskTick = "system-task-tick",
  ChannelTick = "system-channel-tick",
  MonitorTick = "system-monitor-tick",
  AutomationTick = "system-automation-tick",
  LimitResumeTick = "system-limit-resume-tick",
  RoadmapTick = "system-roadmap-tick",
  LimitResumeMax = "system-limit-resume-max",
  MaxWorkingAgents = "system-max-working-agents",
  DockDoneTasksLimit = "system-dock-done-tasks-limit",
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
  const [roadmapTickMs, setRoadmapTickMs] = useState<number | null>(config.roadmapTickMs);
  const [limitResumeMax, setLimitResumeMax] = useState<number | null>(config.limitResumeMax);
  const [maxWorkingAgents, setMaxWorkingAgents] = useState<number | null>(config.maxWorkingAgents);
  const [dockDoneTasksLimit, setDockDoneTasksLimit] = useState<number | null>(
    config.dockDoneTasksLimit,
  );
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
        roadmapTickMs: tick(roadmapTickMs),
        limitResumeMax: positive(limitResumeMax, 1),
        maxWorkingAgents: positive(maxWorkingAgents, 1),
        dockDoneTasksLimit: Math.min(100, positive(dockDoneTasksLimit, 1)),
        goalVerifyTimeoutMs: positive(goalVerifyTimeoutMs, 1),
        goalAutoResume,
        // Not edited here — passed through so a runtime save can't reset the operator's
        // chosen chat persona (the whole document is PUT). Owned by the Chat section.
        chatPersona: config.chatPersona,
        // Not edited here — passed through so a runtime save can't reset the operator's
        // power-saver preference (the whole document is PUT). Owned by the Chat UI section.
        powerSaver: config.powerSaver,
        // Not edited here — passed through so a runtime save can't reset the operator's
        // TTS voice pick (Phase 119c; the whole document is PUT). Owned by the Chat UI section.
        ttsVoice: config.ttsVoice,
      },
    });

  return (
    <Panel header={t("runtime.title")} padding="300">
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("runtime.hint")}
        </Typography>

        <DurationField
          data-testid={SystemSectionTestId.TaskTick}
          hint={t("runtime.taskTickHint")}
          label={t("runtime.taskTick")}
          onValueChange={setTaskTickMs}
          valueMs={taskTickMs}
        />
        <DurationField
          data-testid={SystemSectionTestId.ChannelTick}
          hint={t("runtime.channelTickHint")}
          label={t("runtime.channelTick")}
          onValueChange={setChannelTickMs}
          valueMs={channelTickMs}
        />
        <DurationField
          data-testid={SystemSectionTestId.MonitorTick}
          hint={t("runtime.monitorTickHint")}
          label={t("runtime.monitorTick")}
          onValueChange={setMonitorTickMs}
          valueMs={monitorTickMs}
        />
        <DurationField
          data-testid={SystemSectionTestId.AutomationTick}
          hint={t("runtime.automationTickHint")}
          label={t("runtime.automationTick")}
          onValueChange={setAutomationTickMs}
          valueMs={automationTickMs}
        />
        <DurationField
          data-testid={SystemSectionTestId.LimitResumeTick}
          hint={t("runtime.limitResumeTickHint")}
          label={t("runtime.limitResumeTick")}
          onValueChange={setLimitResumeTickMs}
          valueMs={limitResumeTickMs}
        />
        <DurationField
          data-testid={SystemSectionTestId.RoadmapTick}
          hint={t("runtime.roadmapTickHint")}
          label={t("runtime.roadmapTick")}
          onValueChange={setRoadmapTickMs}
          valueMs={roadmapTickMs}
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
          data-testid={SystemSectionTestId.MaxWorkingAgents}
          hint={t("runtime.maxWorkingAgentsHint")}
          label={t("runtime.maxWorkingAgents")}
          min={1}
          onValueChange={setMaxWorkingAgents}
          value={maxWorkingAgents}
        />
        <NumberField
          data-testid={SystemSectionTestId.DockDoneTasksLimit}
          hint={t("runtime.dockDoneTasksLimitHint")}
          label={t("runtime.dockDoneTasksLimit")}
          max={100}
          min={1}
          onValueChange={setDockDoneTasksLimit}
          value={dockDoneTasksLimit}
        />
        <DurationField
          data-testid={SystemSectionTestId.GoalVerifyTimeout}
          hint={t("runtime.goalVerifyTimeoutHint")}
          label={t("runtime.goalVerifyTimeout")}
          onValueChange={setGoalVerifyTimeoutMs}
          valueMs={goalVerifyTimeoutMs}
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
    </Panel>
  );
}

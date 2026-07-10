"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  Container,
  Icon,
  type Schedule,
  ScheduleField,
  type SchedulePickerLabels,
  SegmentPickerField,
  SelectField,
  Stack,
  TextAreaField,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { AUTOMATION_EVENTS, type AutomationEvent } from "@zibby/contracts";
import type { Automation, Target, Trigger } from "@zibby/contracts";
import {
  DEFAULT_SCHEDULE,
  cronToSchedule,
  dayName,
  dayNameShort,
  scheduleToCron,
} from "../schedule";
import { useCronLabel } from "../useCronLabel";

/** Testids for the automation form (the screens + tests select via these). */
export enum AutomationFormTestId {
  Name = "automation-form-name",
  Prompt = "automation-form-prompt",
  Submit = "automation-form-submit",
}

type TriggerType = Trigger["type"];
type TargetType = Target["type"];

/** A minimal option source — anything carrying an id and a display name. */
export interface TargetOption {
  id: string;
  name?: string;
}

/**
 * Controlled form state for an automation, shared by the create dialog and the
 * `/automations/:id` detail page (N4f) — one place owns the trigger → target
 * wiring, the validity rule and the payload building.
 */
export interface AutomationFormState {
  name: string;
  setName: (v: string) => void;
  triggerType: TriggerType;
  setTriggerType: (v: TriggerType) => void;
  schedule: Schedule;
  setSchedule: (v: Schedule) => void;
  events: AutomationEvent[];
  setEvents: (v: AutomationEvent[]) => void;
  targetType: TargetType;
  setTargetType: (v: TargetType) => void;
  targetId: string;
  setTargetId: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  /** The cron expression the current schedule compiles to. */
  expr: string;
  /** Valid for submit — system automations only gate on a valid trigger. */
  canSave: (isSystem: boolean, targets: { agents: ReadonlyArray<TargetOption>; pipelines: ReadonlyArray<TargetOption> }) => boolean;
  buildTrigger: () => Trigger;
  buildTarget: () => Target;
}

/** The current id only counts when it belongs to the active target list. */
function validTargetId(
  targetType: TargetType,
  targetId: string,
  agents: ReadonlyArray<TargetOption>,
  pipelines: ReadonlyArray<TargetOption>,
): string {
  const list = targetType === "agent" ? agents : targetType === "pipeline" ? pipelines : [];
  return list.some((o) => o.id === targetId) ? targetId : "";
}

export function useAutomationFormState(automation?: Automation): AutomationFormState {
  const [name, setName] = useState(automation?.name ?? "");
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.trigger.type ?? "cron");
  const [schedule, setSchedule] = useState<Schedule>(() =>
    automation?.trigger.type === "cron"
      ? (cronToSchedule(automation.trigger.expr) ?? DEFAULT_SCHEDULE)
      : DEFAULT_SCHEDULE,
  );
  const [events, setEvents] = useState<AutomationEvent[]>(
    automation?.trigger.type === "event" ? automation.trigger.events : [],
  );
  const [targetType, setTargetType] = useState<TargetType>(automation?.target.type ?? "pipeline");
  const [targetId, setTargetId] = useState(
    automation?.target.type === "agent"
      ? automation.target.agentId
      : automation?.target.type === "pipeline"
        ? automation.target.pipelineId
        : "",
  );
  const [prompt, setPrompt] = useState(automation?.prompt ?? "");

  const expr = scheduleToCron(schedule);

  return {
    name,
    setName,
    triggerType,
    setTriggerType,
    schedule,
    setSchedule,
    events,
    setEvents,
    targetType,
    setTargetType,
    targetId,
    setTargetId,
    prompt,
    setPrompt,
    expr,
    canSave: (isSystem, { agents, pipelines }) => {
      const scheduleOk =
        schedule.time.trim().length > 0 &&
        (schedule.repeat === "monthly" || schedule.weekdays.length > 0);
      const triggerOk = triggerType === "cron" ? scheduleOk : events.length > 0;
      if (isSystem) return triggerOk;
      const targetOk =
        targetType === "briefing" || validTargetId(targetType, targetId, agents, pipelines).length > 0;
      return name.trim().length > 0 && triggerOk && targetOk;
    },
    buildTrigger: () =>
      triggerType === "cron" ? { type: "cron", expr } : { type: "event", events },
    buildTarget: () =>
      targetType === "agent"
        ? { type: "agent", agentId: targetId }
        : targetType === "pipeline"
          ? { type: "pipeline", pipelineId: targetId }
          : targetType === "memory-distill"
            ? { type: "memory-distill" }
            : { type: "briefing" },
  };
}

export interface AutomationFormFieldsProps {
  form: AutomationFormState;
  agents: ReadonlyArray<TargetOption>;
  pipelines: ReadonlyArray<TargetOption>;
  /**
   * A system automation is server-seeded: only its schedule may change.
   * Everything else (name, trigger kind, target, prompt) is locked — the server
   * rejects those edits, so we don't even offer the affordance.
   */
  isSystem?: boolean;
}

/**
 * The automation form body (N4f), mirroring the design's trigger → target flow:
 * a name, a cron-or-event trigger, and an agent / pipeline / briefing target
 * (with an optional prompt). Shared by the create-only
 * {@link AutomationFormDialog} and the `/automations/:id` detail page. Only
 * fields the contract carries are exposed — the result of any external-effect
 * run still stops at the approval gate elsewhere.
 */
export function AutomationFormFields({
  form,
  agents,
  pipelines,
  isSystem = false,
}: AutomationFormFieldsProps) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const cronLabel = useCronLabel();

  // The closed event catalog → multi-select options (the value IS the label: these are
  // self-descriptive signal ids the operator picks from, not free text).
  const eventOptions = AUTOMATION_EVENTS.map((e) => ({ value: e, label: e }));

  const targetList =
    form.targetType === "agent" ? agents : form.targetType === "pipeline" ? pipelines : [];
  const options = [
    { value: "", label: t("selectTarget") },
    ...targetList.map((o) => ({ value: o.id, label: o.name ?? o.id })),
  ];
  const targetValue = targetList.some((o) => o.id === form.targetId) ? form.targetId : "";

  // Friendly-picker strings, localized. Weekday names come from the cron helper
  // (0 = Sunday) so the UI and the scheduler agree on the index.
  const scheduleLabels: Partial<SchedulePickerLabels> = {
    repeat: {
      weekly: t("schedule.weekly"),
      monthly: t("schedule.monthly"),
    },
    weekdays: Array.from({ length: 7 }, (_, d) =>
      dayName(d, locale),
    ) as SchedulePickerLabels["weekdays"],
    weekdaysShort: Array.from({ length: 7 }, (_, d) =>
      dayNameShort(d, locale),
    ) as SchedulePickerLabels["weekdaysShort"],
    weekdaysLabel: t("schedule.weekdaysLabel"),
    monthDayLabel: t("schedule.monthDayLabel"),
    timeLabel: t("schedule.timeLabel"),
    formatMonthDay: (day) => t("schedule.dayOfMonth", { day }),
  };

  return (
    <Stack direction="col" gap="150">
      {isSystem ? (
        <Card background="background" radius="default">
          <Container padding="150">
            <Stack align="start" direction="row" gap="100">
              <Icon name="shield" size="sm" tone="accent" />
              <Typography leading="snug" size="caption" type="note" variant="secondary">
                {t("systemEditNote")}
              </Typography>
            </Stack>
          </Container>
        </Card>
      ) : (
        <TextInputField
          data-testid={AutomationFormTestId.Name}
          label={t("nameLabel")}
          onChange={(e) => form.setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          value={form.name}
        />
      )}

      {!isSystem && (
        <SegmentPickerField
          label={t("triggerLabel")}
          onValueChange={(v) => form.setTriggerType(v as TriggerType)}
          options={[
            { value: "cron", label: t("triggerCron") },
            { value: "event", label: t("triggerEvent") },
          ]}
          value={form.triggerType}
        />
      )}
      {form.triggerType === "cron" ? (
        <ScheduleField
          hint={cronLabel(form.expr)}
          label={t("cronLabel")}
          labels={scheduleLabels}
          onValueChange={form.setSchedule}
          value={form.schedule}
        />
      ) : (
        <SelectField<AutomationEvent>
          multi
          hint={t("eventHint")}
          label={t("eventLabel")}
          onValueChange={form.setEvents}
          options={eventOptions}
          placeholder={t("eventPlaceholder")}
          removeLabel={t("eventRemove")}
          value={form.events}
        />
      )}

      {/* Target is server-owned for system automations — only the schedule above moves. */}
      {!isSystem && (
        <>
          <SegmentPickerField
            label={t("targetLabel")}
            onValueChange={(v) => form.setTargetType(v as TargetType)}
            options={[
              { value: "agent", label: t("targetAgent") },
              { value: "pipeline", label: t("targetPipeline") },
              { value: "briefing", label: t("targetBriefing") },
            ]}
            value={form.targetType}
          />

          {form.targetType === "briefing" ? (
            <Card background="background" radius="default">
              <Container padding="150">
                <Stack align="start" direction="row" gap="100">
                  <Icon name="spark" size="sm" tone="accent" />
                  <Typography leading="snug" size="caption" type="note" variant="secondary">
                    {t("briefingNote")}
                  </Typography>
                </Stack>
              </Container>
            </Card>
          ) : (
            <SelectField
              label={t("targetSelectLabel")}
              onValueChange={form.setTargetId}
              options={options}
              value={targetValue}
            />
          )}

          {/* Always shown and always forwarded as input to whatever the automation
              runs — agent prompt, research focus, or briefing voice. */}
          <TextAreaField
            data-testid={AutomationFormTestId.Prompt}
            hint={t("promptHint")}
            label={t("promptLabel")}
            onChange={(e) => form.setPrompt(e.target.value)}
            placeholder={t("promptPlaceholder")}
            rows={3}
            value={form.prompt}
          />
        </>
      )}
    </Stack>
  );
}

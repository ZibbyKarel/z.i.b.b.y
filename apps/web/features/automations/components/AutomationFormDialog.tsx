"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Dialog,
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
import type { Automation, Target, Trigger } from "@zibby/contracts";
import { slug } from "../../../utils/slug";
import { DEFAULT_SCHEDULE, cronToSchedule, dayName, dayNameShort, scheduleToCron } from "../schedule";
import { useCronLabel } from "../useCronLabel";

/** Testids for the automation form dialog. */
export enum AutomationFormTestId {
  Name = "automation-form-name",
  Event = "automation-form-event",
  Prompt = "automation-form-prompt",
  Submit = "automation-form-submit",
}

type TriggerType = Trigger["type"];
type TargetType = Target["type"];

/** A minimal option source — anything carrying an id and a display name. */
interface TargetOption {
  id: string;
  name?: string;
}

export interface AutomationFormDialogProps {
  /** Omit to create a new automation; pass one to edit it. */
  automation?: Automation;
  agents: ReadonlyArray<TargetOption>;
  pipelines: ReadonlyArray<TargetOption>;
  onClose: () => void;
  /** Emits the full automation body (id preserved on edit); the screen persists it. */
  onSubmit: (body: Omit<Automation, "lastFiredAt">) => void;
}

/**
 * Create / edit dialog for an automation, mirroring the design's trigger → target
 * flow: a name, a cron-or-event trigger, and an agent / pipeline / briefing target
 * (with an optional agent prompt). Only fields the contract carries are exposed —
 * the result of any external-effect run still stops at the approval gate elsewhere.
 */
export function AutomationFormDialog({
  automation,
  agents,
  pipelines,
  onClose,
  onSubmit,
}: AutomationFormDialogProps) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const cronLabel = useCronLabel();
  const isNew = automation === undefined;

  const [name, setName] = useState(automation?.name ?? "");
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.trigger.type ?? "cron");
  const [schedule, setSchedule] = useState<Schedule>(() =>
    automation?.trigger.type === "cron"
      ? (cronToSchedule(automation.trigger.expr) ?? DEFAULT_SCHEDULE)
      : DEFAULT_SCHEDULE,
  );
  const [event, setEvent] = useState(
    automation?.trigger.type === "event" ? automation.trigger.event : "",
  );
  const [targetType, setTargetType] = useState<TargetType>(automation?.target.type ?? "pipeline");
  const [targetId, setTargetId] = useState(
    automation?.target.type === "agent"
      ? automation.target.agentId
      : automation?.target.type === "pipeline"
        ? automation.target.pipelineId
        : "",
  );
  const [prompt, setPrompt] = useState(
    automation?.target.type === "agent" ? (automation.target.prompt ?? "") : "",
  );

  const targetList = targetType === "agent" ? agents : targetType === "pipeline" ? pipelines : [];
  const options = [
    { value: "", label: t("selectTarget") },
    ...targetList.map((o) => ({ value: o.id, label: o.name ?? o.id })),
  ];
  // Keep the select valid when the kind changes without an effect: show the
  // placeholder unless the current id belongs to the active list.
  const targetValue = targetList.some((o) => o.id === targetId) ? targetId : "";

  const expr = scheduleToCron(schedule);
  const scheduleOk =
    schedule.time.trim().length > 0 &&
    (schedule.repeat === "monthly" || schedule.weekdays.length > 0);
  const triggerOk = triggerType === "cron" ? scheduleOk : event.trim().length > 0;
  const targetOk = targetType === "briefing" || targetValue.length > 0;
  const canSave = name.trim().length > 0 && triggerOk && targetOk;

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

  const submit = () => {
    if (!canSave) return;
    const trigger: Trigger =
      triggerType === "cron" ? { type: "cron", expr } : { type: "event", event: event.trim() };
    const target: Target =
      targetType === "agent"
        ? { type: "agent", agentId: targetValue, ...(prompt.trim() ? { prompt: prompt.trim() } : {}) }
        : targetType === "pipeline"
          ? { type: "pipeline", pipelineId: targetValue }
          : { type: "briefing" };
    onSubmit({
      id: automation?.id ?? slug(name, "automation"),
      name: name.trim(),
      trigger,
      target,
      enabled: automation?.enabled ?? true,
    });
  };

  const title = isNew ? t("formCreateTitle") : t("formEditTitle");

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            data-testid={AutomationFormTestId.Submit}
            disabled={!canSave}
            icon={isNew ? "plus" : "check"}
            intent="primary"
            onClick={submit}
          >
            {isNew ? t("create") : t("save")}
          </Button>
        </>
      }
      ariaLabel={title}
      closeLabel={t("close")}
      onClose={onClose}
      title={title}
      width="lg"
    >
      <Stack direction="col" gap="150">
        <TextInputField
          data-testid={AutomationFormTestId.Name}
          label={t("nameLabel")}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          value={name}
        />

        <SegmentPickerField
          label={t("triggerLabel")}
          onValueChange={(v) => setTriggerType(v as TriggerType)}
          options={[
            { value: "cron", label: t("triggerCron") },
            { value: "event", label: t("triggerEvent") },
          ]}
          value={triggerType}
        />
        {triggerType === "cron" ? (
          <ScheduleField
            hint={cronLabel(expr)}
            label={t("cronLabel")}
            labels={scheduleLabels}
            onValueChange={setSchedule}
            value={schedule}
          />
        ) : (
          <TextInputField
            data-testid={AutomationFormTestId.Event}
            hint={t("eventHint")}
            label={t("eventLabel")}
            onChange={(e) => setEvent(e.target.value)}
            placeholder={t("eventPlaceholder")}
            value={event}
          />
        )}

        <SegmentPickerField
          label={t("targetLabel")}
          onValueChange={(v) => setTargetType(v as TargetType)}
          options={[
            { value: "agent", label: t("targetAgent") },
            { value: "pipeline", label: t("targetPipeline") },
            { value: "briefing", label: t("targetBriefing") },
          ]}
          value={targetType}
        />

        {targetType === "briefing" ? (
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
            onValueChange={setTargetId}
            options={options}
            value={targetValue}
          />
        )}

        {targetType === "agent" && (
          <TextAreaField
            data-testid={AutomationFormTestId.Prompt}
            hint={t("promptHint")}
            label={t("promptLabel")}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("promptPlaceholder")}
            rows={3}
            value={prompt}
          />
        )}
      </Stack>
    </Dialog>
  );
}

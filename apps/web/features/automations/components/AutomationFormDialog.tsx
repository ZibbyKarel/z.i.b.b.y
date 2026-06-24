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
import { AUTOMATION_EVENTS, type AutomationEvent } from "@zibby/contracts";
import type { Automation, Target, Trigger } from "@zibby/contracts";
import { slug } from "../../../utils/slug";
import {
  DEFAULT_SCHEDULE,
  cronToSchedule,
  dayName,
  dayNameShort,
  scheduleToCron,
} from "../schedule";
import { useCronLabel } from "../useCronLabel";

/** Testids for the automation form dialog. */
export enum AutomationFormTestId {
  Name = "automation-form-name",
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
  /**
   * Emits the automation body (id preserved on edit); the screen persists it.
   * `system` is server-owned and never settable from the client, so it is omitted —
   * mirroring CreateAutomationSchema / UpdateAutomationSchema.
   */
  onSubmit: (body: Omit<Automation, "lastFiredAt" | "system">) => void;
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
  // A system automation is server-seeded: only its schedule may change. Everything
  // else (name, trigger kind, target, prompt) is locked — the server rejects those
  // edits, so we don't even offer the affordance.
  const isSystem = automation?.system ?? false;

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

  // The closed event catalog → multi-select options (the value IS the label: these are
  // self-descriptive signal ids the operator picks from, not free text).
  const eventOptions = AUTOMATION_EVENTS.map((e) => ({ value: e, label: e }));

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
  const triggerOk = triggerType === "cron" ? scheduleOk : events.length > 0;
  const targetOk =
    targetType === "briefing" || targetType === "discovery" || targetValue.length > 0;
  // System automations only edit the schedule, so the only gate is a valid trigger.
  const canSave = isSystem ? triggerOk : name.trim().length > 0 && triggerOk && targetOk;

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
      triggerType === "cron" ? { type: "cron", expr } : { type: "event", events };
    // System automation: only the schedule moves. Echo the seeded target/name/prompt/
    // enabled back unchanged so the target builder below can't rebuild (and corrupt,
    // e.g. memory-distill → briefing) a field the user was never allowed to touch.
    if (automation && isSystem) {
      onSubmit({
        id: automation.id,
        ...(automation.name !== undefined ? { name: automation.name } : {}),
        trigger,
        target: automation.target,
        ...(automation.prompt !== undefined ? { prompt: automation.prompt } : {}),
        enabled: automation.enabled,
      });
      return;
    }
    const target: Target =
      targetType === "agent"
        ? { type: "agent", agentId: targetValue }
        : targetType === "pipeline"
          ? { type: "pipeline", pipelineId: targetValue }
          : targetType === "discovery"
            ? { type: "discovery" }
            : targetType === "memory-distill"
              ? { type: "memory-distill" }
              : { type: "briefing" };
    onSubmit({
      id: automation?.id ?? slug(name, "automation"),
      name: name.trim(),
      trigger,
      target,
      // Top-level: always forwarded to whatever the target runs (agent prompt,
      // research focus, briefing voice). Always sent (empty string clears it on edit).
      prompt: prompt.trim(),
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
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            value={name}
          />
        )}

        {!isSystem && (
          <SegmentPickerField
            label={t("triggerLabel")}
            onValueChange={(v) => setTriggerType(v as TriggerType)}
            options={[
              { value: "cron", label: t("triggerCron") },
              { value: "event", label: t("triggerEvent") },
            ]}
            value={triggerType}
          />
        )}
        {triggerType === "cron" ? (
          <ScheduleField
            hint={cronLabel(expr)}
            label={t("cronLabel")}
            labels={scheduleLabels}
            onValueChange={setSchedule}
            value={schedule}
          />
        ) : (
          <SelectField<AutomationEvent>
            multi
            hint={t("eventHint")}
            label={t("eventLabel")}
            onValueChange={setEvents}
            options={eventOptions}
            placeholder={t("eventPlaceholder")}
            removeLabel={t("eventRemove")}
            value={events}
          />
        )}

        {/* Target is server-owned for system automations — only the schedule above moves. */}
        {!isSystem && (
          <>
            <SegmentPickerField
              label={t("targetLabel")}
              onValueChange={(v) => setTargetType(v as TargetType)}
              options={[
                { value: "agent", label: t("targetAgent") },
                { value: "pipeline", label: t("targetPipeline") },
                { value: "briefing", label: t("targetBriefing") },
                { value: "discovery", label: t("targetDiscovery") },
              ]}
              value={targetType}
            />

            {targetType === "briefing" || targetType === "discovery" ? (
              <Card background="background" radius="default">
                <Container padding="150">
                  <Stack align="start" direction="row" gap="100">
                    <Icon
                      name={targetType === "discovery" ? "search" : "spark"}
                      size="sm"
                      tone="accent"
                    />
                    <Typography leading="snug" size="caption" type="note" variant="secondary">
                      {targetType === "discovery" ? t("discoveryNote") : t("briefingNote")}
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

            {/* Always shown and always forwarded as input to whatever the automation
                runs — agent prompt, research focus, or briefing voice. */}
            <TextAreaField
              data-testid={AutomationFormTestId.Prompt}
              hint={t("promptHint")}
              label={t("promptLabel")}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("promptPlaceholder")}
              rows={3}
              value={prompt}
            />
          </>
        )}
      </Stack>
    </Dialog>
  );
}

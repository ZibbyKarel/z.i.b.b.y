"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Container, Icon, type Schedule, Stack, Typography } from "@zibby/design-system";
import type { Automation, AutomationEvent, Trigger } from "@zibby/contracts";
import { DEFAULT_SCHEDULE, cronToSchedule, scheduleToCron } from "../schedule";
import { TriggerFields } from "./TriggerFields";

/** Testids for the automation form (the screens + tests select via these). */
export enum AutomationFormTestId {
  Submit = "automation-form-submit",
}

type TriggerType = Trigger["type"];

/**
 * Controlled form state for an automation's TRIGGER — shared by the create dialog
 * (via {@link TriggerFields}) and the `/automations/:id` detail page. The
 * name/target/prompt half of the old form is gone (Phase 116d/116e): a `task`
 * automation is created and edited entirely through `CommandLine`, and a system
 * automation never exposes those fields at all — so this state only ever needs
 * to own the trigger → cron/event wiring, its validity rule and payload building.
 */
export interface AutomationFormState {
  triggerType: TriggerType;
  setTriggerType: (v: TriggerType) => void;
  schedule: Schedule;
  setSchedule: (v: Schedule) => void;
  events: AutomationEvent[];
  setEvents: (v: AutomationEvent[]) => void;
  /** The cron expression the current schedule compiles to. */
  expr: string;
  /** Valid for submit — a cron trigger needs a time (+ weekday/monthly), an event trigger needs ≥1 event. */
  canSave: () => boolean;
  buildTrigger: () => Trigger;
}

export function useAutomationFormState(automation?: Automation): AutomationFormState {
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.trigger.type ?? "cron");
  const [schedule, setSchedule] = useState<Schedule>(() =>
    automation?.trigger.type === "cron"
      ? (cronToSchedule(automation.trigger.expr) ?? DEFAULT_SCHEDULE)
      : DEFAULT_SCHEDULE,
  );
  const [events, setEvents] = useState<AutomationEvent[]>(
    automation?.trigger.type === "event" ? automation.trigger.events : [],
  );

  const expr = scheduleToCron(schedule);

  return {
    triggerType,
    setTriggerType,
    schedule,
    setSchedule,
    events,
    setEvents,
    expr,
    canSave: () => {
      const scheduleOk =
        schedule.time.trim().length > 0 &&
        (schedule.repeat === "monthly" || schedule.weekdays.length > 0);
      return triggerType === "cron" ? scheduleOk : events.length > 0;
    },
    buildTrigger: () =>
      triggerType === "cron" ? { type: "cron", expr } : { type: "event", events },
  };
}

export interface AutomationFormFieldsProps {
  form: AutomationFormState;
  /**
   * A system automation is server-seeded: only its schedule may change.
   * Everything else (name, target, prompt) is locked — the server rejects
   * those edits, so we don't even offer the affordance; the note explains why.
   */
  isSystem?: boolean;
}

/**
 * The automation form body, trimmed (Phase 116e) to just the trigger — the
 * name/target/prompt UI it used to render is gone, replaced entirely by
 * `CommandLine` for a `task` automation. For a system automation this renders a
 * note explaining the lock plus the trigger block; for anything else (the
 * legacy schedule-only fallback on `/automations/:id`) it's just the trigger
 * block. Shared with the `/automations/:id` detail page.
 */
export function AutomationFormFields({ form, isSystem = false }: AutomationFormFieldsProps) {
  const t = useTranslations("automations");

  return (
    <Stack direction="col" gap="150">
      {isSystem && (
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
      )}

      <TriggerFields form={form} isSystem={isSystem} />
    </Stack>
  );
}

import { useState } from "react";
import { type SchedulePreset, resolveScheduledAt } from "../task";

export interface UseTaskScheduleArgs {
  /** A stable "now" for the dialog's lifetime (presets resolve against it). */
  now: number;
  /** The rolling-limit reset time, for the "when limits reset" preset. */
  resetsAt: number | null;
}

export interface UseTaskSchedule {
  preset: SchedulePreset;
  setPreset: (preset: SchedulePreset) => void;
  /** The resolved absolute start, or null for "run now". */
  scheduledAt: number | null;
  /** A human "when" shown in the post-submit confirmation, or null before scheduling. */
  scheduledWhen: string | null;
  setScheduledWhen: (when: string | null) => void;
}

/** Owns the delayed-start preset and the post-submit "scheduled for {when}" confirmation. */
export function useTaskSchedule({ now, resetsAt }: UseTaskScheduleArgs): UseTaskSchedule {
  const [preset, setPreset] = useState<SchedulePreset>("now");
  const [scheduledWhen, setScheduledWhen] = useState<string | null>(null);
  const scheduledAt = resolveScheduledAt(preset, now, resetsAt);
  return { preset, setPreset, scheduledAt, scheduledWhen, setScheduledWhen };
}

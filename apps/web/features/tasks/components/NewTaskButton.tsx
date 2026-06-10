"use client";

import { Icon, Kbd } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useNewTask } from "../TaskContext";
import { NEW_TASK_SHORTCUT } from "../TaskContext";

/**
 * Top-bar entry point to the New Task flow — a mono action mirroring the
 * neighbouring voice trigger, with a visible <Kbd> shortcut badge in the same
 * style as the voice rebinder.
 */
export function NewTaskButton() {
  const t = useTranslations("tasks");
  const { open } = useNewTask();

  return (
    <button
      aria-label={t("triggerAria")}
      className="inline-flex cursor-pointer items-center gap-[7px] rounded-sm border border-border bg-transparent py-[7px] pl-[13px] pr-[9px] font-mono text-xs font-semibold tracking-[0.06em] text-foreground-dim transition-all hover:border-accent hover:bg-accent-dim hover:text-accent"
      onClick={open}
      title={`${t("triggerTitle")} (${NEW_TASK_SHORTCUT.toUpperCase()})`}
      type="button"
    >
      <Icon name="plus" size="xs" stroke="medium" />
      {t("triggerLabel")}
      <Kbd>{NEW_TASK_SHORTCUT.toUpperCase()}</Kbd>
    </button>
  );
}

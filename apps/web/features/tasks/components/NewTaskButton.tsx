"use client";

import { Button, Kbd } from "@zibby/design-system";
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
    <Button
      aria-label={t("triggerAria")}
      icon="plus"
      intent="ghost"
      onClick={() => open()}
      size="sm"
      title={`${t("triggerTitle")} (${NEW_TASK_SHORTCUT.toUpperCase()})`}
    >
      {t("triggerLabel")}
      <Kbd>{NEW_TASK_SHORTCUT.toUpperCase()}</Kbd>
    </Button>
  );
}

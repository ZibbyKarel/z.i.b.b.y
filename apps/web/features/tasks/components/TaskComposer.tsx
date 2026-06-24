import { HighlightTextAreaField, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { PathRange } from "../task";

export interface TaskComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on ⌘/Ctrl+Enter — the keyboard submit. */
  onSubmit: () => void;
  /**
   * Character spans of the file/folder paths detected in the text. Each is highlighted
   * inline in the description and auto-added to the run's allowed directories — no
   * separate chip list, no grant step.
   */
  highlights: PathRange[];
}

/**
 * The task description input: a large textarea that highlights any referenced
 * file/folder paths inline as the operator types. A detected path lights up where it
 * is written and is folded into the dispatched task's `paths` (the run's allowed
 * directories) automatically.
 */
export function TaskComposer({ value, onChange, onSubmit, highlights }: TaskComposerProps) {
  const t = useTranslations("tasks.composer");
  return (
    <Stack gap="100">
      <HighlightTextAreaField
        autoFocus
        highlights={highlights}
        label={t("label")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={t("placeholder")}
        rows={6}
        value={value}
      />

      <Typography mono size="2xs" type="note" variant="tertiary">
        {t("submitHint")}
      </Typography>
    </Stack>
  );
}

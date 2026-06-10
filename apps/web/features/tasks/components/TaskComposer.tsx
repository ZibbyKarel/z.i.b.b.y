import { Stack, TextAreaField, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { PathChips } from "./PathChips";

export interface TaskComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired on ⌘/Ctrl+Enter — the keyboard submit. */
  onSubmit: () => void;
  paths: string[];
  onRemovePath: (path: string) => void;
}

/**
 * The task description input: a large textarea whose placeholder hints that
 * file/folder paths can be referenced, with the live-detected paths shown below
 * as removable context chips.
 */
export function TaskComposer({
  value,
  onChange,
  onSubmit,
  paths,
  onRemovePath,
}: TaskComposerProps) {
  const t = useTranslations("tasks.composer");
  return (
    <Stack gap="150">
      <TextAreaField
        autoFocus
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

      {paths.length > 0 && (
        <Stack gap="75">
          <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
            {t("pathsTitle")}
          </Typography>
          <PathChips onRemove={onRemovePath} paths={paths} />
        </Stack>
      )}

      <Typography mono size="2xs" type="note" variant="tertiary">
        {t("submitHint")}
      </Typography>
    </Stack>
  );
}

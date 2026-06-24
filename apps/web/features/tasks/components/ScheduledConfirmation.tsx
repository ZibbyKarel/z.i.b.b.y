import { IconTile, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface ScheduledConfirmationProps {
  /** A human "when" the task is scheduled to run. */
  when: string;
}

/** The brief "task accepted — scheduled for {when}" confirmation shown before close. */
export function ScheduledConfirmation({ when }: ScheduledConfirmationProps) {
  const t = useTranslations("tasks");
  return (
    <Stack align="center" gap="100">
      <IconTile glyph="bolt" size="lg" tone="accent" />
      <Typography size="md" type="text" weight="medium">
        {t("confirm.accepted")}
      </Typography>
      <Typography mono size="sm" type="note" variant="secondary">
        {t("confirm.scheduled", { when })}
      </Typography>
    </Stack>
  );
}

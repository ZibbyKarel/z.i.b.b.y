import { Container, Icon, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface TaskContextPanelProps {
  /** The prior run's output, carried into this task ("Continue in a new task"). */
  context: string;
}

/**
 * The read-only "continuing from a previous run" panel: shows the prior run's output
 * up front, which the dialog also folds into the dispatched description so the new
 * run sees what the previous one produced.
 */
export function TaskContextPanel({ context }: TaskContextPanelProps) {
  const t = useTranslations("tasks");
  return (
    <Panel
      data-testid="task-context-panel"
      header={
        <Stack align="center" direction="row" gap="75">
          <Icon name="link" size="sm" tone="accent" />
          <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
            {t("context.label")}
          </Typography>
        </Stack>
      }
      padding="100"
    >
      <Stack gap="50">
        <Typography leading="snug" size="xs" type="note" variant="tertiary">
          {t("context.note")}
        </Typography>
        <Container maxHeight="8rem" overflow="auto">
          <Typography mono size="2xs" type="note" variant="secondary">
            {context}
          </Typography>
        </Container>
      </Stack>
    </Panel>
  );
}

import { Container, IconTile, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";

/**
 * Pending step shown while the (mock) categorizer reads the task. Calm, butler
 * microcopy and a glowing tile with three breathing dots — no spinner, no noise.
 */
export function ClassifyingState() {
  const t = useTranslations("tasks.classifying");
  return (
    <Container padding={["300", "100"]} textAlign="center">
      <Stack align="center" gap="150">
        <IconTile glow filled={false} glyph="search" shape="circle" size="xl" />
        <Typography size="xl" type="subtitle" weight="semibold">
          {t("title")}
        </Typography>
        <Stack align="center" direction="row" gap="75">
          <StatusDot pulse size="75" tone="accent" />
          <StatusDot pulse size="75" tone="accent" />
          <StatusDot pulse size="75" tone="accent" />
        </Stack>
        <Typography mono size="base" type="note" variant="secondary">
          {t("note")}
        </Typography>
      </Stack>
    </Container>
  );
}

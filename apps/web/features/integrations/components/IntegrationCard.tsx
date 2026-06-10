import { useTranslations } from "next-intl";
import { Button, Chip, Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { HudCard } from "../../../components/HudCard/HudCard";
import type { Integration } from "../../../domain";
import { INTEGRATION_STATUS } from "../integrationStatus";

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onTest?: (integration: Integration) => void;
}

/**
 * Catalog card for a single integration: a thin container over the generic
 * {@link HudCard} — glyph tile, name + description, a status chip in the header
 * and a footer with the backing file plus test/configure actions.
 */
export function IntegrationCard({ integration, onConfigure, onTest }: IntegrationCardProps) {
  const t = useTranslations();
  const status = INTEGRATION_STATUS[integration.status];
  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" justify="between">
          <Container minW0 maxWidth="150px">
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {integration.file}
            </Typography>
          </Container>
          <Stack align="center" direction="row" gap="75">
            <Button icon="link" intent="ghost" onClick={() => onTest?.(integration)} size="sm">
              {t("common.test")}
            </Button>
            <Button icon="gear" intent="ghost" onClick={() => onConfigure?.(integration)} size="sm">
              {t("common.configure")}
            </Button>
          </Stack>
        </Stack>
      }
      aside={
        <Chip tone={status.pill}>
          <StatusDot size="75" tone={status.dot} />
          {t(`integrations.${status.labelKey}`)}
        </Chip>
      }
      description={integration.desc}
      glyph={integration.glyph}
      title={integration.name}
    />
  );
}

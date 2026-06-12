import { useTranslations } from "next-intl";
import { Button, Container, Stack, StatusDot, Tag, Typography } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { HudCard } from "../../../components/HudCard/HudCard";
import { INTEGRATION_STATUS } from "../integrationStatus";

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onTest?: (integration: Integration) => void;
  testing?: boolean;
}

const KIND_GLYPH = { slack: "plug", email: "server" } as const;

/** Format a sync timestamp as a short, locale-agnostic caption (or a dash). */
function lastSyncCaption(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * Catalog card for a single integration: a thin container over the generic
 * {@link HudCard}. The status chip + dot are driven by the entity's real
 * connection `status`, the footer shows the last sync time and the configured
 * channel/host, and the actions test the connection or open the editor.
 */
export function IntegrationCard({ integration, onConfigure, onTest, testing }: IntegrationCardProps) {
  const t = useTranslations();
  const status = INTEGRATION_STATUS[integration.status];
  const name = integration.name ?? integration.id;
  const detail =
    integration.config.kind === "slack"
      ? t("integrations.channelCount", { count: integration.config.channels.length })
      : integration.config.user;

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" justify="between">
          <Container minW0 maxWidth="160px">
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {t("integrations.lastSync")}: {lastSyncCaption(integration.lastSyncAt)}
            </Typography>
          </Container>
          <Stack align="center" direction="row" gap="75">
            <Button
              disabled={testing || !integration.hasCredentials}
              icon="link"
              intent="ghost"
              onClick={() => onTest?.(integration)}
              size="sm"
            >
              {t("integrations.testConnection")}
            </Button>
            <Button icon="gear" intent="ghost" onClick={() => onConfigure?.(integration)} size="sm">
              {t("common.configure")}
            </Button>
          </Stack>
        </Stack>
      }
      aside={
        <Tag tone={status.pill}>
          <StatusDot size="75" tone={status.dot} />
          {t(`integrations.${status.labelKey}`)}
        </Tag>
      }
      description={detail}
      glyph={KIND_GLYPH[integration.kind]}
      title={name}
    />
  );
}

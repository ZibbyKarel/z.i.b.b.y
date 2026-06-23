import { useTranslations } from "next-intl";
import { Button, Stack, StatusDot, Tag, Toggle, Typography } from "@zibby/design-system";
import type { Integration } from "@zibby/contracts";
import { HudCard } from "../../../components/HudCard/HudCard";
import { INTEGRATION_STATUS } from "../integrationStatus";

export interface IntegrationCardProps {
  integration: Integration;
  onConfigure?: (integration: Integration) => void;
  onTest?: (integration: Integration) => void;
  onDelete?: (integration: Integration) => void;
  /** Toggle the integration's `enabled` flag inline (no configure dialog needed). */
  onToggleEnabled?: (integration: Integration) => void;
  testing?: boolean;
  /** An enable/disable update is in flight (disables the inline toggle). */
  togglingEnabled?: boolean;
}

const KIND_GLYPH = {
  slack: "plug",
  email: "server",
  jira: "checkpoint",
  github: "branch",
  calendar: "clock",
} as const;

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
export function IntegrationCard({
  integration,
  onConfigure,
  onTest,
  onDelete,
  onToggleEnabled,
  testing,
  togglingEnabled,
}: IntegrationCardProps) {
  const t = useTranslations();
  const status = INTEGRATION_STATUS[integration.status];
  const name = integration.name ?? integration.id;
  const config = integration.config;
  const detail =
    config.kind === "slack"
      ? t("integrations.channelCount", { count: config.channels.length })
      : config.kind === "email"
        ? config.user
        : config.kind === "jira"
          ? (config.projectKey ?? config.baseUrl)
          : config.kind === "github"
            ? config.repo
            : config.calendarId;

  return (
    <HudCard
      actions={
        // Compact two-row footer so the card reads cleanly in a narrow grid column:
        // the last-sync time always on its own line, then the controls (test/configure
        // are icon-only with a title — labels would overflow a ~1/3-width card).
        <Stack gap="75">
          <Typography mono truncate size="xs" type="note" variant="tertiary">
            {t("integrations.lastSync")}: {lastSyncCaption(integration.lastSyncAt)}
          </Typography>
          <Stack align="center" direction="row" gap="75" justify="between">
            {onToggleEnabled ? (
              <Toggle
                checked={integration.enabled}
                data-testid="integration-enabled-toggle"
                disabled={togglingEnabled}
                label={
                  integration.enabled
                    ? t("integrations.disableAria", { name })
                    : t("integrations.enableAria", { name })
                }
                onChange={() => onToggleEnabled(integration)}
                size="sm"
              />
            ) : (
              <span />
            )}
            <Stack align="center" direction="row" gap="50">
              <Button
                aria-label={t("integrations.testConnection")}
                disabled={testing || !integration.hasCredentials}
                icon="link"
                intent="ghost"
                onClick={() => onTest?.(integration)}
                size="sm"
                title={t("integrations.testConnection")}
              />
              <Button
                aria-label={t("common.configure")}
                icon="gear"
                intent="ghost"
                onClick={() => onConfigure?.(integration)}
                size="sm"
                title={t("common.configure")}
              />
              {onDelete && (
                <Button
                  aria-label={t("common.delete")}
                  icon="trash"
                  intent="ghost"
                  onClick={() => onDelete(integration)}
                  size="sm"
                  title={t("common.delete")}
                />
              )}
            </Stack>
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

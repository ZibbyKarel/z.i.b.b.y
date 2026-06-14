import { useTranslations } from "next-intl";
import { Button, Container, Stack, StatusDot, Tag, Typography } from "@zibby/design-system";
import type { McpServer } from "@zibby/contracts";
import { HudCard } from "../../../components/HudCard/HudCard";

export interface McpServerCardProps {
  server: McpServer;
  onConfigure?: (server: McpServer) => void;
}

/**
 * Catalog card for a single MCP server: a thin container over the generic
 * {@link HudCard}. The aside chip shows the transport + enabled state, the footer
 * shows the connection target and whether a secret is stored, and the action
 * opens the editor.
 */
export function McpServerCard({ server, onConfigure }: McpServerCardProps) {
  const t = useTranslations();
  const name = server.name ?? server.id;
  const target = server.type === "stdio" ? server.command : server.url;

  return (
    <HudCard
      actions={
        <Stack align="center" direction="row" justify="between">
          <Container minW0 maxWidth="200px">
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {server.hasCredentials ? t("mcp.credentialsStored") : t("mcp.credentialsNone")}
            </Typography>
          </Container>
          <Button icon="gear" intent="ghost" onClick={() => onConfigure?.(server)} size="sm">
            {t("common.configure")}
          </Button>
        </Stack>
      }
      aside={
        <Tag tone={server.enabled ? "accent" : "neutral"}>
          <StatusDot size="75" tone={server.enabled ? "ok" : "idle"} />
          {server.type}
        </Tag>
      }
      description={server.desc ?? target ?? server.type}
      glyph="server"
      title={name}
    />
  );
}

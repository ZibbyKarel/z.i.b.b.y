"use client";

import { useTranslations } from "next-intl";
import { Button, Panel, Stack, Tag, Typography } from "@zibby/design-system";
import type { MarketplaceComponent, MarketplacePlugin } from "@zibby/contracts";

export enum MarketplacePluginPanelTestId {
  Install = "marketplace-plugin-install",
  Uninstall = "marketplace-plugin-uninstall",
  Installed = "marketplace-plugin-installed",
  Linked = "marketplace-plugin-linked",
  Hooks = "marketplace-plugin-hooks",
}

export interface MarketplacePluginPanelProps {
  plugin: MarketplacePlugin;
  pending: boolean;
  onInstall: (plugin: string) => void;
  onUninstall: (plugin: string) => void;
}

function ComponentList({ title, items }: { title: string; items: MarketplaceComponent[] }) {
  const t = useTranslations("marketplaces");
  return (
    <Stack gap="50">
      <Typography size="sm" type="note" weight="bold">
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography size="sm" type="note" variant="secondary">
          {t("none")}
        </Typography>
      ) : (
        items.map((item) => (
          <Typography key={item.name} size="sm" type="note" variant="secondary">
            <Typography mono as="span" size="sm" type="note">
              {item.name}
            </Typography>
            {item.description ? ` — ${item.description}` : ""}
          </Typography>
        ))
      )}
    </Stack>
  );
}

/** One plugin of a marketplace: install state, install/uninstall and its component inventory. */
export function MarketplacePluginPanel({
  plugin,
  pending,
  onInstall,
  onUninstall,
}: MarketplacePluginPanelProps) {
  const t = useTranslations("marketplaces");
  return (
    <Panel
      header={
        <Stack align="center" direction="row" gap="100">
          <Typography mono size="base" type="note" weight="bold">
            {plugin.name}
          </Typography>
          {plugin.version && (
            <Typography size="sm" type="note" variant="secondary">
              {t("version", { version: plugin.version })}
            </Typography>
          )}
          <Tag
            data-testid={MarketplacePluginPanelTestId.Installed}
            tone={plugin.installed ? "done" : "neutral"}
          >
            {plugin.installed ? t("installed") : t("notInstalled")}
          </Tag>
          {plugin.linked && (
            <Tag data-testid={MarketplacePluginPanelTestId.Linked} tone="thinking">
              {t("linked")}
            </Tag>
          )}
        </Stack>
      }
      headerEnd={
        plugin.installed ? (
          <Button
            data-testid={MarketplacePluginPanelTestId.Uninstall}
            disabled={pending}
            icon="trash"
            intent="ghost"
            onClick={() => onUninstall(plugin.name)}
            size="sm"
          >
            {t("uninstall")}
          </Button>
        ) : (
          <Button
            data-testid={MarketplacePluginPanelTestId.Install}
            disabled={pending}
            icon="plus"
            intent="secondary"
            onClick={() => onInstall(plugin.name)}
            size="sm"
          >
            {t("install")}
          </Button>
        )
      }
      padding="200"
    >
      <Stack gap="150">
        {plugin.description && (
          <Typography size="sm" type="note" variant="secondary">
            {plugin.description}
          </Typography>
        )}
        <ComponentList items={plugin.skills} title={t("skills")} />
        <ComponentList items={plugin.agents} title={t("agents")} />
        <ComponentList items={plugin.commands} title={t("commands")} />
        <Typography data-testid={MarketplacePluginPanelTestId.Hooks} size="sm" type="note">
          {t("hooks")}: {plugin.hooks ? t("hooksYes") : t("hooksNo")}
        </Typography>
        <Typography size="sm" type="note">
          {t("mcpServers")}:{" "}
          {plugin.mcpServers.length > 0 ? plugin.mcpServers.join(", ") : t("none")}
        </Typography>
      </Stack>
    </Panel>
  );
}

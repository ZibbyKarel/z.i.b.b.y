"use client";

import {
  Icon,
  type IconName,
  MenuButton,
  type MenuButtonEntry,
  Stack,
  type SubNavLinkComponent,
} from "@zibby/design-system";
import { MODEL_FAMILIES, type ModelFamily } from "@zibby/contracts";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { modelFamilyChoice } from "../../../features/ai-providers";
import { useAiEnginesQuery } from "../../../features/ai-providers/queries";
import { useSetSystemConfigMutation } from "../../../features/system/mutations";
import { useSystemConfigQuery } from "../../../features/system/queries";

export enum AiEngineSwitcherTestId {
  Root = "ai-engine-switcher-root",
  SaveFailed = "ai-engine-switcher-save-failed",
}

export const FAMILY_ICON: Record<ModelFamily, IconName> = {
  claude: "claude",
  openai: "openai",
  opencode: "opencode",
  bluecode: "code",
};

/** Top-bar family switch: the active family's glyph opens the other families (same write as Settings). */
export function AiEngineSwitcher(): ReactNode {
  const t = useTranslations("aiEngine");
  const { data: config } = useSystemConfigQuery();
  const { data } = useAiEnginesQuery();
  const setConfig = useSetSystemConfigMutation();
  if (!config) return null;

  const { disconnected, choose } = modelFamilyChoice(config, data?.engines, setConfig.mutate);
  const items: MenuButtonEntry[] = [
    ...MODEL_FAMILIES.filter((f) => f !== config.modelFamily).map((f) => ({
      id: f,
      label: t(`family.${f}`),
      icon: FAMILY_ICON[f],
      disabled: disconnected.includes(f),
      description: disconnected.includes(f) ? t("switcherNotConnected") : undefined,
      onSelect: () => choose(f),
    })),
    { id: "divider", divider: true },
    {
      id: "settings",
      label: t("switcherSettings"),
      icon: "gear",
      href: "/system/settings/ai-models",
    },
  ];

  return (
    <Stack align="center" data-testid={AiEngineSwitcherTestId.Root} direction="row" gap="50">
      <MenuButton
        ariaLabel={t("switcher", { family: t(`family.${config.modelFamily}`) })}
        icon={FAMILY_ICON[config.modelFamily]}
        intent="ghost"
        items={items}
        linkComponent={Link as SubNavLinkComponent}
        size="md"
      />
      {setConfig.isError && (
        <span
          aria-label={t("saveFailed")}
          data-testid={AiEngineSwitcherTestId.SaveFailed}
          role="img"
          title={t("saveFailed")}
        >
          <Icon name="warn" size="sm" tone="warn" />
        </span>
      )}
    </Stack>
  );
}

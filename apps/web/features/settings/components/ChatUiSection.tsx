"use client";

import { useTranslations } from "next-intl";
import { Stack, ToggleField, Typography } from "@zibby/design-system";
import type { SystemConfig } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";

export enum ChatUiSectionTestId {
  Root = "chat-ui-section",
  PowerSaverToggle = "chat-ui-section-power-saver-toggle",
}

/**
 * Chat UI settings — currently just the „Úsporný mód" (power-saver) toggle for
 * the chat's 3D scene. Persisted on the file-backed {@link SystemConfig}
 * (`powerSaver`), instant-apply (no Save button), same posture as `ChatSection`.
 */
export function ChatUiSection() {
  const { data: config } = useSystemConfigQuery();
  if (!config) return null;
  return <ChatUiEditor config={config} />;
}

function ChatUiEditor({ config }: { config: SystemConfig }) {
  const t = useTranslations("settings");
  const setConfig = useSetSystemConfigMutation();

  return (
    <HudPanel padding="300" title={t("chatUi.title")}>
      <Stack data-testid={ChatUiSectionTestId.Root} gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("chatUi.hint")}
        </Typography>

        <ToggleField
          checked={config.powerSaver ?? false}
          data-testid={ChatUiSectionTestId.PowerSaverToggle}
          hint={t("chatUi.powerSaverHint")}
          label={t("chatUi.powerSaver")}
          onChange={(next) => setConfig.mutate({ body: { ...config, powerSaver: next } })}
        />
      </Stack>
    </HudPanel>
  );
}

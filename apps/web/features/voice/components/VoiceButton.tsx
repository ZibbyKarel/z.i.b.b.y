"use client";

import { useTranslations } from "next-intl";
import { Button } from "@zibby/design-system";
import { useVoice } from "../VoiceContext";
import { formatShortcutParts } from "../shortcut";

/**
 * Top-bar entry point to the voice interface. A quiet mono "VOICE" action that
 * opens the takeover; its tooltip advertises the live (rebindable) shortcut.
 */
export function VoiceButton() {
  const t = useTranslations("topbar");
  const { open, shortcut } = useVoice();
  const combo = formatShortcutParts(shortcut).join(" ");

  return (
    <Button
      aria-label={t("voiceLabel")}
      icon="mic"
      intent="outline"
      onClick={open}
      size="xs"
      title={`${t("voiceTitle")} (${combo})`}
    >
      {t("voice")}
    </Button>
  );
}

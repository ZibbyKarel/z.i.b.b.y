"use client";

import { Button, Kbd } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { CHAT_SHORTCUT_KEY, useChat } from "../ChatContext";

export enum ChatButtonTestId {
  Root = "chat-button",
}

/**
 * Top-bar entry point to the chat overlay — a ghost action mirroring the
 * neighbouring New Task trigger, with a visible ⌘J shortcut badge.
 */
export function ChatButton() {
  const t = useTranslations("chat");
  const { toggle } = useChat();

  return (
    <Button
      aria-label={t("triggerAria")}
      data-testid={ChatButtonTestId.Root}
      icon="bot"
      intent="ghost"
      onClick={toggle}
      size="sm"
      title={`${t("triggerTitle")} (⌘${CHAT_SHORTCUT_KEY.toUpperCase()})`}
    >
      {t("triggerLabel")}
      <Kbd>⌘{CHAT_SHORTCUT_KEY.toUpperCase()}</Kbd>
    </Button>
  );
}

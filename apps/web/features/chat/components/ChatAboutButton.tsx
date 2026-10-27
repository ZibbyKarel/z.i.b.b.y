"use client";

import type { ChatAbout } from "@zibby/contracts";
import { Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useOptionalChat } from "../ChatContext";

export enum ChatAboutButtonTestId {
  Root = "chat-about-button",
}

export interface ChatAboutButtonProps {
  about: ChatAbout;
  /** Overrides the default "Talk it over in chat" text. */
  label?: string;
}

/**
 * The one affordance a screen drops in to open the chat dock about a thing.
 * Renders nothing outside a `ChatProvider`, so it is safe to place anywhere.
 */
export function ChatAboutButton({ about, label }: ChatAboutButtonProps) {
  const t = useTranslations("chat");
  const chat = useOptionalChat();
  if (!chat) return null;
  return (
    <Button
      data-testid={ChatAboutButtonTestId.Root}
      icon="chat"
      intent="outline"
      onClick={() => chat.openAbout(about)}
      size="sm"
      title={t("about.buttonTitle")}
    >
      {label ?? t("about.button")}
    </Button>
  );
}

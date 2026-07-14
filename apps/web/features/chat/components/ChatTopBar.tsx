"use client";

import { GlassSurface, SearchBar, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
}

export interface ChatTopBarProps {
  onOpenPalette: () => void;
}

/**
 * The Velín-D glass top bar: the live status pill, the ⌘K searchbox, the Claude
 * limits gauge and the language selector — each in its own single GlassSurface.
 * The mode sign and clock were removed (not in the design). The HUD switch and the
 * 56px header geometry arrive in the next task.
 */
export function ChatTopBar({ onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");

  return (
    <Stack align="center" data-testid={ChatTopBarTestId.Root} direction="row" gap="150">
      <GlassSurface radius="pill">
        <StatusPill />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Search} radius="pill">
        <SearchBar
          ariaLabel={t("palette.placeholder")}
          onClick={onOpenPalette}
          placeholder={t("palette.placeholder")}
          shortcut="⌘K"
        />
      </GlassSurface>

      <GlassSurface radius="pill">
        <LimitsRings />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Lang} radius="pill">
        <LangSwitch />
      </GlassSurface>
    </Stack>
  );
}

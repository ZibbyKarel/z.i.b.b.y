"use client";

import { GlassSurface, Icon, SearchBar, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { useNow } from "../../../hooks/useNow";
import type { ChatMode } from "../chatMode";
import { MODE_DOT } from "../chatMode";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Mode = "chat-top-bar-mode",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
  Clock = "chat-top-bar-clock",
}

export interface ChatTopBarProps {
  mode: ChatMode;
  onOpenPalette: () => void;
}

const MINUTE_MS = 60_000;

/**
 * The Velín-D glass top bar (Task 3): butler sign + mode label + status dot on
 * the left, the subsystem status pill and the ⌘K search trigger centered, and
 * the Claude limits gauge, language switch and clock on the right. Every glass
 * region is its own `GlassSurface radius="pill"` — no bespoke glass CSS here.
 */
export function ChatTopBar({ mode, onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");
  const now = useNow(MINUTE_MS);
  const dot = MODE_DOT[mode];
  const clock = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  return (
    <Stack align="center" data-testid={ChatTopBarTestId.Root} direction="row" gap="150">
      <Stack align="center" data-testid={ChatTopBarTestId.Mode} direction="row" gap="100">
        <Icon name="butlerSign" />
        <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
          {t("modeLabel")}
        </Typography>
        <StatusDot data-testid="chat-screen-mode-dot" pulse={dot.pulse} tone={dot.tone} />
      </Stack>

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

      <Typography mono data-testid={ChatTopBarTestId.Clock} size="xs" type="note" variant="secondary">
        {clock}
      </Typography>
    </Stack>
  );
}

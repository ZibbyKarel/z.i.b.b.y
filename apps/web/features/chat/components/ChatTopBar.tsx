"use client";

import { GlassSurface, Icon, SearchBar, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Hud = "chat-top-bar-hud",
  Lang = "chat-top-bar-lang",
}

export interface ChatTopBarProps {
  onOpenPalette: () => void;
}

/**
 * `apps/web/global.d.ts` types next-intl's `AppConfig.Messages` against the real,
 * current `en.json`, so `t()` type-checks every namespace/key literally — an
 * unknown key is a hard `TS2345`, not a soft runtime fallback. `chat.hudSwitchLabel`
 * is added in Task 7 (catalogs are that task's sole job here); until then this local
 * English placeholder stands in, mirroring Task 4's `FLYOUT_COPY` precedent. Task 7
 * should swap this back to `t("hudSwitchLabel")` once the catalog key lands.
 */
const HUD_SWITCH_LABEL = "Overview";

/**
 * The Velín-D glass top bar — exactly five elements, left→right: the live status
 * pill (+ the phase-3a flyout), the ⌘K searchbox, the Claude limits gauge, a switch
 * back to the HUD UI, and the language selector. A 56px transparent header; every
 * element carries its own single GlassSurface (no mode sign, no clock — not in the
 * design). The searchbox uses the transparent surface so the glass shows through;
 * the HUD switch is a 40×40 circular glass link to the classic HUD overview.
 */
export function ChatTopBar({ onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");

  return (
    <Stack
      align="center"
      as="header"
      data-testid={ChatTopBarTestId.Root}
      direction="row"
      gap="150"
      style={{ height: "56px" }}
    >
      <GlassSurface radius="pill">
        <StatusPill />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Search} radius="pill" style={{ width: 190 }}>
        <SearchBar
          ariaLabel={t("palette.placeholder")}
          onClick={onOpenPalette}
          placeholder={t("palette.placeholder")}
          shortcut="⌘K"
          surface="transparent"
        />
      </GlassSurface>

      <GlassSurface radius="pill">
        <LimitsRings />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Hud} radius="pill" style={{ height: 40, width: 40 }}>
        <Link
          aria-label={HUD_SWITCH_LABEL}
          className="flex size-10 items-center justify-center text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent"
          href="/overview"
        >
          <Icon name="grid" size="sm" />
        </Link>
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Lang} radius="pill">
        <LangSwitch />
      </GlassSurface>
    </Stack>
  );
}

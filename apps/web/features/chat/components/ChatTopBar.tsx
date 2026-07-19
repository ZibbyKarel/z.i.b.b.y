"use client";

import { Container, GlassSurface, Icon, SearchBar, Stack } from "@zibby/design-system";
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
 * The Velín-D glass top bar — exactly five elements, left→right: the live status
 * pill (+ the phase-3a flyout), the ⌘K searchbox, the Claude limits gauge, a switch
 * back to the HUD UI, and the language selector. A 56px transparent header; every
 * element carries its own single GlassSurface (no mode sign, no clock — not in the
 * design). The searchbox uses the transparent surface so the glass shows through;
 * the HUD switch is a 40×40 circular glass link — historically to the classic HUD
 * `/overview`.
 *
 * F8d: `/overview` is deleted and every surviving `NAV_ITEMS` route is already
 * `FULLSCREEN_ROUTES`-immersive (F8a–c) — there is no more "classic HUD" screen
 * left for this icon to switch to ahead of F10's formal chrome removal. Repointed
 * to `/chat` (this component's own page) rather than left dangling on a 404;
 * flagged, not resolved: whether the icon itself should be removed now — dropping
 * the topbar from five elements to four, a deliberate prior contract this phase
 * didn't feel entitled to unilaterally break — is an operator call.
 */
export function ChatTopBar({ onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");

  return (
    <Container padding={["150", "200"]}>
      <Stack
        align="center"
        as="header"
        data-testid={ChatTopBarTestId.Root}
        direction="row"
        gap="150"
        justify="between"
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

        <Stack direction="row" gap="150">
          <GlassSurface radius="pill">
            <LimitsRings />
          </GlassSurface>

          <GlassSurface data-testid={ChatTopBarTestId.Hud} radius="pill">
            <Link
              aria-label={t("hudSwitchLabel")}
              className="flex size-10 items-center justify-center text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent"
              href="/chat"
            >
              <Icon name="grid" size="sm" />
            </Link>
          </GlassSurface>

          {/* Design (topbar 1:1) drops the glass wrapper here; the testid lives on
              a plain Container so the compact code-only switch stays transparent. */}
          <Container data-testid={ChatTopBarTestId.Lang}>
            <LangSwitch size="md" />
          </Container>
        </Stack>
      </Stack>
    </Container>
  );
}

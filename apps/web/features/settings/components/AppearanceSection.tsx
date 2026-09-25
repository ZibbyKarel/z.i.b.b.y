"use client";

import { SegmentedControl, Stack, Toggle, Typography } from "@zibby/design-system";
import type { ThemeChoice } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { type MotionChoice, useAppearance } from "../../../state/appearance";

const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];

/**
 * `/system/settings/appearance` (ZB-11, ROUTE-MAP §3 "(new) appearance"): theme
 * light/dark/system, wired straight to `AppearanceProvider` (which itself wraps
 * `DesignSystemProvider`, so a choice applies immediately, no reload), and
 * reduced motion — a per-viewer `localStorage` convenience independent of the OS
 * `prefers-reduced-motion` query (see `theme/globals.css`'s `[data-motion="reduced"]`
 * override).
 */
export function AppearanceSection() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme, motion, setMotion } = useAppearance();

  return (
    <HudPanel padding="300" surface="glass" title={t("title")}>
      <Stack gap="250">
        <Stack gap="100">
          <Typography type="text" weight="medium">
            {t("themeLabel")}
          </Typography>
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("themeHint")}
          </Typography>
          <SegmentedControl
            ariaLabel={t("themeLabel")}
            items={THEME_CHOICES.map((choice) => ({ value: choice, label: t(`theme.${choice}`) }))}
            onChange={(value) => setTheme(value as ThemeChoice)}
            value={theme}
          />
        </Stack>

        <Stack align="center" direction="row" gap="250" justify="between">
          <Stack gap="50">
            <Typography type="text" weight="medium">
              {t("motionLabel")}
            </Typography>
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              {t("motionHint")}
            </Typography>
          </Stack>
          <Toggle
            checked={motion === "reduced"}
            label={t("motionLabel")}
            onChange={(checked) =>
              setMotion((checked ? "reduced" : "system") satisfies MotionChoice)
            }
          />
        </Stack>
      </Stack>
    </HudPanel>
  );
}

"use client";

import { Button, useResolvedTheme } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useAppearance } from "../../../state/appearance";

export enum ThemeToggleTestId {
  Trigger = "theme-toggle-trigger",
}

/** Top-bar light/dark switch. Shows the theme you'd switch TO (moon in light,
 *  sun in dark) and sets the explicit opposite of what is on screen — `system`
 *  stays selectable in Settings → Appearance. */
export function ThemeToggle() {
  const t = useTranslations("shell");
  const { setTheme } = useAppearance();
  const next = useResolvedTheme() === "dark" ? "light" : "dark";
  return (
    <Button
      aria-label={t(next === "dark" ? "themeToDark" : "themeToLight")}
      data-testid={ThemeToggleTestId.Trigger}
      icon={next === "dark" ? "moon" : "sun"}
      intent="ghost"
      onClick={() => setTheme(next)}
      size="sm"
    />
  );
}

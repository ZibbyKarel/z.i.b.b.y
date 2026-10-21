"use client";

import {
  CommandBar,
  CommandBarButton,
  CommandBarGroup,
  CommandBarText,
  DENSITIES,
  DensityMenu,
  SegmentedControl,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useUiSettings } from "../../system";
import { CUSTOM_PRESET } from "../state/useBridgeState";

/** `THU 24 SEP · 14:32` in the active locale (uppercase). */
export function formatBridgeClock(now: Date, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const date = [get("weekday"), get("day"), get("month")].filter(Boolean).join(" ");
  return `${date} · ${get("hour")}:${get("minute")}`.toLocaleUpperCase(locale);
}

/** Current time, re-rendered at every minute boundary. Null before mount (SSR-safe). */
function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

export interface BridgeHeaderProps {
  preset: string;
  /** Saved layout names, in creation order. */
  saved: readonly string[];
  editing: boolean;
  onPreset: (name: string) => void;
  onToggleEditing: () => void;
  onToggleCatalog: () => void;
  onSaveAs: () => void;
  onReset: () => void;
}

/** The Bridge header: layout presets, density (system-wide), edit controls and the clock. */
export function BridgeHeader({
  preset,
  saved,
  editing,
  onPreset,
  onToggleEditing,
  onToggleCatalog,
  onSaveAs,
  onReset,
}: BridgeHeaderProps) {
  const t = useTranslations("bridge");
  const locale = useLocale();
  const { ui, setDensity } = useUiSettings();
  const now = useMinuteClock();

  const presetLabel = (name: string) =>
    name === "DEFAULT"
      ? t("preset.DEFAULT")
      : name === "REVIEW"
        ? t("preset.REVIEW")
        : name === CUSTOM_PRESET
          ? t("preset.CUSTOM")
          : name;
  const names = [
    "DEFAULT",
    "REVIEW",
    ...saved,
    ...(preset === CUSTOM_PRESET ? [CUSTOM_PRESET] : []),
  ];

  return (
    <CommandBar logo={false} title={t("title")}>
      <CommandBarGroup>
        <CommandBarText faint>{t("layout")}</CommandBarText>
        <SegmentedControl
          plain
          ariaLabel={t("layout")}
          items={names.map((name) => ({ value: name, label: presetLabel(name) }))}
          onChange={(name) => name !== CUSTOM_PRESET && onPreset(name)}
          value={preset}
        />
      </CommandBarGroup>
      <DensityMenu
        label={t("density.label")}
        labels={Object.fromEntries(DENSITIES.map((d) => [d, t(`density.${d}`)])) as never}
        onChange={setDensity}
        value={ui.density}
      />
      {editing ? (
        <CommandBarGroup>
          <CommandBarButton onClick={onToggleCatalog}>{t("addWidget")}</CommandBarButton>
          <CommandBarButton onClick={onSaveAs}>{t("saveAs")}</CommandBarButton>
          <CommandBarButton onClick={onReset}>{t("reset")}</CommandBarButton>
        </CommandBarGroup>
      ) : null}
      <CommandBarButton look={editing ? "done" : "edit"} onClick={onToggleEditing}>
        {editing ? t("done") : t("editLayout")}
      </CommandBarButton>
      <CommandBarText>{now ? formatBridgeClock(now, locale) : ""}</CommandBarText>
    </CommandBar>
  );
}

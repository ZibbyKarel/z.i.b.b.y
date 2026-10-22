"use client";

import {
  CommandBar,
  CommandBarButton,
  CommandBarGroup,
  CommandBarText,
  ConfirmDeleteButton,
  Container,
  DENSITIES,
  DensityMenu,
  MenuButton,
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

export enum BridgeHeaderTestId {
  More = "bridge-header-more",
  Favorite = "bridge-header-favorite",
  Delete = "bridge-header-delete",
}

export interface BridgeHeaderProps {
  preset: string;
  /** Saved layout names, in creation order. */
  saved: readonly string[];
  /** Saved layouts shown directly in the header (names not in `saved` are ignored). */
  favorites: readonly string[];
  editing: boolean;
  onPreset: (name: string) => void;
  onToggleEditing: () => void;
  onToggleCatalog: () => void;
  onSaveAs: () => void;
  onReset: () => void;
  onToggleFavorite: (name: string) => void;
  onDelete: (name: string) => void;
}

/** The Bridge header: layout presets, density (system-wide), edit controls and the clock. */
export function BridgeHeader({
  preset,
  saved,
  favorites,
  editing,
  onPreset,
  onToggleEditing,
  onToggleCatalog,
  onSaveAs,
  onReset,
  onToggleFavorite,
  onDelete,
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
  const isFav = (n: string) => favorites.includes(n);
  const others = saved.filter((n) => !isFav(n));
  const names = [
    "DEFAULT",
    "REVIEW",
    ...saved.filter((n) => isFav(n) || n === preset),
    ...(preset === CUSTOM_PRESET ? [CUSTOM_PRESET] : []),
  ];
  const activeSaved = saved.includes(preset);

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
        {others.length > 0 ? (
          <Container data-testid={BridgeHeaderTestId.More}>
            <MenuButton
              ariaLabel={t("moreLayouts")}
              items={others.map((n) => ({ id: n, label: n, onSelect: () => onPreset(n) }))}
              variant="kebab"
            />
          </Container>
        ) : null}
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
          {activeSaved ? (
            <>
              <Container data-testid={BridgeHeaderTestId.Favorite}>
                <CommandBarButton onClick={() => onToggleFavorite(preset)}>
                  {isFav(preset) ? t("unfavorite") : t("favorite")}
                </CommandBarButton>
              </Container>
              <Container data-testid={BridgeHeaderTestId.Delete}>
                <ConfirmDeleteButton
                  confirmLabel={t("deleteLayoutConfirm")}
                  label={t("deleteLayout")}
                  onConfirm={() => onDelete(preset)}
                />
              </Container>
            </>
          ) : null}
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

"use client";

import {
  CommandBar,
  CommandBarButton,
  CommandBarGroup,
  CommandBarText,
  Container,
  DENSITIES,
  DensityMenu,
  MenuButton,
  SegmentedControl,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useUiSettings } from "../../system";
import { CUSTOM_PRESET } from "../state/useBridgeState";

export enum BridgeHeaderTestId {
  More = "bridge-header-more",
  Manage = "bridge-header-manage",
  Save = "bridge-header-save",
  Cancel = "bridge-header-cancel",
}

export interface BridgeHeaderProps {
  preset: string;
  /** Non-DEFAULT layouts: `shown` sit in the header, `hidden` behind the dropdown. */
  layouts: { shown: readonly string[]; hidden: readonly string[] };
  editing: boolean;
  onPreset: (name: string) => void;
  onManage: () => void;
  onToggleCatalog: () => void;
  onSave: () => void;
  onCancel: () => void;
}

/** The Bridge header: layout presets, density (system-wide) and the edit controls. */
export function BridgeHeader({
  preset,
  layouts,
  editing,
  onPreset,
  onManage,
  onToggleCatalog,
  onSave,
  onCancel,
}: BridgeHeaderProps) {
  const t = useTranslations("bridge");
  const { ui, setDensity } = useUiSettings();

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
    ...layouts.shown,
    ...(layouts.hidden.includes(preset) ? [preset] : []),
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
        {layouts.hidden.length > 0 ? (
          <Container data-testid={BridgeHeaderTestId.More}>
            <MenuButton
              ariaLabel={t("moreLayouts")}
              items={layouts.hidden.map((n) => ({
                id: n,
                label: presetLabel(n),
                onSelect: () => onPreset(n),
              }))}
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
          <Container data-testid={BridgeHeaderTestId.Cancel}>
            <CommandBarButton onClick={onCancel}>{t("cancel")}</CommandBarButton>
          </Container>
          <Container data-testid={BridgeHeaderTestId.Save}>
            <CommandBarButton look="done" onClick={onSave}>
              {t("save")}
            </CommandBarButton>
          </Container>
        </CommandBarGroup>
      ) : (
        <Container data-testid={BridgeHeaderTestId.Manage}>
          <CommandBarButton look="edit" onClick={onManage}>
            {t("editLayout")}
          </CommandBarButton>
        </Container>
      )}
    </CommandBar>
  );
}

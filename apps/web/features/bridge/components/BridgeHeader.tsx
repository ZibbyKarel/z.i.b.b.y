"use client";

import {
  Button,
  CommandBarButton,
  CommandBarGroup,
  Container,
  DENSITIES,
  DensityMenu,
  MenuButton,
  SegmentedControl,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { PageActions } from "../../../components/layout/PageActions";
import { useUiSettings } from "../../system";
import { CUSTOM_PRESET } from "../state/useBridgeState";

export enum BridgeHeaderTestId {
  More = "bridge-header-more",
  Manage = "bridge-header-manage",
}

export interface BridgeHeaderProps {
  preset: string;
  /** Non-DEFAULT layouts: `shown` sit in the header, `hidden` behind the dropdown. */
  layouts: { shown: readonly string[]; hidden: readonly string[] };
  onPreset: (name: string) => void;
  onManage: () => void;
  onToggleCatalog: () => void;
}

/** The Bridge controls — layout presets, density (system-wide) and the edit
 *  controls (Add widget, manage layouts) — portalled into the shell's sub-menu row before "+ NEW TASK". */
export function BridgeHeader({
  preset,
  layouts,
  onPreset,
  onManage,
  onToggleCatalog,
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
    <PageActions>
      <CommandBarGroup>
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
      <CommandBarGroup>
        <CommandBarButton onClick={onToggleCatalog}>{t("addWidget")}</CommandBarButton>
        <Container data-testid={BridgeHeaderTestId.Manage}>
          <Button
            aria-label={t("editLayout")}
            icon="layout"
            intent="secondary"
            onClick={onManage}
            size="sm"
            title={t("editLayout")}
          />
        </Container>
      </CommandBarGroup>
    </PageActions>
  );
}

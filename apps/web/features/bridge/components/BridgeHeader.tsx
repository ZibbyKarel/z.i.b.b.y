"use client";

import {
  Button,
  CommandBarGroup,
  Container,
  DENSITIES,
  DensityMenu,
  SegmentedControl,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { PageActions } from "../../../components/layout/PageActions";
import { AutopilotToggle } from "../../autopilot";
import { useUiSettings } from "../../system";
import { CUSTOM_PRESET } from "../state/useBridgeState";

export enum BridgeHeaderTestId {
  Manage = "bridge-header-manage",
}

export interface BridgeHeaderProps {
  preset: string;
  /** Layouts shown in the header; hidden ones are only reachable from the manage dialog. */
  layouts: { shown: readonly string[]; hidden: readonly string[] };
  onPreset: (name: string) => void;
  onManage: () => void;
  onToggleCatalog: () => void;
}

/** The Bridge controls — the Autopilot switch, layout presets, density (system-wide) and the edit
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
    ...layouts.shown,
    ...(layouts.hidden.includes(preset) ? [preset] : []),
    ...(preset === CUSTOM_PRESET ? [CUSTOM_PRESET] : []),
  ];

  return (
    <PageActions>
      <AutopilotToggle />
      <CommandBarGroup>
        <SegmentedControl
          plain
          ariaLabel={t("layout")}
          items={names.map((name) => ({ value: name, label: presetLabel(name) }))}
          onChange={(name) => name !== CUSTOM_PRESET && onPreset(name)}
          size="sm"
          value={preset}
        />
      </CommandBarGroup>
      <DensityMenu
        label={t("density.label")}
        labels={Object.fromEntries(DENSITIES.map((d) => [d, t(`density.${d}`)])) as never}
        onChange={setDensity}
        value={ui.density}
      />
      <CommandBarGroup>
        <Button
          aria-label={t("addWidget")}
          icon="plus"
          intent="secondary"
          onClick={onToggleCatalog}
          size="md"
          title={t("addWidget")}
        />
        <Container data-testid={BridgeHeaderTestId.Manage}>
          <Button
            aria-label={t("editLayout")}
            icon="layout"
            intent="secondary"
            onClick={onManage}
            size="md"
            title={t("editLayout")}
          />
        </Container>
      </CommandBarGroup>
    </PageActions>
  );
}

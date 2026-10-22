"use client";

import { Stack, WidgetCatalog } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useUiSettings } from "../../system";
import { useBridgeState } from "../state/useBridgeState";
import { WIDGETS, WIDGET_TYPES } from "../widgets/registry";
import { BridgeBoard } from "./BridgeBoard";
import { BridgeHeader } from "./BridgeHeader";
import { DetailSheet } from "./DetailSheet";

export enum BridgeScreenTestId {
  Root = "bridge-screen-root",
}

/** `/dashboard` — the Bridge: header bar + configurable widget board (+ detail sheet overlay). */
export function BridgeScreen() {
  const t = useTranslations();
  const state = useBridgeState();
  const { ui } = useUiSettings();
  const [sheetSide, setSheetSide] = useState<"left" | "right">("right");

  const onBoard = new Set(state.layout.map((w) => w.type));
  const entries = WIDGET_TYPES.filter((type) => !onBoard.has(type)).map((type) => ({
    id: type,
    label: t(WIDGETS[type].labelKey),
    description: t(WIDGETS[type].descKey),
  }));

  return (
    <Stack
      data-testid={BridgeScreenTestId.Root}
      direction="col"
      style={{ height: "100%", position: "relative" }}
    >
      <BridgeHeader
        editing={state.editing}
        onPreset={state.applyPreset}
        onReset={state.reset}
        onSaveAs={() => state.saveAs(state.nextName)}
        onToggleCatalog={state.toggleCatalog}
        onToggleEditing={state.toggleEditing}
        preset={state.preset}
        saved={Object.keys(state.saved)}
      />
      <Stack grow minH0 direction="col" style={{ position: "relative" }}>
        <BridgeBoard density={ui.density} sheetSide={sheetSide} state={state} />
        {/* Sheet layer: the detail-sheet task renders its overlay here, over the board. */}
        <DetailSheet
          onClose={state.closeSelection}
          onSideChange={setSheetSide}
          selection={state.selection}
        />
      </Stack>
      {state.catalogOpen ? (
        <WidgetCatalog
          addLabel={t("bridge.catalog.add")}
          closeLabel={t("bridge.catalog.close")}
          emptyText={t("bridge.catalog.empty")}
          entries={entries}
          onAdd={(id) => state.add(id as (typeof WIDGET_TYPES)[number])}
          onClose={state.closeCatalog}
          title={t("bridge.catalog.title")}
        />
      ) : null}
    </Stack>
  );
}

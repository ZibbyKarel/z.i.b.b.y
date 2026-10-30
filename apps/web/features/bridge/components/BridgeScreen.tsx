"use client";

import { Stack, WidgetCatalog } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useIsPhone } from "../../../hooks/useIsPhone";
import { useUiSettings } from "../../system";
import { useBridgeState } from "../state/useBridgeState";
import { type BridgeSelection, WIDGETS, WIDGET_TYPES } from "../widgets/registry";
import { BridgeBoard } from "./BridgeBoard";
import { BridgeHeader } from "./BridgeHeader";
import { ManageLayoutsDialog } from "./ManageLayoutsDialog";
import { DetailSheet } from "./DetailSheet";

export enum BridgeScreenTestId {
  Root = "bridge-screen-root",
}

/** `/dashboard` — the Bridge: header bar + configurable widget board (+ detail sheet overlay). */
export function BridgeScreen() {
  const t = useTranslations();
  const state = useBridgeState();
  const { ui } = useUiSettings();
  const phone = useIsPhone();
  const router = useRouter();
  const [manageOpen, setManageOpen] = useState(false);
  const [sheetSide, setSheetSide] = useState<"left" | "right">("right");

  const onBoard = new Set(state.layout.map((w) => w.type));
  const entries = WIDGET_TYPES.filter((type) => !onBoard.has(type)).map((type) => ({
    id: type,
    label: t(WIDGETS[type].labelKey),
    description: t(WIDGETS[type].descKey),
  }));

  // Phones skip the side sheet: a row with a detail page navigates there.
  const openOnPhone = (sel: BridgeSelection) =>
    sel.href ? router.push(sel.href as Route) : state.setSelection(sel);

  return (
    <Stack
      data-testid={BridgeScreenTestId.Root}
      direction="col"
      style={{ height: "100%", position: "relative" }}
    >
      {/* Phones get a stacked board; the toolbar only offers the manage-layouts dialog. */}
      <BridgeHeader
        compact={phone}
        layouts={state.layouts}
        onManage={() => setManageOpen(true)}
        onPreset={state.applyPreset}
        onToggleCatalog={state.toggleCatalog}
        preset={state.preset}
      />
      <Stack grow minH0 direction="col" style={{ position: "relative" }}>
        <BridgeBoard
          density={ui.density}
          onOpen={phone ? openOnPhone : undefined}
          sheetSide={sheetSide}
          stacked={phone}
          state={state}
        />
        {/* Sheet layer: the detail-sheet task renders its overlay here, over the board. */}
        <DetailSheet
          onClose={state.closeSelection}
          onSideChange={setSheetSide}
          selection={state.selection}
        />
      </Stack>
      <ManageLayoutsDialog
        layouts={state.layouts}
        nextName={state.nextName}
        onAdd={state.addLayout}
        onArrange={state.arrange}
        onClose={() => setManageOpen(false)}
        onDelete={state.deleteLayout}
        onSelect={state.applyPreset}
        open={manageOpen}
        preset={state.preset}
        saved={state.saved}
      />
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

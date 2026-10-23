"use client";

import { BoardRow, BoardText } from "@zibby/design-system";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { usePagePins } from "../../pins";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

/** Pinned pages: one row per page pin, in pin order; a row navigates to the page. */
export function PinsWidget({ widget, onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const router = useRouter();
  const { pagePins } = usePagePins();

  useWidgetReport(
    { loading: false, count: pagePins.length, you: 0 },
    { onEmptyChange, onCountChange },
  );

  return pagePins.map((pin) => (
    <BoardRow
      key={pin.id}
      onClick={() => router.push(pin.id as Route)}
      rowKey={`${widget.id}:${pin.id}`}
      tone="neutral"
    >
      <BoardText kind="body">{pin.label}</BoardText>
    </BoardRow>
  ));
}

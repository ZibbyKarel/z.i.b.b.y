import type { ReactNode } from "react";
import type { WidgetType } from "../grid/layout";
import type { BridgeWidget } from "../grid/layout";
import { BriefingWidget } from "./BriefingWidget";
import { IssuesWidget } from "./IssuesWidget";
import { PrsWidget } from "./PrsWidget";
import { RunsWidget } from "./RunsWidget";
import { TasksWidget } from "./TasksWidget";

/** What a row opens in the detail sheet. `key` is the row's `data-rk` value. */
export interface BridgeSelection {
  kind: "issue" | "task" | "pr";
  id: string;
  /** Id of the widget the row lives in (J/K navigates within it). */
  widgetId: string;
  /** Unique row key within the board — equals the row element's `data-rk`. */
  key: string;
}

/** Header info a widget body reports to its frame (all optional). */
export interface BridgeWidgetInfo {
  /** Item count, shown zero-padded next to the label. */
  count?: number;
  /** Items needing the operator — shown as the `N YOU` badge when > 0. */
  you?: number;
  /** Right-aligned header note. The frame shows `ALL CLEAR` itself when empty. */
  aside?: string;
}

/**
 * Props every widget body receives.
 *
 * Contract for widget implementations:
 * - Call `onEmptyChange(true|false)` (in an effect, as data changes). Empty widgets collapse
 *   to their header outside edit mode; the body stays mounted (hidden) so it keeps reporting.
 * - Call `onCountChange({ count, you, aside })` to drive the header.
 * - Every clickable row MUST carry `data-rk={key}` (same string as `BridgeSelection.key`) —
 *   the detail sheet measures `[data-rk="…"]` to anchor itself next to the row. Rows call
 *   `onOpen({ kind, id, widgetId: widget.id, key })`; mark the open row via `selection?.key`.
 */
export interface BridgeWidgetProps {
  widget: BridgeWidget;
  editing: boolean;
  onEmptyChange: (empty: boolean) => void;
  onCountChange?: (info: BridgeWidgetInfo) => void;
  selection: BridgeSelection | null;
  onOpen: (selection: BridgeSelection) => void;
  /** Side the detail sheet opened to — pass to the selected `BoardRow`'s `sheetSide`. */
  sheetSide?: "left" | "right";
  /** Collapsed epic groups (`ui.bridge.epicClosed`), keyed by epic id (`none` = no epic). */
  epicClosed: Record<string, boolean>;
  onEpicToggle: (key: string, closed: boolean) => void;
}

export interface WidgetDefinition {
  /** i18n keys (next-intl, root namespace). */
  labelKey: `bridge.widget.${WidgetType}.label`;
  descKey: `bridge.widget.${WidgetType}.desc`;
  Component: (props: BridgeWidgetProps) => ReactNode;
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  briefing: {
    labelKey: "bridge.widget.briefing.label",
    descKey: "bridge.widget.briefing.desc",
    Component: BriefingWidget,
  },
  issues: {
    labelKey: "bridge.widget.issues.label",
    descKey: "bridge.widget.issues.desc",
    Component: IssuesWidget,
  },
  tasks: {
    labelKey: "bridge.widget.tasks.label",
    descKey: "bridge.widget.tasks.desc",
    Component: TasksWidget,
  },
  prs: {
    labelKey: "bridge.widget.prs.label",
    descKey: "bridge.widget.prs.desc",
    Component: PrsWidget,
  },
  runs: {
    labelKey: "bridge.widget.runs.label",
    descKey: "bridge.widget.runs.desc",
    Component: RunsWidget,
  },
};

/** Catalog / board order of the widget types. */
export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

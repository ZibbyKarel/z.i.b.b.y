import type { WidgetFilters } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import type { ReactNode } from "react";
import type { BridgeWidget, WidgetType } from "../grid/layout";
import { AutomationRunsWidget } from "./AutomationRunsWidget";
import { BriefingWidget } from "./BriefingWidget";
import { BudgetsWidget } from "./BudgetsWidget";
import { IssuesFilterControls, IssuesWidget } from "./IssuesWidget";
import { MentionsWidget } from "./MentionsWidget";
import { PinsWidget } from "./PinsWidget";
import { PrFilterControls } from "./PrFilterControls";
import { PrsWidget } from "./PrsWidget";
import { ProposalsWidget } from "./ProposalsWidget";
import { QuickActionsWidget } from "./QuickActionsWidget";
import { RunsWidget } from "./RunsWidget";
import { TasksWidget } from "./TasksWidget";
import { TeamKbWidget, TeamKbWidgetSettings } from "./TeamKbWidget";
import { TodoWidget } from "./TodoWidget";
import { WidgetSortSettings } from "./widgetFilters";

/** What a row opens in the detail sheet. `key` is the row's `data-rk` value. */
export interface BridgeSelection {
  kind: "issue" | "task" | "pr" | "run" | "quickAction" | "note" | "automation";
  id: string;
  /** Id of the widget the row lives in (J/K navigates within it). */
  widgetId: string;
  /** Unique row key within the board — equals the row element's `data-rk`. */
  key: string;
  /** The item's full detail page, when it has one — the phone dashboard navigates there
   *  instead of opening the sheet. Omitted for kinds without a page (pr, quickAction). */
  href?: string;
}

/** Header info a widget body reports to its frame (all optional). */
export interface BridgeWidgetInfo {
  /** First fetch still in flight — the frame shows a loader. */
  loading?: boolean;
  /** Item count, shown zero-padded next to the label. */
  count?: number;
  /** Items needing the operator — shown as the `N YOU` badge when > 0. */
  you?: number;
  /** Right-aligned header note. The frame shows `ALL CLEAR` itself when empty. */
  aside?: string;
  /** Sync button in the frame header (must be referentially stable). */
  onRefresh?: () => void;
  /** The sync is running — the button is disabled and spins. */
  refreshing?: boolean;
  /** A filter pick is applied — marks the header filters button. */
  filtersActive?: boolean;
}

/**
 * Props every widget body receives.
 *
 * Contract for widget implementations:
 * - Call `onEmptyChange(true|false)` (in an effect, as data changes). Empty widgets show their
 *   type icon; the body stays mounted (hidden) so it keeps reporting.
 * - Call `onCountChange({ count, you, aside })` to drive the header.
 * - Every clickable row MUST carry `data-rk={key}` (same string as `BridgeSelection.key`) —
 *   the detail sheet measures `[data-rk="…"]` to anchor itself next to the row. Rows call
 *   `onOpen({ kind, id, widgetId: widget.id, key })`; mark the open row via `selection?.key`.
 */
export interface BridgeWidgetProps {
  widget: BridgeWidget;
  /** The header `+` toggle is on (only for `addable` widgets): show the add UI. */
  adding: boolean;
  onEmptyChange: (empty: boolean) => void;
  onCountChange?: (info: BridgeWidgetInfo) => void;
  selection: BridgeSelection | null;
  onOpen: (selection: BridgeSelection) => void;
  /** Side the detail sheet opened to — pass to the selected `BoardRow`'s `sheetSide`. */
  sheetSide?: "left" | "right";
  /** Collapsed epic groups (`ui.bridge.epicClosed`), keyed by epic id (`none` = no epic). */
  epicClosed: Record<string, boolean>;
  onEpicToggle: (key: string, closed: boolean) => void;
  /** The header filters toggle is on (only for widgets with `Filters`): show the filter bar. */
  filtersOpen?: boolean;
}

/** Props of a widget type's own section in the settings dialog — edits a local draft. */
export interface WidgetSettingsProps {
  draft: BridgeWidget;
  onChange: (next: BridgeWidget) => void;
}

/** Props of a widget type's filter controls — the live filter bar and the settings defaults. */
export interface WidgetFiltersProps {
  pick: WidgetFilters;
  /** The whole next pick, unset groups already dropped. */
  onChange: (next: WidgetFilters) => void;
}

export interface WidgetDefinition {
  /** i18n keys (next-intl, root namespace). */
  labelKey: `bridge.widget.${WidgetType}.label`;
  descKey: `bridge.widget.${WidgetType}.desc`;
  /** Glyph of the widget type — shown in its empty state. */
  icon: IconName;
  Component: (props: BridgeWidgetProps) => ReactNode;
  /** Has a header `+` toggle that drives `BridgeWidgetProps.adding`. */
  addable?: true;
  /**
   * Filter controls of the type. Their presence adds the header filters toggle (drives
   * `BridgeWidgetProps.filtersOpen`) and a default-filters section to the settings dialog
   * (saved as `widget.filters`; the body starts from it via `useWidgetFilterPick`).
   */
  Filters?: (props: WidgetFiltersProps) => ReactNode;
  /** Type-specific section of the settings dialog, below the common name / remove part. */
  Settings?: (props: WidgetSettingsProps) => ReactNode;
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  briefing: {
    labelKey: "bridge.widget.briefing.label",
    descKey: "bridge.widget.briefing.desc",
    icon: "coffee",
    Component: BriefingWidget,
  },
  issues: {
    labelKey: "bridge.widget.issues.label",
    descKey: "bridge.widget.issues.desc",
    icon: "bug",
    Component: IssuesWidget,
    Filters: IssuesFilterControls,
    Settings: WidgetSortSettings,
  },
  tasks: {
    labelKey: "bridge.widget.tasks.label",
    descKey: "bridge.widget.tasks.desc",
    icon: "check",
    Component: TasksWidget,
  },
  prs: {
    labelKey: "bridge.widget.prs.label",
    descKey: "bridge.widget.prs.desc",
    icon: "branch",
    Component: PrsWidget,
    Filters: PrFilterControls,
    Settings: WidgetSortSettings,
  },
  runs: {
    labelKey: "bridge.widget.runs.label",
    descKey: "bridge.widget.runs.desc",
    icon: "play",
    Component: RunsWidget,
  },
  automationRuns: {
    labelKey: "bridge.widget.automationRuns.label",
    descKey: "bridge.widget.automationRuns.desc",
    icon: "clock",
    Component: AutomationRunsWidget,
  },
  pins: {
    labelKey: "bridge.widget.pins.label",
    descKey: "bridge.widget.pins.desc",
    icon: "pin",
    Component: PinsWidget,
  },
  todo: {
    labelKey: "bridge.widget.todo.label",
    descKey: "bridge.widget.todo.desc",
    icon: "pen",
    Component: TodoWidget,
    addable: true,
  },
  quickActions: {
    labelKey: "bridge.widget.quickActions.label",
    descKey: "bridge.widget.quickActions.desc",
    icon: "bolt",
    Component: QuickActionsWidget,
    addable: true,
  },
  teamKb: {
    labelKey: "bridge.widget.teamKb.label",
    descKey: "bridge.widget.teamKb.desc",
    icon: "book",
    Component: TeamKbWidget,
    Settings: TeamKbWidgetSettings,
  },
  proposals: {
    labelKey: "bridge.widget.proposals.label",
    descKey: "bridge.widget.proposals.desc",
    icon: "spark",
    Component: ProposalsWidget,
  },
  budgets: {
    labelKey: "bridge.widget.budgets.label",
    descKey: "bridge.widget.budgets.desc",
    icon: "dollar",
    Component: BudgetsWidget,
  },
  mentions: {
    labelKey: "bridge.widget.mentions.label",
    descKey: "bridge.widget.mentions.desc",
    icon: "chat",
    Component: MentionsWidget,
  },
};

/** Catalog / board order of the widget types. */
export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

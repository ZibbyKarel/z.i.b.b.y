import type { Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { CellStrip } from "../CellStrip/CellStrip";
import { StateDot } from "../StatePill/StatePill";
import { Typography } from "../Typography/Typography";

export enum OrgNodeTestId {
  Root = "org-node-root",
  Code = "org-node-code",
  Count = "org-node-count",
  Name = "org-node-name",
  Cells = "org-node-cells",
  Alert = "org-node-alert",
  AlertDot = "org-node-alert-dot",
}

export interface OrgNodeProps {
  code: string;
  name: string;
  /** One state per borrowed agent, in department order — the cell-strip glance. */
  cells: StateTone[];
  alert?: { state: StateTone; label: string };
  selected?: boolean;
  /** Renders as a real anchor when given (org map/department navigation). */
  href?: string;
  /** Renders as a button when `href` is omitted. */
  onClick?: () => void;
  ref?: Ref<HTMLElement>;
}

/**
 * DS.md §8 org node — a department card: code + agent count, name, the cell
 * strip, and (below a hairline) the alert line. A DS component rather than an
 * app composite (the app has no styling seam to reach this look — D-007).
 */
export function OrgNode({ code, name, cells, alert, selected, href, onClick, ref }: OrgNodeProps) {
  const interactive = Boolean(href || onClick);
  const className = cn(
    "flex w-full min-h-[128px] flex-col gap-2 border bg-surface-panel p-[10px] text-left",
    selected ? "border-ink" : "border-border",
    interactive && cn("cursor-pointer transition-colors hover:bg-elevated", focusRing),
  );

  const content = (
    <>
      <div className="flex items-center justify-between">
        <Typography data-testid={OrgNodeTestId.Code} tracking="wider" type="labelSm">
          {code}
        </Typography>
        <Typography data-testid={OrgNodeTestId.Count} tracking="wider" type="labelSm">
          {cells.length}
        </Typography>
      </div>
      <Typography data-testid={OrgNodeTestId.Name} type="body" weight="medium">
        {name}
      </Typography>
      <div className="min-h-[9px]" data-testid={OrgNodeTestId.Cells}>
        <CellStrip cells={cells} />
      </div>
      {alert && (
        <div
          className="mt-auto flex items-center gap-1.5 border-t border-border pt-2"
          data-testid={OrgNodeTestId.Alert}
        >
          <StateDot data-testid={OrgNodeTestId.AlertDot} px={7} state={alert.state} />
          <Typography type="labelSm" variant="secondary">
            {alert.label}
          </Typography>
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <a
        className={className}
        data-testid={OrgNodeTestId.Root}
        href={href}
        ref={ref as Ref<HTMLAnchorElement>}
      >
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        className={className}
        data-testid={OrgNodeTestId.Root}
        onClick={onClick}
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} data-testid={OrgNodeTestId.Root} ref={ref as Ref<HTMLDivElement>}>
      {content}
    </div>
  );
}

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
 * DS.md §8 org node — a department card, two columns: name + cell strip on
 * the left, code + alert on the right. Compacted so several stacked cards
 * fit a division column without clipping (ZB-15) — no standalone agent
 * count, the cell strip already carries that, one dot per agent.
 */
export function OrgNode({ code, name, cells, alert, selected, href, onClick, ref }: OrgNodeProps) {
  const interactive = Boolean(href || onClick);
  const className = cn(
    "flex w-full flex-col gap-1.5 border bg-surface-panel p-[10px] text-left",
    selected ? "border-ink" : "border-border",
    interactive && cn("cursor-pointer transition-colors hover:bg-elevated", focusRing),
  );

  const content = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Typography data-testid={OrgNodeTestId.Name} type="body" weight="medium">
          {name}
        </Typography>
        <div data-testid={OrgNodeTestId.Cells}>
          <CellStrip cells={cells} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Typography nowrap data-testid={OrgNodeTestId.Code} tracking="wider" type="labelSm">
          {code}
        </Typography>
        {alert && (
          <div className="flex items-center gap-1.5" data-testid={OrgNodeTestId.Alert}>
            <StateDot data-testid={OrgNodeTestId.AlertDot} px={7} state={alert.state} />
            <Typography nowrap type="labelSm" variant="secondary">
              {alert.label}
            </Typography>
          </div>
        )}
      </div>
    </div>
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

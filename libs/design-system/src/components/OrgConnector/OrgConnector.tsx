import type { CSSProperties } from "react";
import { cn } from "../../utils/cn";

export enum OrgConnectorTestId {
  Root = "org-connector-root",
}

export interface OrgConnectorProps {
  /** A vertical connector (trunk/drop/stub) or the horizontal department bus. */
  orientation: "vertical" | "horizontal";
  /** Vertical only — the two lengths the org map uses (COO trunk / focus stub
   *  are 22px, the per-node drop is 18px). Ignored for `horizontal` (the bus
   *  stretches via `style`'s `left`/`right` instead). */
  length?: 18 | 22;
  /** Renders `--ink` instead of the muted `--line2` — the selected department's
   *  path down to the focus panel (DS.md §8: "turn --ink when selected"). */
  active?: boolean;
  /** Keeps the connector's layout slot but renders it transparent — an
   *  unselected department's stub, which reserves the gap without drawing a line. */
  hidden?: boolean;
  /** Style passthrough for the bus's dynamic `left`/`right` inset (CLAUDE.md:
   *  a genuinely dynamic value with no DS prop goes through this seam). */
  style?: CSSProperties;
}

/**
 * DS.md §8 org node connector — the 1px `--line2` lines joining CEO → COO →
 * department nodes → the focus panel, turning `--ink` when selected. A DS
 * primitive (not an app composite) since apps/web never writes raw Tailwind
 * classes for these hairlines.
 */
export function OrgConnector({
  orientation,
  length = 22,
  active,
  hidden,
  style,
}: OrgConnectorProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      className={cn(
        vertical ? cn("w-px", length === 18 ? "h-[18px]" : "h-[22px]") : "absolute top-0 h-px",
        hidden ? "bg-transparent" : active ? "bg-ink" : "bg-border-strong",
      )}
      data-testid={OrgConnectorTestId.Root}
      style={style}
    />
  );
}

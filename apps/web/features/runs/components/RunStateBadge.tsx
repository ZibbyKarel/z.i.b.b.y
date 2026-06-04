import type { RunStatus } from "@zibby/contracts";
import { Badge, Icon } from "@zibby/design-system";
import { RUN_STATE } from "../run";

export interface RunStateBadgeProps {
  status: RunStatus;
  /** Canonical contract name, surfaced as a tooltip (design keeps it behind the Czech label). */
  canonTitle?: string;
  label: string;
  size?: "sm" | "md";
}

/** Run-state badge — Czech label up front, canonical contract name in the tooltip. */
export function RunStateBadge({ status, canonTitle, label, size = "sm" }: RunStateBadgeProps) {
  const meta = RUN_STATE[status];
  return (
    <span title={canonTitle ?? status}>
      <Badge size={size} tone={meta.badge}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <Icon name={meta.glyph} size="xs" />
          {label}
        </span>
      </Badge>
    </span>
  );
}

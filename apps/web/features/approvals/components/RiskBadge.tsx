import { Badge, Icon } from "@zibby/design-system";
import { type RiskType, riskMeta } from "../approval";

export interface RiskBadgeProps {
  type: RiskType | undefined;
  /** Localized label (the Screen owns the `t()` calls). */
  label: string;
  size?: "sm" | "md";
}

/** Semantic risk-type badge (platba / mazání / push / odeslání) — never renamed. */
export function RiskBadge({ type, label, size = "sm" }: RiskBadgeProps) {
  const meta = riskMeta(type);
  return (
    <Badge size={size} tone={meta.tone}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        <Icon name={meta.glyph} size={size === "md" ? "sm" : "xs"} />
        {label}
      </span>
    </Badge>
  );
}

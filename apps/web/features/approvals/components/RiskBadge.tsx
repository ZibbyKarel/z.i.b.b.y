import { Icon, Stack, Tag } from "@zibby/design-system";
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
    <Tag size={size} tone={meta.tone}>
      <Stack inline align="center" direction="row" gap="50">
        <Icon name={meta.glyph} size={size === "md" ? "sm" : "xs"} />
        {label}
      </Stack>
    </Tag>
  );
}

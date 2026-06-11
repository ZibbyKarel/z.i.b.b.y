import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * Risk categories — the only categorical palette in the design system
 * ("color = state, shape = category"; everything else is glyph + text).
 */
export type RiskKind = "payment" | "deletion" | "push" | "send";

const riskClass: Record<RiskKind, string> = {
  payment: "text-risk-payment border-risk-payment/25 bg-risk-payment/[0.08]",
  deletion: "text-risk-deletion border-risk-deletion/25 bg-risk-deletion/[0.08]",
  push: "text-risk-push border-risk-push/25 bg-risk-push/[0.08]",
  send: "text-risk-send border-risk-send/25 bg-risk-send/[0.08]",
};

const riskIcon: Record<RiskKind, IconName> = {
  payment: "dollar",
  deletion: "trash",
  push: "branch",
  send: "arrow",
};

/** English defaults — the app overrides with its own translations. */
const riskLabel: Record<RiskKind, string> = {
  payment: "payment",
  deletion: "deletion",
  push: "push",
  send: "send",
};

export type RiskTagSize = "sm" | "md";

export enum RiskTagTestId {
  Root = "risk-tag-root",
  Icon = "risk-tag-icon",
}

export interface RiskTagProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "className"
> {
  risk: RiskKind;
  /** md = larger density for the voice takeover. */
  size?: RiskTagSize;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Risk tag (design `ZtRisk`) — glyph + label tinted by the risk category.
 * Children override the default English label.
 */
export function RiskTag({ risk, size = "sm", children, ref, ...props }: RiskTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border font-mono font-semibold tracking-wide whitespace-nowrap",
        size === "sm" ? "px-[9px] py-[3px] text-xs" : "px-[11px] py-[5px] text-sm",
        riskClass[risk],
      )}
      data-testid={RiskTagTestId.Root}
      ref={ref}
      {...props}
    >
      <Icon data-testid={RiskTagTestId.Icon} name={riskIcon[risk]} size="xs" />
      {children ?? riskLabel[risk]}
    </span>
  );
}

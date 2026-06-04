import type { Approval as ContractApproval } from "@zibby/contracts";
import { Typography } from "@zibby/design-system";
import { SEVERITY } from "../approval";

export interface SeverityMeterProps {
  severity: ContractApproval["risk"];
  /** Localized severity label (shown only when `showLabel`). */
  label?: string;
  showLabel?: boolean;
}

/**
 * Three-segment severity meter — secondary to the semantic risk type, coloured by
 * the status palette (low=ok, medium=warn, high=bad). A small bespoke HUD visual,
 * so it uses the theme's color CSS variables directly.
 */
export function SeverityMeter({ severity, label, showLabel = false }: SeverityMeterProps) {
  const sev = SEVERITY[severity];
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: showLabel ? "0.45rem" : 0 }}
      title={`závažnost: ${sev.label}`}
    >
      <span style={{ display: "inline-flex", gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 4,
              height: 11,
              borderRadius: 1,
              background: i <= sev.segments ? sev.cssVar : "var(--color-border)",
              boxShadow: i <= sev.segments ? `0 0 5px ${sev.cssVar}` : "none",
            }}
          />
        ))}
      </span>
      {showLabel && label && (
        <Typography mono uppercase size="caption" tone={sev.tone} type="note" weight="bold">
          {label}
        </Typography>
      )}
    </span>
  );
}

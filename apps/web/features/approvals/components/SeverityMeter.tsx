import type { Approval as ContractApproval } from "@zibby/contracts";
import { Stack, Typography } from "@zibby/design-system";
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
    <Stack
      inline
      align="center"
      direction="row"
      gap={showLabel ? "75" : "0"}
      title={`závažnost: ${sev.label}`}
    >
      <Stack inline direction="row" gap="25">
        {[1, 2, 3].map((i) => (
          // Per-segment fill/glow are computed from the dynamic `sev.cssVar`; the
          // sizes are bespoke meter geometry — no DS prop expresses either.
          <span
            key={i}
            // eslint-disable-next-line react/forbid-dom-props
            style={{
              width: 4,
              height: 11,
              borderRadius: 1,
              background: i <= sev.segments ? sev.cssVar : "var(--color-border)",
              boxShadow: i <= sev.segments ? `0 0 5px ${sev.cssVar}` : "none",
            }}
          />
        ))}
      </Stack>
      {showLabel && label && (
        <Typography mono uppercase size="caption" tone={sev.tone} type="note" weight="bold">
          {label}
        </Typography>
      )}
    </Stack>
  );
}

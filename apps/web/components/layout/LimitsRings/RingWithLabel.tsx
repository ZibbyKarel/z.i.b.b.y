import type { LimitWindow } from "@zibby/contracts";
import { ProgressRing, Stack, Typography, getUsageTone } from "@zibby/design-system";

interface RingWithLabelProps {
  window: LimitWindow;
  shortLabel: string;
  ariaLabel: string;
  showTitle?: boolean;
}

export function RingWithLabel({ window, shortLabel, ariaLabel, showTitle }: RingWithLabelProps) {
  return (
    <Stack align="center" direction="row" gap="75">
      <ProgressRing label={ariaLabel} tone={getUsageTone(window.usedPct)} value={window.usedPct} />
      {showTitle && <Typography type="micro">{shortLabel}</Typography>}
    </Stack>
  );
}

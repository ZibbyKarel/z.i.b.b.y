import type { LimitWindow } from "@zibby/contracts";
import { ProgressRing, Stack, Typography, getUsageTone } from "@zibby/design-system";

interface RingWithLabelProps {
  window: LimitWindow;
  shortLabel: string;
  ariaLabel: string;
}

export function RingWithLabel({ window, shortLabel, ariaLabel }: RingWithLabelProps) {
  return (
    <Stack align="center" direction="row" gap="75">
      <ProgressRing label={ariaLabel} tone={getUsageTone(window.usedPct)} value={window.usedPct} />
      <Typography type="micro">{shortLabel}</Typography>
    </Stack>
  );
}

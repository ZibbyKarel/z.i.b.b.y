import { Stack, StatusDot, Typography } from "@zibby/design-system";

/** A mono key/value info row for the status panel. */
export function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <Stack align="center" direction="row" gap="150" justify="between">
      <Typography mono size="sm" type="note" variant="tertiary">
        {label}
      </Typography>
      <Stack align="center" direction="row" gap="75">
        {tone === "ok" && <StatusDot tone="ok" />}
        <Typography mono size="sm" tone={tone} type="note" weight="semibold">
          {value}
        </Typography>
      </Stack>
    </Stack>
  );
}

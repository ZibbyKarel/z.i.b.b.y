import { Stack, Typography } from "@zibby/design-system";

function Sep() {
  return (
    <Typography mono as="span" size="2xl" type="note" variant="tertiary">
      ·
    </Typography>
  );
}

export function BrandName() {
  return (
    <Typography mono as="div" size="2xl" tracking="mono" type="subtitle" weight="bold">
      <Stack align="center" direction="row" gap="150">
        Z<Sep />I<Sep />B<Sep />B<Sep />Y
      </Stack>
    </Typography>
  );
}

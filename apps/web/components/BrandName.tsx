import { Stack, Typography } from "@zibby/design-system";

function Sep() {
  return (
    <Typography mono as="span" size="2xl" type="note" variant="tertiary">
      ·
    </Typography>
  );
}

export interface BrandNameProps {
  /**
   * Wordmark text. Defaults to the letter-separated "Z·I·B·B·Y" treatment; any
   * other text (e.g. a project name) renders plain, without the dot separators.
   */
  text?: string;
}

export function BrandName({ text }: BrandNameProps) {
  return (
    <Typography mono as="div" size="2xl" tracking="mono" type="subtitle" weight="bold">
      {text ? (
        text
      ) : (
        <Stack align="center" direction="row" gap="150">
          Z<Sep />I<Sep />B<Sep />B<Sep />Y
        </Stack>
      )}
    </Typography>
  );
}

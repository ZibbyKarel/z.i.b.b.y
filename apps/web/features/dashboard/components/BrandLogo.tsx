import { Container, Icon, Stack, Typography } from "@zibby/design-system";

function Sep() {
  return (
    <Typography as="span" type="note" mono size="2xl" variant="tertiary">
      ·
    </Typography>
  );
}

export function BrandLogo() {
  return (
    <Container padding={["50", "75", "300", "75"]}>
      <Stack gap="100">
        <Stack direction="row" align="center" gap="150">
          <Icon name="butlerSign" size="xl" />
          <Typography as="div" type="subtitle" mono weight="bold" size="2xl" tracking="mono">
            Z<Sep />I<Sep />B<Sep />B<Sep />Y
          </Typography>
        </Stack>
        <Typography
          type="note"
          mono
          size="2xs"
          tracking="tighter"
          variant="tertiary"
          nowrap
        >
          Zestful Intuitive Brainy Butler for You
        </Typography>
      </Stack>
    </Container>
  );
}

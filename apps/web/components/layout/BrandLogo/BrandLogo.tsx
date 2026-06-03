import { useTranslations } from "next-intl";
import { Container, Icon, Stack, Typography } from "@zibby/design-system";

function Sep() {
  return (
    <Typography mono as="span" size="2xl" type="note" variant="tertiary">
      ·
    </Typography>
  );
}

export function BrandLogo() {
  const t = useTranslations("sidebar");
  return (
    <Container padding={["50", "75", "300", "75"]}>
      <Stack gap="100">
        <Stack align="center" direction="row" gap="150">
          <Icon name="butlerSign" size="xl" />
          <Typography mono as="div" size="2xl" tracking="mono" type="subtitle" weight="bold">
            Z<Sep />I<Sep />B<Sep />B<Sep />Y
          </Typography>
        </Stack>
        <Typography
          mono
          nowrap
          size="2xs"
          tracking="tighter"
          type="note"
          variant="tertiary"
        >
          {t("tagline")}
        </Typography>
      </Stack>
    </Container>
  );
}

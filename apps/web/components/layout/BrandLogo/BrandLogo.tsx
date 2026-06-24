import { Container, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { BrandIcon } from "../../BrandIcon";
import { BrandName } from "../../BrandName";

export function BrandLogo() {
  const t = useTranslations("sidebar");
  return (
    <Link href="/overview">
      <Container padding={["0", "0", "200", "0"]} textAlign="center">
        <Stack align="center" justify="center">
          {/* De-glowed brand — light is reserved for live states. */}
          <BrandIcon size={44} />
          <BrandName />
        </Stack>
        <Typography mono nowrap size="xs" tracking="tighter" type="note" variant="tertiary">
          {t("tagline")}
        </Typography>
      </Container>
    </Link>
  );
}

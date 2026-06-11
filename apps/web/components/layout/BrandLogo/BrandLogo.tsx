import Image from "next/image";
import { useTranslations } from "next-intl";
import { Container, Stack, Typography } from "@zibby/design-system";
import Link from "next/link";

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
    <Link href="/overview">
      <Container padding={["0", "0", "200", "0"]} textAlign="center">
        <Stack align="center" justify="center">
          {/* De-glowed brand — light is reserved for live states. */}
          <Image
            priority
            alt="ZIBBY"
            height={44}
            src="/z.i.b.b.y-icon.png"

            style={{ borderRadius: "50%" }}
            width={44}
          />
          <Typography
            mono
            as="div"
            size="2xl"
            tracking="mono"
            type="subtitle"
            weight="bold"
          >
            <Stack align="center" direction="row" gap="150">
              Z<Sep />I<Sep />B<Sep />B<Sep />Y
            </Stack>
          </Typography>
        </Stack>
        <Typography
          mono
          nowrap
          size="xs"
          tracking="tighter"
          type="note"
          variant="tertiary"
        >
          {t("tagline")}
        </Typography>
      </Container>
    </Link>
  );
}

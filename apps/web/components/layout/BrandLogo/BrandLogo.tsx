import type { Route } from "next";
import { Container, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { BrandIcon } from "../../BrandIcon";
import { BrandName } from "../../BrandName";

/**
 * Sidebar brand mark: the static z.i.b.b.y wordmark + tagline, always linking to
 * `/chat` (F8d — `/overview` is deleted; `/chat` is home now, O2/O3).
 *
 * Phase 108: this used to swap to the "active project" scope's own logo/name
 * (Phase 25, on top of Phase 24's app-wide project scope) — that scope is gone.
 * ZIBBY always shows every project's data at once, so the sidebar brand no
 * longer has a single "current engagement" to reflect.
 */
export function BrandLogo() {
  const t = useTranslations("sidebar");

  return (
    <Link href={"/chat" as Route}>
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

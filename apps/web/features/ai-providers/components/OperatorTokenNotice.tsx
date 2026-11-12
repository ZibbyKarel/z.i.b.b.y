"use client";

import { useTranslations } from "next-intl";
import { Stack, type SubNavLinkComponent, TextLink, Typography } from "@zibby/design-system";
import type { Route } from "next";
import Link from "next/link";

/** Testids for the operator-token notice. */
export enum OperatorTokenNoticeTestId {
  Root = "operator-token-notice",
  Link = "operator-token-notice-link",
}

/**
 * Inline message for a 401 on an engine write (the API guards engine changes with the operator
 * token): says the token is required and links to where it is set (Settings → General).
 */
export function OperatorTokenNotice() {
  const t = useTranslations("aiEngine");
  return (
    <Stack
      wrap
      align="center"
      data-testid={OperatorTokenNoticeTestId.Root}
      direction="row"
      gap="75"
    >
      <Typography size="sm" tone="bad" type="text">
        {t("operatorTokenRequired")}
      </Typography>
      <TextLink
        data-testid={OperatorTokenNoticeTestId.Link}
        href={"/system/settings/general" as Route}
        linkComponent={Link as SubNavLinkComponent}
      >
        {t("operatorTokenLink")}
      </TextLink>
    </Stack>
  );
}

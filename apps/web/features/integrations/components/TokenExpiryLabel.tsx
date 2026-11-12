import { useState } from "react";
import { useTranslations } from "next-intl";
import { Typography } from "@zibby/design-system";

export enum TokenExpiryLabelTestId {
  Root = "token-expiry-label",
}

export interface TokenExpiryLabelProps {
  /** `Integration.tokenExpiresAt`: ISO date, `null` = never expires, absent = unknown. */
  tokenExpiresAt: string | null | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the integration's access token expires — "NO EXPIRATION DATE", "expires in
 * N days" (partial days round up) or "token expired". Renders nothing while the
 * expiry is unknown (never tested, or the kind doesn't report it).
 */
export function TokenExpiryLabel({ tokenExpiresAt }: TokenExpiryLabelProps) {
  const t = useTranslations("integrations");
  // Lazy: Date.now() in render is lint-banned.
  const [now] = useState(() => Date.now());
  if (tokenExpiresAt === undefined) return null;
  const msLeft = tokenExpiresAt === null ? null : Date.parse(tokenExpiresAt) - now;
  return (
    <Typography
      mono
      truncate
      data-testid={TokenExpiryLabelTestId.Root}
      size="xs"
      tone={msLeft !== null && msLeft <= 0 ? "bad" : undefined}
      type="note"
      variant="tertiary"
    >
      {msLeft === null
        ? t("tokenNoExpiry")
        : msLeft <= 0
          ? t("tokenExpired")
          : t("tokenExpiresIn", { days: Math.ceil(msLeft / DAY_MS) })}
    </Typography>
  );
}

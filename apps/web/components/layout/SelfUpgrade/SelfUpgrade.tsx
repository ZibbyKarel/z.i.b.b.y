"use client";

import { useEffect, useState } from "react";
import { Button, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import {
  updateErrorMessage,
  useSelfStatusQuery,
  useSelfUpdateMutation,
} from "../../../features/self";

export enum SelfUpgradeTestId {
  Button = "self-upgrade-button",
  Error = "self-upgrade-error",
  /** Polite live region announcing the result ("Updated"/"Up to date") or the 409. */
  Status = "self-upgrade-status",
}

/** How long the "Updated" / "Up to date" confirmation replaces the label. */
const RESULT_MS = 5000;

type UpdateResult = "updated" | "upToDate";

/**
 * Header "Upgrade" button next to the limits — the operator-triggered,
 * fast-forward-only pull of the ZIBBY install (`POST /api/self/update`; never
 * autonomous, never forced). Hidden for a non-git install. A 409 (dirty tree /
 * diverged history) shows the server's message inline until the next click.
 * The result ("Updated"/"Up to date", for a few seconds) and the error render
 * beside the button inside an always-mounted polite live region, so screen
 * readers hear them; the button's accessible name always starts with its
 * visible "Upgrade" (WCAG 2.5.3 label-in-name).
 */
export function SelfUpgrade() {
  const t = useTranslations("shell.selfUpgrade");
  const { data: status } = useSelfStatusQuery();
  const update = useSelfUpdateMutation();
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  if (!status || status.currentBranch === "") return null;

  const handleClick = () => {
    setError(null);
    setResult(null);
    update.mutate(
      { body: {} },
      {
        onSuccess: (response) => {
          if (response.status === 200) setResult(response.body.updated ? "updated" : "upToDate");
        },
        onError: (err) => setError(updateErrorMessage(err) ?? t("failed")),
      },
    );
  };

  const label = status.behind > 0 ? t("labelBehind", { count: status.behind }) : t("label");
  const aria = status.dirty
    ? t("ariaDirty")
    : t("aria", { branch: status.currentBranch, behind: status.behind });
  const resultText =
    result === "updated" ? t("updated") : result === "upToDate" ? t("upToDate") : null;

  return (
    <Stack align="center" direction="row" gap="100">
      <Button
        aria-label={aria}
        data-testid={SelfUpgradeTestId.Button}
        disabled={update.isPending || status.dirty}
        intent="ghost"
        onClick={handleClick}
        size="sm"
        title={status.dirty ? t("dirty") : undefined}
      >
        {label}
      </Button>
      <Typography
        aria-live="polite"
        as="span"
        data-testid={SelfUpgradeTestId.Status}
        role="status"
        size="xs"
        tone={error ? "bad" : undefined}
        type="note"
        variant={error ? undefined : "tertiary"}
      >
        {error ? (
          <Typography
            as="span"
            data-testid={SelfUpgradeTestId.Error}
            size="xs"
            tone="bad"
            type="note"
          >
            {error}
          </Typography>
        ) : (
          resultText
        )}
      </Typography>
    </Stack>
  );
}

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
}

/** How long the "Updated" / "Up to date" confirmation replaces the label. */
const RESULT_MS = 5000;

type UpdateResult = "updated" | "upToDate";

/**
 * Header "Upgrade" button next to the limits — the operator-triggered,
 * fast-forward-only pull of the ZIBBY install (`POST /api/self/update`; never
 * autonomous, never forced). Hidden for a non-git install. A 409 (dirty tree /
 * diverged history) shows the server's message inline until the next click.
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

  const label =
    result === "updated"
      ? t("updated")
      : result === "upToDate"
        ? t("upToDate")
        : status.behind > 0
          ? t("labelBehind", { count: status.behind })
          : t("label");
  const aria = status.dirty
    ? t("dirty")
    : t("aria", { branch: status.currentBranch, behind: status.behind });

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
      {error && (
        <Typography data-testid={SelfUpgradeTestId.Error} size="xs" tone="bad" type="note">
          {error}
        </Typography>
      )}
    </Stack>
  );
}

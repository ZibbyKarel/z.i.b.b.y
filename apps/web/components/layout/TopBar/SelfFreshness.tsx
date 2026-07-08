"use client";

import { useState } from "react";
import type { SelfStatus } from "@zibby/contracts";
import { Button, Card, Container, Pressable, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSelfStatusQuery, useSelfUpdateMutation } from "../../../features/self";

export enum SelfFreshnessTestId {
  Root = "self-freshness-root",
  Dot = "self-freshness-dot",
  Label = "self-freshness-label",
  BehindText = "self-freshness-behind",
  UpdateButton = "self-freshness-update",
  UpdateError = "self-freshness-update-error",
  Popover = "self-freshness-popover",
  PopoverStatus = "self-freshness-popover-status",
  PrRow = "self-freshness-pr-row",
  PrEmpty = "self-freshness-pr-empty",
}

/**
 * Pull the `message` out of a ts-rest mutation error when it's a declared
 * error response (`{ status: 409, body: { message } }`) rather than a thrown
 * `Error` (network failure, schema drift) — narrowed defensively since the
 * error-response body's shape isn't reliably inferred through the union here.
 */
function updateErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("body" in error)) return undefined;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== "object" || !("message" in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/** Before the first successful poll — or if a poll fails — `data` is `undefined`.
 * Falling back to the same benign shape the API itself returns for a non-git
 * install keeps the control calm (no alarming flash) rather than empty. */
const FALLBACK_STATUS: SelfStatus = {
  currentBranch: "",
  defaultBranch: "",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: false,
};

/**
 * Phase 79 — the top-bar "is ZIBBY up to date?" control. A calm ok `StatusDot`
 * when the install is current; a warn dot + behind-count + "Aktualizovat" button
 * when it isn't (the button is a fast-forward-only pull — never autonomous,
 * never forced). Hovering/focusing the whole control reveals a popover with the
 * freshness line plus the open PRs on the repo, each a direct link so the
 * operator jumps straight to GitHub to review/merge.
 */
export function SelfFreshness() {
  const t = useTranslations("topbar.self");
  const { data } = useSelfStatusQuery();
  const status = data ?? FALLBACK_STATUS;
  const update = useSelfUpdateMutation();
  const [open, setOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleUpdate = () => {
    setUpdateError(null);
    update.mutate(
      { body: {} },
      {
        // A 409 (dirty tree / non-fast-forward) lands here, not onSuccess — ts-rest
        // routes any non-2xx declared status to onError. Surface the server's
        // message inline rather than the global mutation-error toast's generic copy.
        onError: (error) => {
          setUpdateError(updateErrorMessage(error) ?? t("updateFailed"));
        },
      },
    );
  };

  return (
    <Container
      data-testid={SelfFreshnessTestId.Root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      position="relative"
    >
      <Stack align="center" direction="row" gap="100">
        <Pressable aria-expanded={open} aria-label={t("panelTitle")}>
          <Stack align="center" direction="row" gap="75">
            <StatusDot
              data-testid={SelfFreshnessTestId.Dot}
              pulse={!status.upToDate}
              tone={status.upToDate ? "ok" : "wait"}
            />
            <Typography
              data-testid={SelfFreshnessTestId.Label}
              tone={status.upToDate ? "ok" : "warn"}
              type="label"
            >
              {status.upToDate ? t("statusCurrent") : t("statusUpgrade")}
            </Typography>
            {!status.upToDate && (
              <Typography
                data-testid={SelfFreshnessTestId.BehindText}
                size="xs"
                type="note"
                variant="tertiary"
              >
                {t("behind", { count: status.behind })}
              </Typography>
            )}
          </Stack>
        </Pressable>

        {!status.upToDate && (
          <Button
            data-testid={SelfFreshnessTestId.UpdateButton}
            intent="primary"
            loading={update.isPending}
            onClick={handleUpdate}
            size="sm"
          >
            {t("updateButton")}
          </Button>
        )}

        {updateError && (
          <Typography data-testid={SelfFreshnessTestId.UpdateError} size="xs" tone="bad" type="note">
            {updateError}
          </Typography>
        )}
      </Stack>

      {open && (
        <Container position="absolute" right="0" top="100%" width="280px" zIndex={60}>
          <Card background="elevated" radius="lg" shadow="dropdown">
            <Container padding="200">
              <Stack data-testid={SelfFreshnessTestId.Popover} gap="150">
                <Typography data-testid={SelfFreshnessTestId.PopoverStatus} type="label">
                  {status.upToDate ? t("upToDate") : t("behind", { count: status.behind })}
                </Typography>
                <Stack gap="75">
                  {status.prs.length === 0 ? (
                    <Typography
                      data-testid={SelfFreshnessTestId.PrEmpty}
                      size="sm"
                      type="note"
                      variant="tertiary"
                    >
                      {t("noOpenPrs")}
                    </Typography>
                  ) : (
                    <>
                      <Typography size="xs" type="note" variant="tertiary">
                        {t("openPrCount", { count: status.openPrCount })}
                      </Typography>
                      {status.prs.map((pr) => (
                        <a
                          data-testid={SelfFreshnessTestId.PrRow}
                          href={pr.url}
                          key={pr.number}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Typography size="sm" type="text">
                            #{pr.number} {pr.title}
                          </Typography>
                        </a>
                      ))}
                    </>
                  )}
                </Stack>
              </Stack>
            </Container>
          </Card>
        </Container>
      )}
    </Container>
  );
}

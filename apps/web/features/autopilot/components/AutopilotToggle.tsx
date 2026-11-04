"use client";

import { type AutopilotScope, FULL_AUTOPILOT_SCOPE } from "@zibby/contracts";
import { Button, Container, Dialog, Stack, ToggleField, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { isOperatorTokenError } from "../../../state/operatorToken";
import { useSetAutopilotMutation } from "../mutations";
import { useAutopilotQuery } from "../queries";

export enum AutopilotToggleTestId {
  Root = "autopilot-toggle",
  Toggle = "autopilot-toggle-button",
  Confirm = "autopilot-toggle-confirm",
  Cancel = "autopilot-toggle-cancel",
  Error = "autopilot-toggle-error",
  ScopeReviews = "autopilot-toggle-scope-reviews",
  ScopeComments = "autopilot-toggle-scope-comments",
  ScopeCommunication = "autopilot-toggle-scope-communication",
}

const SCOPE_FIELDS = [
  {
    key: "reviews",
    label: "scopeReviews",
    hint: "scopeReviewsHint",
    testId: AutopilotToggleTestId.ScopeReviews,
  },
  {
    key: "comments",
    label: "scopeComments",
    hint: "scopeCommentsHint",
    testId: AutopilotToggleTestId.ScopeComments,
  },
  {
    key: "communication",
    label: "scopeCommunication",
    hint: "scopeCommunicationHint",
    testId: AutopilotToggleTestId.ScopeCommunication,
  },
] as const satisfies readonly {
  key: keyof AutopilotScope;
  label: string;
  hint: string;
  testId: AutopilotToggleTestId;
}[];

/**
 * Phase 4 — the top-bar Autopilot switch, an icon toggle (`aria-pressed`). OFF → opens a
 * confirm dialog (ON needs the operator token); ON → filled, one click turns it off.
 */
export function AutopilotToggle() {
  const t = useTranslations("autopilot");
  const tc = useTranslations("common");
  const { data } = useAutopilotQuery();
  const setAutopilot = useSetAutopilotMutation();
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState<AutopilotScope>(FULL_AUTOPILOT_SCOPE);
  const anyScope = scope.reviews || scope.comments || scope.communication;

  const on = data?.level === "full";
  const pending = data?.pendingApprovals ?? 0;
  const error = setAutopilot.error;
  const errorText = error
    ? isOperatorTokenError(error)
      ? t("operatorTokenMissing")
      : t("failed")
    : null;

  const turnOn = () =>
    setAutopilot.mutate(
      { body: { level: "full", scope } },
      { onSuccess: () => setConfirming(false) },
    );
  const close = () => {
    setConfirming(false);
    setAutopilot.reset();
  };

  return (
    <Container data-testid={AutopilotToggleTestId.Root}>
      <Button
        aria-label={on ? t("status", { pending }) : t("turnOn")}
        aria-pressed={on}
        data-testid={AutopilotToggleTestId.Toggle}
        icon="sparkles"
        intent={on ? "primary" : "ghost"}
        loading={on && setAutopilot.isPending}
        onClick={() => {
          if (on) return setAutopilot.mutate({ body: { level: "off" } });
          setScope(FULL_AUTOPILOT_SCOPE);
          setConfirming(true);
        }}
        size="sm"
        title={on ? `${t("status", { pending })} — ${t("turnOff")}` : t("turnOn")}
      />
      <Dialog
        actions={
          <>
            <Button data-testid={AutopilotToggleTestId.Cancel} intent="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
            <Button
              data-testid={AutopilotToggleTestId.Confirm}
              disabled={!anyScope}
              icon="bolt"
              intent="primary"
              loading={setAutopilot.isPending}
              onClick={turnOn}
            >
              {t("confirm")}
            </Button>
          </>
        }
        ariaLabel={t("dialogTitle")}
        closeLabel={tc("close")}
        description={t("dialogBody")}
        onClose={close}
        open={confirming}
        title={t("dialogTitle")}
        width="md"
      >
        <Stack gap="100">
          {SCOPE_FIELDS.map(({ key, label, hint, testId }) => (
            <ToggleField
              checked={scope[key]}
              data-testid={testId}
              hint={t(hint)}
              key={key}
              label={t(label)}
              onChange={(next) => setScope((prev) => ({ ...prev, [key]: next }))}
            />
          ))}
          <Typography type="text">{t("dialogPending", { pending })}</Typography>
          {errorText ? (
            <Typography data-testid={AutopilotToggleTestId.Error} tone="bad" type="text">
              {errorText}
            </Typography>
          ) : null}
        </Stack>
      </Dialog>
    </Container>
  );
}

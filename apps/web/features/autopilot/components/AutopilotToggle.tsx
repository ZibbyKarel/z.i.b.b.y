"use client";

import { Button, Container, Dialog, Stack, StatePill, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { isOperatorTokenError } from "../../../state/operatorToken";
import { useSetAutopilotMutation } from "../mutations";
import { useAutopilotQuery } from "../queries";

export enum AutopilotToggleTestId {
  Root = "autopilot-toggle",
  TurnOn = "autopilot-toggle-on",
  TurnOff = "autopilot-toggle-off",
  Status = "autopilot-toggle-status",
  Confirm = "autopilot-toggle-confirm",
  Cancel = "autopilot-toggle-cancel",
  Error = "autopilot-toggle-error",
}

/**
 * Phase 4 — the bridge's Autopilot switch. OFF → a button that opens a confirm dialog
 * (ON needs the operator token); ON → a status pill with the pending count and a
 * one-click OFF.
 */
export function AutopilotToggle() {
  const t = useTranslations("autopilot");
  const tc = useTranslations("common");
  const { data } = useAutopilotQuery();
  const setAutopilot = useSetAutopilotMutation();
  const [confirming, setConfirming] = useState(false);

  const on = data?.level === "full";
  const pending = data?.pendingApprovals ?? 0;
  const error = setAutopilot.error;
  const errorText = error
    ? isOperatorTokenError(error)
      ? t("operatorTokenMissing")
      : t("failed")
    : null;

  const turnOn = () =>
    setAutopilot.mutate({ body: { level: "full" } }, { onSuccess: () => setConfirming(false) });
  const close = () => {
    setConfirming(false);
    setAutopilot.reset();
  };

  return (
    <Container data-testid={AutopilotToggleTestId.Root}>
      {on ? (
        <Stack align="center" direction="row" gap="100">
          <StatePill
            data-testid={AutopilotToggleTestId.Status}
            label={t("status", { pending })}
            state="working"
          />
          <Button
            aria-label={t("turnOff")}
            data-testid={AutopilotToggleTestId.TurnOff}
            icon="stop"
            intent="secondary"
            loading={setAutopilot.isPending}
            onClick={() => setAutopilot.mutate({ body: { level: "off" } })}
            size="md"
            title={t("turnOff")}
          >
            {t("turnOff")}
          </Button>
        </Stack>
      ) : (
        <Button
          aria-label={t("turnOn")}
          data-testid={AutopilotToggleTestId.TurnOn}
          icon="bolt"
          intent="secondary"
          onClick={() => setConfirming(true)}
          size="md"
          title={t("turnOn")}
        >
          {t("label")}
        </Button>
      )}
      <Dialog
        actions={
          <>
            <Button data-testid={AutopilotToggleTestId.Cancel} intent="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
            <Button
              data-testid={AutopilotToggleTestId.Confirm}
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

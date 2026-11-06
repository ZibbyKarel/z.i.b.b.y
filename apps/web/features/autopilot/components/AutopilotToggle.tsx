"use client";

import { type AutopilotAutomation, NO_AUTOMATION } from "@zibby/contracts";
import { Button, Container, Dialog, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { isOperatorTokenError } from "../../../state/operatorToken";
import { useCompaniesQuery } from "../../companies";
import { useTeamsQuery } from "../../teams";
import { useSetAutopilotMutation } from "../mutations";
import { useAutopilotQuery } from "../queries";
import { AutomationTree } from "./AutomationTree";

export enum AutopilotToggleTestId {
  Root = "autopilot-toggle",
  Toggle = "autopilot-toggle-button",
  Confirm = "autopilot-toggle-confirm",
  Cancel = "autopilot-toggle-cancel",
  TurnOff = "autopilot-toggle-off",
  Error = "autopilot-toggle-error",
}

const EMPTY_AUTOMATION: AutopilotAutomation = {
  global: { ...NO_AUTOMATION },
  companies: {},
  teams: {},
};

/**
 * Phase 4 — the top-bar Autopilot button (`aria-pressed` while on). A click always opens the
 * dialog (saving needs the operator token): OFF → cancel + "turn on"; ON → "turn off" in
 * place of cancel + "edit". The dialog pre-fills from the stored tree, which the API keeps
 * across `off`.
 */
export function AutopilotToggle() {
  const t = useTranslations("autopilot");
  const tc = useTranslations("common");
  const { data } = useAutopilotQuery();
  const setAutopilot = useSetAutopilotMutation();
  const { data: companies = [] } = useCompaniesQuery();
  const { data: teams = [] } = useTeamsQuery();
  const [confirming, setConfirming] = useState(false);
  const [automation, setAutomation] = useState<AutopilotAutomation>(EMPTY_AUTOMATION);
  const anyOn = [
    automation.global,
    ...Object.values(automation.companies),
    ...Object.values(automation.teams),
  ].some((node) => Object.values(node).includes(true));

  const on = data?.level === "full";
  const pending = data?.pendingApprovals ?? 0;
  const error = setAutopilot.error;
  const errorText = error
    ? isOperatorTokenError(error)
      ? t("operatorTokenMissing")
      : t("failed")
    : null;

  const save = (body: Parameters<typeof setAutopilot.mutate>[0]["body"]) =>
    setAutopilot.mutate({ body }, { onSuccess: () => setConfirming(false) });
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
        onClick={() => {
          setAutomation(data?.automation ?? EMPTY_AUTOMATION);
          setConfirming(true);
        }}
        size="sm"
        title={on ? t("status", { pending }) : t("turnOn")}
      />
      <Dialog
        actions={
          <>
            {on ? (
              <Button
                data-testid={AutopilotToggleTestId.TurnOff}
                intent="ghost"
                loading={setAutopilot.isPending}
                onClick={() => save({ level: "off" })}
              >
                {t("turnOff")}
              </Button>
            ) : (
              <Button data-testid={AutopilotToggleTestId.Cancel} intent="ghost" onClick={close}>
                {tc("cancel")}
              </Button>
            )}
            <Button
              data-testid={AutopilotToggleTestId.Confirm}
              disabled={!anyOn}
              icon="bolt"
              intent="primary"
              loading={setAutopilot.isPending}
              onClick={() => save({ level: "full", automation })}
            >
              {on ? t("edit") : t("confirm")}
            </Button>
          </>
        }
        ariaLabel={on ? t("dialogTitleEdit") : t("dialogTitle")}
        closeLabel={tc("close")}
        description={t("dialogBody")}
        onClose={close}
        open={confirming}
        title={on ? t("dialogTitleEdit") : t("dialogTitle")}
        width="md"
      >
        <Stack gap="100">
          <AutomationTree
            companies={companies}
            onChange={setAutomation}
            teams={teams}
            value={automation}
          />
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

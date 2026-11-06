"use client";

import { type AutopilotAutomation, NO_AUTOMATION } from "@zibby/contracts";
import {
  Button,
  Container,
  Dialog,
  OptionToggle,
  Row,
  Stack,
  Tooltip,
  Typography,
} from "@zibby/design-system";
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
  Mode = "autopilot-toggle-mode",
  Confirm = "autopilot-toggle-confirm",
  Cancel = "autopilot-toggle-cancel",
  Help = "autopilot-toggle-help",
  Error = "autopilot-toggle-error",
}

type Mode = "off" | "full";

const EMPTY_AUTOMATION: AutopilotAutomation = {
  global: { ...NO_AUTOMATION },
  companies: {},
  teams: {},
};

const HELP_KEYS = [
  "autoReview",
  "autoAddressComments",
  "autoImplement",
  "autoCommunicate",
] as const;

/**
 * The top-bar Autopilot button (`aria-pressed` while on). A click opens a dialog (saving needs
 * the operator token) with the per-company/team toggles, which start the work in both modes.
 * The mode only switches the approval gates: "Approve" (level `off`) keeps them, "AUTOPILOT"
 * (level `full`) sends the toggled work without asking and only reports it. There is no global
 * level: `global` is always forced to all-off, so nothing hidden is inherited. The dialog
 * pre-fills from the stored tree.
 */
export function AutopilotToggle() {
  const t = useTranslations("autopilot");
  const tc = useTranslations("common");
  const { data } = useAutopilotQuery();
  const setAutopilot = useSetAutopilotMutation();
  const { data: companies = [] } = useCompaniesQuery();
  const { data: teams = [] } = useTeamsQuery();
  const [confirming, setConfirming] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [automation, setAutomation] = useState<AutopilotAutomation>(EMPTY_AUTOMATION);
  const anyOn = [...Object.values(automation.companies), ...Object.values(automation.teams)].some(
    (node) => Object.values(node).includes(true),
  );

  const on = data?.level === "full";
  const pending = data?.pendingApprovals ?? 0;
  const error = setAutopilot.error;
  const errorText = error
    ? isOperatorTokenError(error)
      ? t("operatorTokenMissing")
      : t("failed")
    : null;

  const save = () =>
    setAutopilot.mutate(
      { body: { level: mode, automation: { ...automation, global: { ...NO_AUTOMATION } } } },
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
        onClick={() => {
          setAutomation({
            ...(data?.automation ?? EMPTY_AUTOMATION),
            global: { ...NO_AUTOMATION },
          });
          setMode(on ? "full" : "off");
          setConfirming(true);
        }}
        size="sm"
        title={on ? t("status", { pending }) : t("turnOn")}
      />
      <Dialog
        actions={
          <>
            <Button data-testid={AutopilotToggleTestId.Cancel} intent="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
            <Button
              data-testid={AutopilotToggleTestId.Confirm}
              disabled={mode === "full" && !anyOn}
              icon="bolt"
              intent="primary"
              loading={setAutopilot.isPending}
              onClick={save}
            >
              {t("save")}
            </Button>
          </>
        }
        ariaLabel={t("dialogTitle")}
        closeLabel={tc("close")}
        headerActions={
          <Tooltip
            content={
              <Stack gap="50">
                {HELP_KEYS.map((key) => (
                  <Typography key={key} type="text">
                    {t(key)} — {t(`${key}Hint`)}
                  </Typography>
                ))}
                <Typography type="text">{t("helpMode")}</Typography>
                <Typography type="text">{t("helpNever")}</Typography>
              </Stack>
            }
            side="bottom"
            size="lg"
          >
            <Button
              aria-label={t("helpLabel")}
              data-testid={AutopilotToggleTestId.Help}
              icon="help"
              intent="ghost"
              size="sm"
            />
          </Tooltip>
        }
        onClose={close}
        open={confirming}
        title={t("dialogTitle")}
        width="md"
      >
        <Stack gap="100">
          <Row data-testid={AutopilotToggleTestId.Mode} justify="center">
            <OptionToggle
              ariaLabel={t("modeLabel")}
              intent="primary"
              onChange={setMode}
              options={[
                { id: "off", label: t("modeApprove") },
                { id: "full", label: t("modeAutopilot") },
              ]}
              size="lg"
              value={mode}
            />
          </Row>
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

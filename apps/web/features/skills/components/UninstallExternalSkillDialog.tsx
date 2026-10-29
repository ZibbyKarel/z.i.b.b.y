"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Container,
  Dialog,
  SegmentedControl,
  Stack,
  Typography,
} from "@zibby/design-system";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
import { useUninstallExternalSkillMutation } from "../mutations";
import { useExternalSkillUsagesQuery } from "../queries";

export enum UninstallExternalSkillDialogTestId {
  /** Each using workflow's row is suffixed with its workflow id. */
  Usage = "uninstall-external-skill-usage",
  Submit = "uninstall-external-skill-submit",
  Cancel = "uninstall-external-skill-cancel",
  Error = "uninstall-external-skill-error",
  UsagesError = "uninstall-external-skill-usages-error",
}

type Decision = "workflow" | "step";

export interface UninstallExternalSkillDialogProps {
  skillId: string;
  name: string;
  onClose: () => void;
  /** Fired once the skill is uninstalled. */
  onUninstalled?: () => void;
}

/**
 * Confirm dialog for uninstalling an external skill. With no using workflow it is
 * a plain confirm; otherwise every using workflow needs an explicit decision —
 * delete the whole workflow or drop just the step(s) — before submit enables.
 */
export function UninstallExternalSkillDialog({
  skillId,
  name,
  onClose,
  onUninstalled,
}: UninstallExternalSkillDialogProps) {
  const t = useTranslations("skills.external");
  const tc = useTranslations("common");
  const usagesQuery = useExternalSkillUsagesQuery(skillId);
  const uninstall = useUninstallExternalSkillMutation();
  const [choices, setChoices] = useState<Record<string, Decision>>({});

  const usages = usagesQuery.data ?? [];
  const decided = usages.every((u) => choices[u.workflowId]);
  const items = [
    { value: "workflow", label: t("choiceWorkflow") },
    { value: "step", label: t("choiceStep") },
  ];

  const submit = () =>
    uninstall.mutate(
      { params: { id: skillId }, body: { workflows: choices } },
      {
        onSuccess: () => {
          onUninstalled?.();
          onClose();
        },
      },
    );

  return (
    <Dialog
      open
      actions={
        <>
          <Button
            data-testid={UninstallExternalSkillDialogTestId.Cancel}
            intent="ghost"
            onClick={onClose}
          >
            {tc("cancel")}
          </Button>
          <Button
            data-testid={UninstallExternalSkillDialogTestId.Submit}
            disabled={usagesQuery.isPending || usagesQuery.isError || !decided}
            icon="trash"
            intent="danger"
            loading={uninstall.isPending}
            onClick={submit}
          >
            {t("uninstall")}
          </Button>
        </>
      }
      ariaLabel={t("uninstallTitle")}
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("uninstallTitle")}
      width="md"
    >
      <Stack gap="150">
        <Typography size="sm" type="note">
          {t("uninstallBody", { name })}
        </Typography>
        {usages.length > 0 && (
          <Typography size="sm" type="note" variant="secondary">
            {t("uninstallUsages")}
          </Typography>
        )}
        {usages.map((u) => (
          <Container
            data-testid={`${UninstallExternalSkillDialogTestId.Usage}-${u.workflowId}`}
            key={u.workflowId}
          >
            <Stack gap="75">
              <Stack gap="25">
                <Typography size="sm" type="note" weight="semibold">
                  {u.name}
                </Typography>
                <Typography mono size="xs" type="note" variant="tertiary">
                  {t("phases", { phases: u.phaseIds.join(", ") })}
                </Typography>
              </Stack>
              <SegmentedControl
                ariaLabel={u.name}
                items={items}
                onChange={(v) => setChoices((prev) => ({ ...prev, [u.workflowId]: v as Decision }))}
                value={choices[u.workflowId] ?? ""}
              />
            </Stack>
          </Container>
        ))}
        {usagesQuery.isError && (
          <Alert data-testid={UninstallExternalSkillDialogTestId.UsagesError} severity="error">
            {apiErrorMessage(usagesQuery.error) ?? t("failed")}
          </Alert>
        )}
        {uninstall.isError && (
          <Alert data-testid={UninstallExternalSkillDialogTestId.Error} severity="error">
            {apiErrorMessage(uninstall.error) ?? t("failed")}
          </Alert>
        )}
      </Stack>
    </Dialog>
  );
}

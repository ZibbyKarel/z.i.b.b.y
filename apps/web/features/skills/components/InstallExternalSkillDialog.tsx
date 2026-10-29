"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ExternalSkillScan } from "@zibby/contracts";
import {
  Alert,
  Button,
  Checkbox,
  Container,
  Dialog,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
import { useInstallExternalSkillsMutation, useScanExternalSkillsMutation } from "../mutations";

export enum InstallExternalSkillDialogTestId {
  Url = "install-external-skill-url",
  Scan = "install-external-skill-scan",
  /** Each candidate checkbox is suffixed with its repo path. */
  Candidate = "install-external-skill-candidate",
  Conflict = "install-external-skill-conflict",
  Submit = "install-external-skill-submit",
  Error = "install-external-skill-error",
}

export interface InstallExternalSkillDialogProps {
  onClose: () => void;
}

/**
 * Create dialog: paste a GitHub repo URL, "Načíst" scans it for SKILL.md folders,
 * tick the ones to install. A candidate whose id is already taken is disabled
 * with the reason. Closes once the install returns 201.
 */
export function InstallExternalSkillDialog({ onClose }: InstallExternalSkillDialogProps) {
  const t = useTranslations("skills.external");
  const tc = useTranslations("common");
  const scan = useScanExternalSkillsMutation();
  const install = useInstallExternalSkillsMutation();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ExternalSkillScan | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = () => {
    setResult(null);
    setPicked([]);
    install.reset();
    scan.mutate(
      { body: { url: url.trim() } },
      { onSuccess: (res) => res.status === 200 && setResult(res.body) },
    );
  };

  const submit = () =>
    install.mutate(
      { body: { url: url.trim(), paths: picked } },
      { onSuccess: (res) => res.status === 201 && onClose() },
    );

  const toggle = (path: string, on: boolean) =>
    setPicked((prev) => (on ? [...prev, path] : prev.filter((p) => p !== path)));

  const failed = install.isError ? install : scan.isError ? scan : null;

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            data-testid={InstallExternalSkillDialogTestId.Submit}
            disabled={picked.length === 0}
            icon="plus"
            intent="primary"
            loading={install.isPending}
            onClick={submit}
          >
            {t("install")}
          </Button>
        </>
      }
      ariaLabel={t("installTitle")}
      closeLabel={tc("close")}
      onClose={onClose}
      title={t("installTitle")}
      width="md"
    >
      <Stack gap="150">
        <Stack align="end" direction="row" gap="100">
          <Container grow minW0>
            <TextInputField
              data-testid={InstallExternalSkillDialogTestId.Url}
              label={t("urlLabel")}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("urlPlaceholder")}
              value={url}
            />
          </Container>
          <Button
            data-testid={InstallExternalSkillDialogTestId.Scan}
            disabled={!url.trim()}
            loading={scan.isPending}
            onClick={load}
          >
            {t("scanAction")}
          </Button>
        </Stack>

        {result && result.candidates.length === 0 && (
          <Typography size="sm" type="note" variant="secondary">
            {t("noCandidates")}
          </Typography>
        )}
        {result?.candidates.map((c) => (
          <Stack align="start" direction="row" gap="100" key={c.path}>
            <Checkbox
              checked={picked.includes(c.path)}
              data-testid={`${InstallExternalSkillDialogTestId.Candidate}-${c.path}`}
              disabled={c.conflict}
              label={c.name}
              onChange={(on) => toggle(c.path, on)}
              size="sm"
            />
            <Stack gap="25">
              <Typography size="sm" type="note" weight="semibold">
                {c.name}
              </Typography>
              {c.desc && (
                <Typography size="xs" type="note" variant="secondary">
                  {c.desc}
                </Typography>
              )}
              <Typography mono size="xs" type="note" variant="tertiary">
                {c.path || "/"}
              </Typography>
              {c.conflict && (
                <Typography
                  data-testid={InstallExternalSkillDialogTestId.Conflict}
                  size="xs"
                  tone="warn"
                  type="note"
                >
                  {t("conflict", { id: c.id })}
                </Typography>
              )}
            </Stack>
          </Stack>
        ))}

        {failed && (
          <Alert data-testid={InstallExternalSkillDialogTestId.Error} severity="error">
            {apiErrorMessage(failed.error) ?? t("failed")}
          </Alert>
        )}
      </Stack>
    </Dialog>
  );
}

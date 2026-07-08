"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog, SelectField, Typography } from "@zibby/design-system";
import { DialogTitle } from "../../../components/DialogTitle/DialogTitle";
import { useProjectsQuery } from "../../projects";
import { useUpdateProjectMutation } from "../../projects/mutations";

export enum LinkProjectDialogTestId {
  Confirm = "link-project-confirm",
  NoCandidates = "link-project-no-candidates",
}

/** Sentinel value for "nothing picked yet" — a real project id can never be empty. */
const NO_SELECTION = "";

export interface LinkProjectDialogProps {
  companyId: string;
  onClose: () => void;
}

/**
 * "Add existing project" dialog on the company detail's member-projects panel
 * (Phase 75) — the reverse of `ProjectCompanyPanel`'s selector: instead of
 * picking a company from a project, this picks a project to attach to the
 * current company. Candidates are every project not already linked here
 * (unlinked, or linked to a different company — the edge case is allowed
 * rather than specially handled, per the plan). Confirming patches the
 * project's `companyId` via `useUpdateProjectMutation`, whose hook-level
 * invalidation refreshes the member panel's `useProjectsQuery` — no manual
 * refetch needed here.
 */
export function LinkProjectDialog({ companyId, onClose }: LinkProjectDialogProps) {
  const t = useTranslations("companies.memberProjects");
  const tk = useTranslations();
  const projectsQ = useProjectsQuery();
  const updateProject = useUpdateProjectMutation();

  const candidates = (projectsQ.data ?? []).filter((p) => p.companyId !== companyId);
  const [selectedId, setSelectedId] = useState(NO_SELECTION);

  const canConfirm = selectedId !== NO_SELECTION && !updateProject.isPending;

  function confirm() {
    if (!canConfirm) return;
    updateProject.mutate(
      { params: { id: selectedId }, body: { companyId } },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      actions={
        candidates.length === 0 ? (
          <Button intent="ghost" onClick={onClose}>
            {tk("common.close")}
          </Button>
        ) : (
          <>
            <Button intent="ghost" onClick={onClose}>
              {tk("common.cancel")}
            </Button>
            <Button
              data-testid={LinkProjectDialogTestId.Confirm}
              disabled={!canConfirm}
              icon="check"
              intent="primary"
              onClick={confirm}
            >
              {t("linkDialog.confirm")}
            </Button>
          </>
        )
      }
      ariaLabel={t("linkDialog.title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={
        <DialogTitle glyph="branch" subtitle={t("linkDialog.subtitle")} title={t("linkDialog.title")} />
      }
      width="sm"
    >
      {candidates.length === 0 ? (
        <Typography
          data-testid={LinkProjectDialogTestId.NoCandidates}
          size="sm"
          type="note"
          variant="tertiary"
        >
          {t("linkDialog.noCandidates")}
        </Typography>
      ) : (
        <SelectField
          label={t("linkDialog.selectLabel")}
          onValueChange={setSelectedId}
          options={[
            { value: NO_SELECTION, label: t("linkDialog.placeholder") },
            ...candidates.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={selectedId}
        />
      )}
    </Dialog>
  );
}

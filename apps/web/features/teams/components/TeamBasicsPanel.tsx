"use client";

import { useTranslations } from "next-intl";
import { Button, Stack, Typography } from "@zibby/design-system";
import type { Team } from "@zibby/contracts";
import { FormSelect, FormTextInput, useFormControls } from "@zibby/forms";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useCompaniesQuery } from "../../companies";

/** Sentinel for "no company" in the company select — a real id can never be empty. */
const NO_COMPANY = "";

/**
 * The core team record fields this panel edits (name/desc/companyId).
 * `companyId: null` is the explicit "no company" signal (mirrors
 * `UpdateTeamSchema.companyId` / `UpdateProjectSchema.companyId`) — the caller
 * translates it back to `undefined` on the create path, where there is no
 * existing link to unlink.
 */
export interface TeamBasicsBody {
  name: string;
  desc?: string;
  companyId?: string | null;
}

export interface TeamBasicsPanelProps {
  /** The team being edited; undefined when creating a new one. */
  team?: Team;
  isNew: boolean;
  saving?: boolean;
  /** Persist the core fields (create when `isNew`, otherwise update). */
  onSave: (body: TeamBasicsBody) => void;
  /** Remove the team (existing teams only); the parent confirms first. */
  onDelete?: () => void;
}

type TeamEditValues = {
  name: string;
  desc: string;
  companyId: string;
};

/**
 * The core-record editor for a team (name, description, parent company). Lives
 * on the team detail page — there is no team dialog; the same panel creates a
 * new team (`isNew`) and edits an existing one. Mount with
 * `key={team?.id ?? "new"}` so switching teams resets the captured form
 * defaults. Mirrors `CompanyBasicsPanel`, trimmed to what a team owns today (no
 * people roster, no budget — those stay company-only) with a company select in
 * their place, since a team sits under a company (the Team layer between
 * Company and Project).
 */
export function TeamBasicsPanel({ team, isNew, saving, onSave, onDelete }: TeamBasicsPanelProps) {
  const t = useTranslations("teams");
  const { data: companies = [] } = useCompaniesQuery();

  const { renderForm, submit, form } = useFormControls<TeamEditValues>({
    defaultValues: {
      name: team?.name ?? "",
      desc: team?.desc ?? "",
      companyId: team?.companyId ?? NO_COMPANY,
    },
    onSubmit: (values) => {
      onSave({
        name: values.name.trim(),
        desc: values.desc.trim() || undefined,
        companyId: values.companyId === NO_COMPANY ? null : values.companyId,
      });
    },
  });

  const [watchedName] = form.watch(["name"]);
  const canSave = (watchedName ?? "").trim().length > 0;

  const companyOptions = [
    { value: NO_COMPANY, label: t("fields.companyNone") },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  return renderForm(
    <HudPanel
      action={
        <Button
          data-testid="save-basics"
          disabled={!canSave || saving}
          icon={isNew ? "plus" : "check"}
          intent="primary"
          onClick={() => void submit()}
          size="sm"
        >
          {isNew ? t("create") : t("save")}
        </Button>
      }
      title={t("profile.basics.title")}
    >
      <Stack gap="200">
        {isNew && (
          <Typography size="sm" type="note" variant="tertiary">
            {t("profile.basics.newHint")}
          </Typography>
        )}

        <FormTextInput<TeamEditValues>
          autoFocus
          label={t("fields.name")}
          name="name"
          placeholder={t("fields.namePlaceholder")}
        />

        <FormTextInput<TeamEditValues>
          label={t("fields.desc")}
          name="desc"
          placeholder={t("fields.descPlaceholder")}
        />

        <FormSelect<string, TeamEditValues>
          label={t("fields.company")}
          name="companyId"
          options={companyOptions}
        />

        {!isNew && onDelete && (
          <Stack align="start" direction="row">
            <Button data-testid="delete-team" icon="x" intent="danger" onClick={onDelete} size="sm">
              {t("delete")}
            </Button>
          </Stack>
        )}
      </Stack>
    </HudPanel>,
  );
}

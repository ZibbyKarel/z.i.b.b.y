"use client";

import { useTranslations } from "next-intl";
import { SelectField } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useTeamsQuery } from "../../teams";
import { useUpdateProjectMutation } from "../mutations";

export interface ProjectTeamPanelProps {
  projectId: string;
  /** The project's own raw `teamId` (undefined = no team linked). */
  teamId?: string;
}

/** The `SelectField` sentinel value for "no team" — an id can never be empty. */
const NO_TEAM = "";

/**
 * Project ↔ team wiring: a selector to link/unlink the project's `teamId`. A
 * team owns nothing a project merges into its own data (no shared people or
 * budget — that stays company-only), so unlike `ProjectCompanyPanel` this
 * panel has no "effective data" section; it is only the selector. Selecting
 * "no team" sends `teamId: null`, the explicit unlink signal
 * `useUpdateProjectMutation`'s PATCH body needs (a JSON body can't otherwise
 * express "clear a field" — `undefined` keys never survive the wire).
 */
export function ProjectTeamPanel({ projectId, teamId }: ProjectTeamPanelProps) {
  const t = useTranslations("projects.profile.teamLink");

  const { data: teams = [] } = useTeamsQuery();
  const updateProject = useUpdateProjectMutation();

  const options = [
    { value: NO_TEAM, label: t("none") },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];

  function handleTeamChange(value: string) {
    updateProject.mutate({
      params: { id: projectId },
      body: { teamId: value === NO_TEAM ? null : value },
    });
  }

  return (
    <HudPanel title={t("title")}>
      <SelectField
        hint={t("hint")}
        label={t("select")}
        onValueChange={handleTeamChange}
        options={options}
        value={teamId ?? NO_TEAM}
      />
    </HudPanel>
  );
}

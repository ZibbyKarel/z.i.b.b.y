"use client";

import { Stack } from "@zibby/design-system";
import { useInboxPrsQuery } from "../../inbox/queries";
import { prTeams } from "../state/rows";
import { PrFilterControls } from "./PrFilterControls";
import type { WidgetSettingsProps } from "./registry";

/** Defaults of the PR widget's filters, edited with the same controls the widget shows. */
export function PrsWidgetSettings({ draft, onChange }: WidgetSettingsProps) {
  const { data } = useInboxPrsQuery();
  const pick = draft.prFilters ?? {};
  const teams = prTeams(data?.prs ?? [], pick.teams);
  return (
    <Stack wrap direction="row" gap="100">
      <PrFilterControls
        onChange={(next) => {
          onChange({ ...draft, prFilters: Object.keys(next).length > 0 ? next : undefined });
        }}
        pick={pick}
        teams={teams}
      />
    </Stack>
  );
}

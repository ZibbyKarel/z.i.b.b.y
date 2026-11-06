"use client";

import { ButtonGroup, Icon, type IconName, type IconTone } from "@zibby/design-system";
import { teamSlugMatches } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import {
  PR_CI_FILTERS,
  PR_REVIEW_FILTERS,
  type PrCiFilter,
  type PrCiState,
  type PrReviewFilter,
  type PrReviewState,
} from "../state/prStatus";
import { useTeamsQuery } from "../../teams/queries";
import { type PrFilterPick, prOwner, prTeams } from "../state/rows";
import type { WidgetFiltersProps } from "./registry";
import { OrgFilterControls, compactPick } from "./widgetFilters";

export const CI_ICON: Record<PrCiState, { name: IconName; tone: IconTone }> = {
  conflict: { name: "branch", tone: "bad" },
  failing: { name: "x", tone: "bad" },
  running: { name: "run", tone: "run" },
  passing: { name: "ok", tone: "ok" },
  none: { name: "dots", tone: "faint" },
};

/** `review` and `waiting` share the clock; they differ by tone and tooltip. */
export const REVIEW_ICON: Record<PrReviewState, { name: IconName; tone: IconTone }> = {
  review: { name: "clock", tone: "accent" },
  changes: { name: "edit", tone: "warn" },
  approved: { name: "check", tone: "ok" },
  waiting: { name: "clock", tone: "faint" },
};

const REVIEW_FILTER_ICON: Record<PrReviewFilter, { name: IconName; tone: IconTone }> = {
  waiting: REVIEW_ICON.waiting,
  changes: REVIEW_ICON.changes,
  approved: REVIEW_ICON.approved,
};

export interface PrFilterControlsProps extends WidgetFiltersProps {
  /** Per-option counts shown on the buttons; omitted in the settings dialog. */
  counts?: { review: Record<PrReviewFilter, number>; ci: Record<PrCiFilter, number> };
}

/** The PR widget's filters (review, CI, owner, company, team), shared by the widget and its settings. */
export function PrFilterControls({ pick, onChange, counts }: PrFilterControlsProps) {
  const t = useTranslations("bridge.widgets.prs");
  const { data: configured } = useTeamsQuery();
  const teams = prTeams(configured, pick.teams);
  // `mine` is dropped from the base so an explicit owner patch (or its removal) wins over it.
  const set = (patch: PrFilterPick) => {
    onChange(compactPick({ ...pick, mine: undefined, owner: prOwner(pick), ...patch }));
  };
  const option = <K extends string>(
    id: K,
    label: string,
    icon: { name: IconName; tone: IconTone },
    count: number | undefined,
  ) => ({
    id,
    label,
    leading: <Icon name={icon.name} size="sm" tone={icon.tone} />,
    trailing: count === undefined ? undefined : String(count),
  });

  // Saved discovered `org/team` values show as (and normalise to) the configured option covering them.
  const pickedTeams = [
    ...new Set(
      (pick.teams ?? []).map((v) => teams.find((o) => teamSlugMatches(v, o.value))?.value ?? v),
    ),
  ];

  return (
    <>
      <ButtonGroup
        multiple
        ariaLabel={t("filter.review")}
        onChange={(v) => set({ review: PR_REVIEW_FILTERS.filter((s) => v.includes(s)) })}
        options={PR_REVIEW_FILTERS.map((s) =>
          option(s, t(`review.${s}`), REVIEW_FILTER_ICON[s], counts?.review[s]),
        )}
        value={pick.review ?? []}
      />
      <ButtonGroup
        multiple
        ariaLabel={t("filter.ci")}
        onChange={(v) => set({ ci: PR_CI_FILTERS.filter((s) => v.includes(s)) })}
        options={PR_CI_FILTERS.map((s) => option(s, t(`ci.${s}`), CI_ICON[s], counts?.ci[s]))}
        value={pick.ci ?? []}
      />
      <ButtonGroup
        deselectable
        ariaLabel={t("filter.owner")}
        onChange={(v) => set({ owner: v === "mine" || v === "others" ? v : undefined })}
        options={[
          { id: "mine", label: t("filter.ownerMine") },
          { id: "others", label: t("filter.ownerOthers") },
        ]}
        value={prOwner(pick) ?? ""}
      />
      <OrgFilterControls onChange={set} pick={{ ...pick, teams: pickedTeams }} teams={teams} />
    </>
  );
}

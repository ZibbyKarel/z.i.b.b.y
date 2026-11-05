"use client";

import { ButtonGroup, Dropdown, Icon, type IconName, type IconTone } from "@zibby/design-system";
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
import { type PrFilterPick, type PrTeamOption, prOwner } from "../state/rows";

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

/** Empty groups are dropped: an absent group doesn't filter. The legacy `mine` flag becomes `owner`. */
function compact(pick: PrFilterPick): PrFilterPick {
  const next: PrFilterPick = {};
  if (pick.review?.length) next.review = pick.review;
  if (pick.ci?.length) next.ci = pick.ci;
  const owner = prOwner(pick);
  if (owner) next.owner = owner;
  if (pick.teams?.length) next.teams = pick.teams;
  return next;
}

export interface PrFilterControlsProps {
  pick: PrFilterPick;
  onChange: (next: PrFilterPick) => void;
  /** Team slugs on offer; the team control is hidden when empty. */
  teams: PrTeamOption[];
  /** Per-option counts shown on the buttons; omitted in the settings dialog. */
  counts?: { review: Record<PrReviewFilter, number>; ci: Record<PrCiFilter, number> };
}

/** The PR widget's filters (review, CI, mine, teams), shared by the widget and its settings. */
export function PrFilterControls({ pick, onChange, teams, counts }: PrFilterControlsProps) {
  const t = useTranslations("bridge.widgets.prs");
  // `mine` is dropped from the base so an explicit owner patch (or its removal) wins over it.
  const set = (patch: PrFilterPick) => {
    onChange(compact({ ...pick, mine: undefined, owner: prOwner(pick), ...patch }));
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
      {teams.length > 0 ? (
        <Dropdown
          compact
          multi
          aria-label={t("filter.teams")}
          onChange={(v) => set({ teams: v })}
          options={teams}
          placeholder={t("filter.teams")}
          size="sm"
          value={pickedTeams}
        />
      ) : null}
    </>
  );
}

"use client";

import { Dropdown, type DropdownOption, type DropdownSize } from "@zibby/design-system";
import { useTranslations } from "next-intl";

/**
 * Sentinel for "Bez projektu" (no-project). The DS `Dropdown` is a single-select
 * over string values and real project ids are non-empty, so `""` is safe.
 */
export const NO_PROJECT = "";

/** Cap a project name so a compact chip host (the inline `CommandLine` selector)
 *  never blows out its row — the option's FULL name still appears in the open
 *  menu's `title`-less row (a long label just wraps there; only the always-visible
 *  trigger needs the hard cap). */
const MAX_LABEL_LENGTH = 22;
function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

export interface ProjectSelectProps {
  /** The currently selected project — `null` = "Bez projektu". Phase 108: this is
   *  always a per-task pick (`CommandLine`'s own local state); there is no
   *  app-wide "active project" any more. */
  activeProjectId: string | null;
  /** The project registry — every host reads its own copy of `useProjectsQuery()`. */
  projects: { id: string; name: string }[];
  /** Commits a pick straight to the caller's `setActiveProject` (already `null`
   *  for "Bez projektu" — the `NO_PROJECT` sentinel is resolved here). */
  onChange: (id: string | null) => void;
  size?: DropdownSize;
  "aria-label"?: string;
}

/**
 * The shared option-building + rendering for picking a project (Phase 24;
 * relocated inline by Phase 102; the app-wide scope it used to drive was
 * removed in Phase 108 — it is now purely a per-task picker): always populated
 * with "Bez projektu" plus one row per registered project — never an "all
 * projects" state. Purely presentational — its one remaining host (the inline
 * chip in `CommandLine`) supplies `activeProjectId`/`projects`/`onChange`
 * itself, so this component owns no data fetching or context read of its own.
 */
export function ProjectSelect({
  activeProjectId,
  projects,
  onChange,
  size = "sm",
  "aria-label": ariaLabel,
}: ProjectSelectProps) {
  const t = useTranslations("projects");

  const options: DropdownOption<string>[] = [
    { value: NO_PROJECT, label: t("switcherNoProject") },
    ...projects.map((p) => ({ value: p.id, label: truncateLabel(p.name) })),
  ];

  return (
    <Dropdown<string>
      aria-label={ariaLabel ?? t("switcherLabel")}
      onChange={(value) => onChange(value === NO_PROJECT ? null : value)}
      options={options}
      size={size}
      value={activeProjectId ?? NO_PROJECT}
    />
  );
}

"use client";

import type { CiState, Project } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  type BoardRowTone,
  BoardText,
  Dropdown,
  Icon,
  type IconName,
  type IconTone,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useProjectCiQuery, useProjectsQuery } from "../../projects/queries";
import type { BridgeWidgetProps, WidgetSettingsProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum ProjectStatusWidgetTestId {
  Ci = "project-status-ci",
  ProjectSelect = "project-status-project-select",
}

/** CI state → status glyph (the PR widget's vocabulary) and row bar tone. */
export const CI_STATE_ICON: Record<CiState, { name: IconName; tone: IconTone }> = {
  passing: { name: "ok", tone: "ok" },
  failing: { name: "x", tone: "bad" },
  running: { name: "run", tone: "run" },
  pending: { name: "clock", tone: "faint" },
  cancelled: { name: "stop", tone: "faint" },
  skipped: { name: "dots", tone: "faint" },
  none: { name: "dots", tone: "faint" },
  error: { name: "warn", tone: "warn" },
};

const ROW_TONE: Record<CiState, BoardRowTone> = {
  passing: "done",
  failing: "error",
  running: "working",
  pending: "thinking",
  cancelled: "idle",
  skipped: "idle",
  none: "idle",
  error: "blocked",
};

/** The status glyph with its meaning as accessible name + tooltip. */
export function CiStateIcon({ state, label }: { state: CiState; label: string }) {
  const icon = CI_STATE_ICON[state];
  return (
    <span
      aria-label={label}
      data-state={state}
      data-testid={ProjectStatusWidgetTestId.Ci}
      role="img"
      title={label}
    >
      <Icon name={icon.name} size="sm" tone={icon.tone} />
    </span>
  );
}

/** The projects a widget shows: its `scope.projectIds` pick, or every project when none. */
export function pickedProjects(projects: readonly Project[], ids?: readonly string[]): Project[] {
  return ids?.length ? projects.filter((p) => ids.includes(p.id)) : [...projects];
}

function ProjectRow({
  project,
  widgetId,
  selection,
  onOpen,
  sheetSide,
}: { project: Project; widgetId: string } & Pick<
  BridgeWidgetProps,
  "selection" | "onOpen" | "sheetSide"
>) {
  const t = useTranslations("bridge.widgets.projectStatus");
  const { data: ci } = useProjectCiQuery(project.id);
  const state = ci?.state ?? "none";
  const key = `${widgetId}:${project.id}`;
  const red = state === "failing";
  return (
    <BoardRow
      alert={red}
      bar={!red}
      onClick={() => onOpen({ kind: "project", id: project.id, widgetId, key })}
      rowKey={key}
      selected={selection?.key === key}
      sheetSide={sheetSide}
      tone={ROW_TONE[state]}
      trailing={<CiStateIcon label={t(`state.${state}`)} state={state} />}
    >
      <BoardLine baseline gap="8">
        <BoardText truncate kind="title" title={project.name}>
          {project.name}
        </BoardText>
        {ci?.branch ? (
          <BoardText kind="meta" tone="ink3">
            {ci.branch}
          </BoardText>
        ) : null}
      </BoardLine>
    </BoardRow>
  );
}

/**
 * Project status: one row per picked project (`scope.projectIds`, absent = all) with the CI state
 * of its base branch. Red CI = the error background (no bar); other states = a status icon.
 * A click opens the project sheet (CI by workflow → job → step).
 */
export function ProjectStatusWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const projectsQuery = useProjectsQuery();
  const projects = pickedProjects(projectsQuery.data ?? [], widget.scope?.projectIds);
  useWidgetReport(
    {
      loading: projectsQuery.isPending,
      count: projectsQuery.isPending ? undefined : projects.length,
      you: 0,
    },
    { onEmptyChange, onCountChange },
  );
  return (
    <>
      {projects.map((p) => (
        <ProjectRow
          key={p.id}
          onOpen={onOpen}
          project={p}
          selection={selection}
          sheetSide={sheetSide}
          widgetId={widget.id}
        />
      ))}
    </>
  );
}

/** Settings: which projects the widget shows, saved as `scope.projectIds` (none = all). */
export function ProjectStatusWidgetSettings({ draft, onChange }: WidgetSettingsProps) {
  const t = useTranslations("bridge.widgets.projectStatus");
  const tf = useTranslations("bridge.filterControls");
  const { data: projects = [] } = useProjectsQuery();
  return (
    <Stack data-testid={ProjectStatusWidgetTestId.ProjectSelect} gap="75">
      <Typography size="sm" type="note" variant="secondary">
        {t("projects")}
      </Typography>
      <Dropdown
        multi
        showSelectAll
        aria-label={t("projects")}
        deselectAllLabel={tf("deselectAll")}
        onChange={(ids) =>
          onChange({ ...draft, scope: ids.length ? { projectIds: ids } : undefined })
        }
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        placeholder={t("allProjects")}
        selectAllLabel={tf("selectAll")}
        value={draft.scope?.projectIds ?? []}
      />
    </Stack>
  );
}

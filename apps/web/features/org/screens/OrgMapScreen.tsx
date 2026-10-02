"use client";

import type { DepartmentId } from "@zibby/contracts";
import {
  AgentGlyph,
  Button,
  Card,
  CellStrip,
  Container,
  EmptyState,
  Grid,
  OrgConnector,
  OrgNode,
  Panel,
  Row,
  SelectField,
  Stack,
  type StateTone,
  Typography,
  ZibbyAvatar,
} from "@zibby/design-system";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAgentsQuery } from "../../agents";
import { useApprovalsQuery } from "../../approvals/queries";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import {
  useDepartmentSubtasksQuery,
  useDepartmentsQuery,
  useDivisionsQuery,
} from "../../departments/queries";
import { NewDepartmentDialog } from "../../departments/components/NewDepartmentDialog";
import {
  useCreateDepartmentMutation,
  useMarkDepartmentSeenMutation,
} from "../../departments/mutations";
import { useHireEmployeeMutation } from "../../employees/mutations";
import { useEmployeesQuery } from "../../employees/queries";
import { useRunsQuery } from "../../runs";
import { runTitle } from "../../runs/run";
import type { RunStatusGroupKey } from "../../runs/statusGroups";
import { aggregateZibbyState } from "../state/aggregateZibbyState";

export enum OrgMapScreenTestId {
  Root = "org-map-screen-root",
  CooNode = "org-map-coo-node",
  Grid = "org-map-grid",
  Division = "org-map-division",
  FocusPanel = "org-map-focus-panel",
  TeamTile = "org-map-team-tile",
  AddEmployeeButton = "org-map-add-employee-button",
  AddDepartmentButton = "org-map-add-department-button",
  FailedRun = "org-map-failed-run",
  DismissFailedRunsButton = "org-map-dismiss-failed-runs-button",
}

/** Zibby's state → the `/activity/runs` state group it reads as (idle → no filter). */
const RUN_GROUP: Record<StateTone, RunStatusGroupKey | undefined> = {
  working: "running",
  thinking: "running",
  blocked: "waiting",
  error: "error",
  done: "done",
  idle: undefined,
};

/** `gap="200"` → 16px (DS.md §4) — the grid's own column gap. */
const GRID_GAP_PX = 16;

/**
 * The alert an `OrgNode` shows: an error run beats a pending approval — worse
 * always wins so the map's one alert slot per department surfaces the most
 * urgent thing (PART-B.md ZB-02).
 */
function pickAlert(
  errorCount: number,
  approvalCount: number,
  t: ReturnType<typeof useTranslations<"orgMap">>,
): { state: StateTone; label: string } | undefined {
  if (errorCount > 0) return { state: "error", label: t("alert.errors", { count: errorCount }) };
  if (approvalCount > 0) {
    return { state: "blocked", label: t("alert.approvals", { count: approvalCount }) };
  }
  return undefined;
}

/**
 * ZB-02 — the ORG map: CEO → COO → divisions (D-021) → 11 department nodes, plus a `?department=<id>` panel
 * (department roster, open subtasks). PART-B.md ZB-02 / ROUTE-MAP.md
 * §1 ORG / D-014 / D-015 / O-04.
 */
export function OrgMapScreen() {
  const t = useTranslations("orgMap");
  const tDepartments = useTranslations("departments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusId = (searchParams.get("department") ?? undefined) as DepartmentId | undefined;

  const { data: departments = [] } = useDepartmentsQuery();
  const registry = useDepartmentLookup();
  const { data: divisions = [] } = useDivisionsQuery();
  // One column per division, each with a readable minimum width (the row scrolls
  // horizontally on a narrow viewport — ZB-14). `GridCols` has no variant for a
  // dynamic count, so the track list goes through `Grid`'s `style` passthrough.
  const gridDivisionCols = {
    gridTemplateColumns: `repeat(${divisions.length}, minmax(160px, 1fr))`,
  };
  // The horizontal bus sits on the first/last column centers: half a
  // column-and-gap unit in from each edge (DS.md §8).
  const busInset = `calc((100% - ${Math.max(0, divisions.length - 1) * GRID_GAP_PX}px) / ${divisions.length * 2})`;
  const { data: employees = [] } = useEmployeesQuery({ status: "active" });
  const { data: approvals = [] } = useApprovalsQuery();
  const { data: focusSubtasks = [] } = useDepartmentSubtasksQuery(focusId);
  const { data: agents = [] } = useAgentsQuery();
  const hire = useHireEmployeeMutation(focusId ?? "");
  const [newAgentId, setNewAgentId] = useState("");
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const createDepartment = useCreateDepartmentMutation();
  const markSeen = useMarkDepartmentSeenMutation();

  function setFocus(id: DepartmentId) {
    const next = new URLSearchParams(searchParams.toString());
    if (focusId === id) next.delete("department");
    else next.set("department", id);
    const query = next.toString();
    router.push((query ? `${pathname}?${query}` : pathname) as Route);
  }

  const cooRuns = departments.reduce((sum, d) => sum + d.tier2Count + d.tier3Count, 0);
  const ownState: StateTone = cooRuns > 0 ? "working" : "idle";
  // Zibby mirrors the most urgent agent state: any employee's state, a department
  // with unseen failed runs (error) or pending approvals (blocked) — worse wins.
  const cooState = aggregateZibbyState(ownState, [
    ...employees.map((e) => e.state),
    ...departments.map((d): StateTone => (d.errorCount > 0 ? "error" : "idle")),
    ...departments.map((d): StateTone => (d.tier3Count > 0 ? "blocked" : "idle")),
    ...approvals.map((): StateTone => "blocked"),
  ]);

  // The avatar opens the People roster when some employee is in Zibby's state;
  // otherwise the state comes from runs/approvals, so it opens the runs archive.
  const cooGroup = RUN_GROUP[cooState];
  const cooHref = employees.some((e) => e.state === cooState)
    ? `/org/people?state=${cooState}`
    : cooGroup
      ? `/activity/runs?state=${cooGroup}`
      : "/activity/runs";

  const focusDepartment = departments.find((d) => d.id === focusId);
  const { runs } = useRunsQuery();
  const focusFailedRuns = (focusDepartment?.errorRunIds ?? []).map(
    (id) => runs.find((r) => r.runId === id) ?? id,
  );
  const focusEmployees = employees.filter((e) => e.department === focusId);
  // An agent counts as allocated once any active employee holds its position.
  const freeAgents = agents.filter((a) => !employees.some((e) => e.agentId === a.id));

  return (
    <Stack data-testid={OrgMapScreenTestId.Root} gap="300">
      <Stack direction="row" justify="end">
        <Button
          data-testid={OrgMapScreenTestId.AddDepartmentButton}
          icon="plus"
          intent="primary"
          onClick={() => setCreatingDepartment(true)}
          size="sm"
        >
          {tDepartments("create.addButton")}
        </Button>
      </Stack>
      {creatingDepartment && (
        <NewDepartmentDialog
          divisions={divisions}
          onClose={() => setCreatingDepartment(false)}
          onCreate={(body) =>
            createDepartment.mutate({ body }, { onSuccess: () => setCreatingDepartment(false) })
          }
          pending={createDepartment.isPending}
        />
      )}
      {/* Map + focus panel sit flush so the selected stub runs into the panel. */}
      <Stack gap="0">
        <Stack align="center" gap="0">
          <Stack align="center" gap="100">
            {/* The avatar opens the People roster pre-filtered to the state it mirrors. */}
            <Link
              aria-label={t("cooAvatarLink", { state: cooState })}
              data-testid={OrgMapScreenTestId.CooNode}
              href={cooHref as Route}
            >
              <ZibbyAvatar label={t("cooAvatarLabel")} size={112} state={cooState} />
            </Link>
          </Stack>

          {/* The COO trunk — joins the COO avatar to the department bus below. */}
          <OrgConnector length={18} orientation="vertical" />

          {/* Only the division row scrolls on a narrow viewport; the bus lives
           *  inside it so it scrolls together with the nodes it spans. */}
          <Container overflowX="auto" width="100%">
            <Container position="relative">
              <OrgConnector orientation="horizontal" style={{ left: busInset, right: busInset }} />
              <Grid data-testid={OrgMapScreenTestId.Grid} gap="200" style={gridDivisionCols}>
                {divisions.map((division) => {
                  const members = registry.list.filter((d) => d.division === division.id);
                  const divisionCells: StateTone[] = employees
                    .filter((e) => members.some((d) => d.id === e.department))
                    .map((e) => e.state);
                  return (
                    <Stack align="center" gap="0" key={division.id}>
                      <OrgConnector length={18} orientation="vertical" />
                      <Container width="100%">
                        <Panel data-testid={OrgMapScreenTestId.Division} padding="100">
                          <Stack gap="50">
                            <Typography tracking="wider" type="labelSm" variant="secondary">
                              {division.name}
                            </Typography>
                            <CellStrip cells={divisionCells} />
                          </Stack>
                        </Panel>
                      </Container>
                      {members.map((dept) => {
                        const status = departments.find((d) => d.id === dept.id);
                        const cells: StateTone[] = employees
                          .filter((e) => e.department === dept.id)
                          .map((e) => e.state);
                        const approvalCount = approvals.filter(
                          (a) => a.department === dept.id,
                        ).length;
                        const isFocused = focusId === dept.id;
                        return (
                          <Container key={dept.id} width="100%">
                            <Stack align="center" gap="0">
                              {/* The drop from the division — --ink on the focused department. */}
                              <OrgConnector active={isFocused} length={18} orientation="vertical" />
                              <OrgNode
                                alert={pickAlert(status?.errorCount ?? 0, approvalCount, t)}
                                cells={cells}
                                code={dept.code}
                                name={dept.name}
                                onClick={() => setFocus(dept.id)}
                                selected={isFocused}
                              />
                            </Stack>
                          </Container>
                        );
                      })}
                    </Stack>
                  );
                })}
              </Grid>
            </Container>
          </Container>
        </Stack>

        {focusDepartment && (
          <Panel
            borderTone="ink"
            data-testid={OrgMapScreenTestId.FocusPanel}
            header={
              <Typography tracking="wider" type="labelSm">
                {t("focus.eyebrow", { code: focusDepartment.code })}
              </Typography>
            }
            headerEnd={
              <Link href={`/org/departments/${focusDepartment.id}` as Route}>
                <Button intent="secondary" size="sm">
                  {t("focus.openDepartment")}
                </Button>
              </Link>
            }
            padding="200"
          >
            <Stack gap="300">
              <Stack gap="100">
                <Typography tracking="wider" type="labelSm" variant="secondary">
                  {t("focus.teamTitle")}
                </Typography>
                {freeAgents.length === 0 ? (
                  <Typography type="labelSm" variant="tertiary">
                    {t("focus.noFreeAgents")}
                  </Typography>
                ) : (
                  <Stack align="end" direction="row" gap="100">
                    <Container grow>
                      <SelectField
                        label={t("focus.addLabel")}
                        onValueChange={setNewAgentId}
                        options={freeAgents.map((a) => ({
                          value: a.id,
                          label: a.displayName ?? a.name ?? a.id,
                        }))}
                        value={newAgentId}
                      />
                    </Container>
                    <Button
                      data-testid={OrgMapScreenTestId.AddEmployeeButton}
                      disabled={!newAgentId || hire.isPending}
                      icon="plus"
                      intent="primary"
                      loading={hire.isPending}
                      onClick={() =>
                        hire.mutate(
                          { params: { id: focusDepartment.id }, body: { agentId: newAgentId } },
                          { onSuccess: () => setNewAgentId("") },
                        )
                      }
                    >
                      {t("focus.add")}
                    </Button>
                  </Stack>
                )}
                {focusEmployees.length === 0 ? (
                  <EmptyState body={t("focus.teamEmpty")} title={t("focus.teamEmptyTitle")} />
                ) : (
                  <Grid cols={2} gap="100" lg={4} sm={3}>
                    {focusEmployees.map((e) => (
                      <Link
                        data-testid={OrgMapScreenTestId.TeamTile}
                        href={`/system/registries/positions/${e.agentId}` as Route}
                        key={e.id}
                      >
                        <Card interactive radius="sm">
                          <Container padding="100">
                            <Stack align="center" gap="50">
                              <AgentGlyph seed={e.agentId} size={48} state={e.state} />
                              <Typography type="body" weight="medium">
                                {e.name}
                              </Typography>
                              <Typography type="labelSm" variant="secondary">
                                {e.position.title ?? e.position.name}
                              </Typography>
                            </Stack>
                          </Container>
                        </Card>
                      </Link>
                    ))}
                  </Grid>
                )}
              </Stack>

              {focusFailedRuns.length > 0 && (
                <Stack gap="100">
                  <Row gap="100" justify="between">
                    <Typography tracking="wider" type="labelSm" variant="secondary">
                      {t("focus.failedRunsTitle")}
                    </Typography>
                    {/* Failures count only since the department was last seen —
                        acknowledging them clears the department's (and Zibby's) error. */}
                    <Button
                      data-testid={OrgMapScreenTestId.DismissFailedRunsButton}
                      disabled={markSeen.isPending}
                      icon="check"
                      intent="ghost"
                      onClick={() => markSeen.mutate({ params: { id: focusId ?? "" }, body: {} })}
                      size="sm"
                    >
                      {t("focus.dismissFailedRuns")}
                    </Button>
                  </Row>
                  <Stack gap="50">
                    {focusFailedRuns.map((r) => {
                      const id = typeof r === "string" ? r : r.runId;
                      return (
                        <Link
                          data-testid={OrgMapScreenTestId.FailedRun}
                          href={`/activity/runs/${id}` as Route}
                          key={id}
                        >
                          <Row gap="100">
                            <CellStrip cells={["error"]} />
                            <Typography type="labelSm" variant="secondary">
                              {typeof r === "string" ? r : runTitle(r)}
                            </Typography>
                          </Row>
                        </Link>
                      );
                    })}
                  </Stack>
                </Stack>
              )}

              <Stack gap="100">
                <Typography tracking="wider" type="labelSm" variant="secondary">
                  {t("focus.subtasksTitle")}
                </Typography>
                {focusSubtasks.length === 0 ? (
                  <EmptyState
                    body={t("focus.subtasksEmpty")}
                    title={t("focus.subtasksEmptyTitle")}
                  />
                ) : (
                  <Stack gap="50">
                    {focusSubtasks.map((s) => (
                      <Row gap="100" key={s.taskId}>
                        <CellStrip cells={[s.state]} />
                        <Typography type="labelSm" variant="secondary">
                          {s.taskId}
                        </Typography>
                      </Row>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Panel>
        )}
      </Stack>
    </Stack>
  );
}

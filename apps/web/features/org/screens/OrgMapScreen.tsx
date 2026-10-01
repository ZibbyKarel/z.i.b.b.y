"use client";

import type { DepartmentId } from "@zibby/contracts";
import { DEPARTMENTS, DIVISIONS } from "@zibby/contracts";
import {
  AgentGlyph,
  Button,
  CellStrip,
  Container,
  EmptyState,
  Grid,
  OrgConnector,
  OrgNode,
  Panel,
  Row,
  Stack,
  type StateTone,
  Typography,
  ZibbyAvatar,
} from "@zibby/design-system";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApprovalsQuery } from "../../approvals/queries";
import { useHandoffRulesQuery } from "../../handoff/queries";
import { useDepartmentSubtasksQuery, useDepartmentsQuery } from "../../departments/queries";
import { useEmployeesQuery } from "../../employees/queries";

export enum OrgMapScreenTestId {
  Root = "org-map-screen-root",
  CooNode = "org-map-coo-node",
  Grid = "org-map-grid",
  Division = "org-map-division",
  FocusPanel = "org-map-focus-panel",
}

/** One column per division. `GridCols` has no fixed-4-with-minimum variant, so
 *  the track list goes through `Grid`'s `style` passthrough (CLAUDE.md's
 *  "no className" rule allows this one seam). Each column keeps a readable
 *  minimum width; on a narrow viewport the row scrolls horizontally in its own
 *  container instead of squeezing the cards (ZB-14). */
const GRID_DIVISION_COLS = {
  gridTemplateColumns: `repeat(${DIVISIONS.length}, minmax(160px, 1fr))`,
};

/** `GRID_DIVISION_COLS`'s own gap (`gap="200"` → 16px, DS.md §4). */
const GRID_GAP_PX = 16;

/**
 * The horizontal bus's `left`/`right` inset — the center of the first/last
 * division column, i.e. half a column-and-gap unit in from each edge. With
 * `DIVISIONS.length` columns the row's total gap width is
 * `(length - 1) * GRID_GAP_PX`; halving the remaining track count
 * (`length * 2`) lands the bus on the column centers (DS.md §8).
 */
const BUS_INSET = `calc((100% - ${(DIVISIONS.length - 1) * GRID_GAP_PX}px) / ${DIVISIONS.length * 2})`;

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
 * ZB-02 — the ORG map: CEO → COO → divisions (D-021) → 11 department nodes, plus a `?focus=<id>` panel
 * (department roster, open subtasks, handoff IN/OUT). PART-B.md ZB-02 / ROUTE-MAP.md
 * §1 ORG / D-014 / D-015 / O-04.
 */
export function OrgMapScreen() {
  const t = useTranslations("orgMap");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusId = (searchParams.get("focus") ?? undefined) as DepartmentId | undefined;

  const { data: departments = [] } = useDepartmentsQuery();
  const { data: employees = [] } = useEmployeesQuery({ status: "active" });
  const { data: approvals = [] } = useApprovalsQuery();
  const { data: allHandoffRules = [] } = useHandoffRulesQuery();
  const { data: focusSubtasks = [] } = useDepartmentSubtasksQuery(focusId);

  function setFocus(id: DepartmentId) {
    const next = new URLSearchParams(searchParams.toString());
    if (focusId === id) next.delete("focus");
    else next.set("focus", id);
    const query = next.toString();
    router.push((query ? `${pathname}?${query}` : pathname) as Route);
  }

  const cooRuns = departments.reduce((sum, d) => sum + d.tier2Count + d.tier3Count, 0);
  const cooState: StateTone = cooRuns > 0 ? "working" : "idle";

  const focusDepartment = departments.find((d) => d.id === focusId);
  const focusEmployees = employees.filter((e) => e.department === focusId);
  const focusHandoff = allHandoffRules.filter(
    (r) => r.from === focusId || (r.to.kind === "department" && r.to.id === focusId),
  );

  return (
    <Stack data-testid={OrgMapScreenTestId.Root} gap="300">
      {/* Map + focus panel sit flush so the selected stub runs into the panel. */}
      <Stack gap="0">
        <Stack align="center" gap="0">
          <Stack align="center" gap="100">
            <Container data-testid={OrgMapScreenTestId.CooNode}>
              <ZibbyAvatar label={t("cooAvatarLabel")} size={112} state={cooState} />
            </Container>
          </Stack>

          {/* The COO trunk — joins the COO avatar to the department bus below. */}
          <OrgConnector length={18} orientation="vertical" />

          {/* Only the division row scrolls on a narrow viewport; the bus lives
           *  inside it so it scrolls together with the nodes it spans. */}
          <Container overflowX="auto" width="100%">
            <Container position="relative">
              <OrgConnector
                orientation="horizontal"
                style={{ left: BUS_INSET, right: BUS_INSET }}
              />
              <Grid data-testid={OrgMapScreenTestId.Grid} gap="200" style={GRID_DIVISION_COLS}>
                {DIVISIONS.map((division) => {
                  const members = DEPARTMENTS.filter((d) => d.division === division.id);
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
                {focusEmployees.length === 0 ? (
                  <EmptyState body={t("focus.teamEmpty")} title={t("focus.teamEmptyTitle")} />
                ) : (
                  <Grid cols={2} gap="100" lg={4} sm={3}>
                    {focusEmployees.map((e) => (
                      <Panel key={e.id} padding="100">
                        <Stack align="center" gap="50">
                          <AgentGlyph seed={e.agentId} size={48} state={e.state} />
                          <Typography type="body" weight="medium">
                            {e.name}
                          </Typography>
                          <Typography type="labelSm" variant="secondary">
                            {e.position.title ?? e.position.name}
                          </Typography>
                        </Stack>
                      </Panel>
                    ))}
                  </Grid>
                )}
              </Stack>

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

              <Stack gap="100">
                <Typography tracking="wider" type="labelSm" variant="secondary">
                  {t("focus.handoffTitle")}
                </Typography>
                {focusHandoff.length === 0 ? (
                  <EmptyState body={t("focus.handoffEmpty")} title={t("focus.handoffEmptyTitle")} />
                ) : (
                  <Stack gap="50">
                    {focusHandoff.map((r) => (
                      <Typography key={r.id} type="labelSm" variant="secondary">
                        {r.from === focusDepartment.id
                          ? t("focus.out", { kind: r.signalKind })
                          : t("focus.in", { kind: r.signalKind })}
                      </Typography>
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

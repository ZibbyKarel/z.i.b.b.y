"use client";

import type { DepartmentId } from "@zibby/contracts";
import { DEPARTMENTS } from "@zibby/contracts";
import {
  AgentGlyph,
  Button,
  CellStrip,
  Container,
  EmptyState,
  Grid,
  OrgNode,
  Panel,
  Row,
  Stack,
  StatePill,
  type StateTone,
  Typography,
} from "@zibby/design-system";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApprovalsQuery } from "../../approvals/queries";
import { useHandoffRulesQuery } from "../../handoff/queries";
import { useSystemConfigQuery } from "../../system/queries";
import { useDepartmentSubtasksQuery, useDepartmentsQuery } from "../../departments/queries";
import { useEmployeesQuery } from "../../employees/queries";

export enum OrgMapScreenTestId {
  Root = "org-map-screen-root",
  CeoNode = "org-map-ceo-node",
  CooNode = "org-map-coo-node",
  Grid = "org-map-grid",
  FocusPanel = "org-map-focus-panel",
}

/** No `GridCols` value covers 11 across (its scale tops out at 5) — the map's own
 *  canonical department count is genuinely dynamic, so it goes through `Grid`'s
 *  `style` passthrough rather than a Tailwind utility class (CLAUDE.md's
 *  "no className" rule allows this one seam).
 *
 *  Each column keeps a readable minimum width; on a narrow viewport the row
 *  scrolls horizontally in its own container instead of squeezing the
 *  department cards into overlapping text (ZB-14). */
const GRID_11_COLS = { gridTemplateColumns: "repeat(11, minmax(96px, 1fr))" };

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
 * ZB-02 — the ORG map: CEO → COO → 11 department nodes, plus a `?focus=<id>` panel
 * (department roster, open subtasks, handoff IN/OUT). PART-B.md ZB-02 / ROUTE-MAP.md
 * §1 ORG / D-014 / D-015 / O-04.
 */
export function OrgMapScreen() {
  const t = useTranslations("orgMap");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusId = (searchParams.get("focus") ?? undefined) as DepartmentId | undefined;

  const { data: config } = useSystemConfigQuery();
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
      <Row align="baseline" gap="200">
        <Typography tracking="wider" type="labelSm" variant="secondary">
          {t("eyebrow")}
        </Typography>
        <Typography type="h1">{config?.companyName ?? "ZibbyCorp"}</Typography>
      </Row>

      <Stack align="center" gap="100">
        <Row data-testid={OrgMapScreenTestId.CeoNode} gap="100">
          <Typography tracking="wider" type="labelSm" variant="secondary">
            {t("ceoLabel")}
          </Typography>
          <Typography type="body" weight="medium">
            {config?.operatorName ?? t("ceoFallback")}
          </Typography>
        </Row>

        <Panel data-testid={OrgMapScreenTestId.CooNode} padding="100">
          <Row gap="200">
            <AgentGlyph seed="coo-zibby" size={48} state={cooState} />
            <Stack gap="50">
              <Typography tracking="wider" type="labelSm" variant="secondary">
                {t("cooLabel")}
              </Typography>
              <Typography type="body" weight="medium">
                {t("cooName")}
              </Typography>
              <Typography type="labelSm" variant="secondary">
                {t("cooTagline")}
              </Typography>
            </Stack>
            <StatePill state={cooState} />
          </Row>
        </Panel>
      </Stack>

      {/* Only the department row scrolls on a narrow viewport. */}
      <Container overflowX="auto">
        <Grid data-testid={OrgMapScreenTestId.Grid} gap="100" style={GRID_11_COLS}>
          {DEPARTMENTS.map((dept) => {
            const status = departments.find((d) => d.id === dept.id);
            const cells: StateTone[] = employees
              .filter((e) => e.department === dept.id)
              .map((e) => e.state);
            const approvalCount = approvals.filter((a) => a.department === dept.id).length;
            return (
              <OrgNode
                alert={pickAlert(status?.errorCount ?? 0, approvalCount, t)}
                cells={cells}
                code={dept.code}
                key={dept.id}
                name={dept.name}
                onClick={() => setFocus(dept.id)}
                selected={focusId === dept.id}
              />
            );
          })}
        </Grid>
      </Container>

      {focusDepartment && (
        <Panel
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
                      <Stack gap="50">
                        <Typography type="body" weight="medium">
                          {e.name}
                        </Typography>
                        <Typography type="labelSm" variant="secondary">
                          {e.position.title ?? e.position.name}
                        </Typography>
                        <StatePill state={e.state} />
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
                <EmptyState body={t("focus.subtasksEmpty")} title={t("focus.subtasksEmptyTitle")} />
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
  );
}

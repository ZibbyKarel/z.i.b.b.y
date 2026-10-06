"use client";

import {
  Button,
  OrgFloorplan,
  type OrgFloorplanRoom,
  type OrgFloorplanZone,
  Stack,
  type StateTone,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApprovalsQuery } from "../../approvals/queries";
import { NewDepartmentDialog } from "../../departments/components/NewDepartmentDialog";
import { useCreateDepartmentMutation } from "../../departments/mutations";
import { useDepartmentsQuery, useDivisionsQuery } from "../../departments/queries";
import { useEmployeesQuery } from "../../employees/queries";
import { NOTIFICATIONS_PARAM, useNotificationsQuery } from "../../notifications";
import type { RunStatusGroupKey } from "../../runs/statusGroups";
import { aggregateZibbyState } from "../state/aggregateZibbyState";

export enum OrgMapScreenTestId {
  Root = "org-map-screen-root",
  AddDepartmentButton = "org-map-add-department-button",
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

/** Division → floorplan zone (the room's tint / border). Unknown divisions read as business. */
const ZONE_BY_DIVISION: Record<string, OrgFloorplanZone> = {
  engineering: "eng",
  operations: "ops",
  business: "biz",
  office: "per",
};

const STATES: readonly StateTone[] = ["working", "thinking", "blocked", "error", "done", "idle"];

/**
 * ZB-02 — the ORG map as an office floorplan: each department a room, each active
 * employee a desk, Zibby (COO) in the lobby. Pan/zoom/minimap live in the DS
 * `OrgFloorplan`; this screen feeds it from the departments / employees queries and
 * routes room → department, desk → person, Zibby → whatever put it in its state.
 */
export function OrgMapScreen() {
  const t = useTranslations("orgMap");
  const tDepartments = useTranslations("departments");
  const router = useRouter();
  const pathname = usePathname();

  const { data: departments = [] } = useDepartmentsQuery();
  const { data: divisions = [] } = useDivisionsQuery();
  const { data: employees = [] } = useEmployeesQuery({ status: "active" });
  const { data: approvals = [] } = useApprovalsQuery();
  const { data: notifications = [] } = useNotificationsQuery();
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const createDepartment = useCreateDepartmentMutation();

  const rooms = useMemo<OrgFloorplanRoom[]>(
    () =>
      departments.map((d) => {
        const agents = employees
          .filter((e) => e.department === d.id)
          .map((e, i) => ({
            id: e.id,
            code: `${d.code}-${String(i + 1).padStart(2, "0")}`,
            name: e.name,
            role: e.position.title ?? e.position.name,
            state: e.state,
            task: e.currentTaskTitle,
          }));
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          zone: ZONE_BY_DIVISION[d.division] ?? "biz",
          agents,
          ariaLabel: t("roomAria", { code: d.code, name: d.name, count: agents.length }),
        };
      }),
    [departments, employees, t],
  );

  const cooRuns = departments.reduce((sum, d) => sum + d.tier2Count + d.tier3Count, 0);
  const ownState: StateTone = cooRuns > 0 ? "working" : "idle";
  // Zibby mirrors the most urgent agent state: any employee's state, an unread
  // failed run in the bell (error) or a pending approval (blocked) — worse wins.
  const cooState = aggregateZibbyState(ownState, [
    ...employees.map((e) => e.state),
    ...(notifications.length > 0 ? (["error"] as const) : []),
    ...departments.map((d): StateTone => (d.tier3Count > 0 ? "blocked" : "idle")),
    ...approvals.map((): StateTone => "blocked"),
  ]);

  // The lobby opens whatever put Zibby in its state: the People roster when an
  // employee is in it, the bell for unread failures, the approvals queue for a
  // pending approval, else the runs archive filtered to that state.
  const cooGroup = RUN_GROUP[cooState];
  const cooHref = employees.some((e) => e.state === cooState)
    ? `/org/people?state=${cooState}`
    : cooState === "error"
      ? `${pathname}?${NOTIFICATIONS_PARAM}=open`
      : cooState === "blocked" && approvals.length > 0
        ? "/policy/approvals"
        : cooGroup
          ? `/activity/runs?state=${cooGroup}`
          : "/activity/runs";

  const stateLabels = useMemo(
    () => Object.fromEntries(STATES.map((s) => [s, t(`state.${s}`)])) as Record<StateTone, string>,
    [t],
  );

  return (
    <Stack data-testid={OrgMapScreenTestId.Root} gap="300" style={{ height: "100%" }}>
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
      <OrgFloorplan
        actions={
          <Button
            data-testid={OrgMapScreenTestId.AddDepartmentButton}
            icon="plus"
            intent="primary"
            onClick={() => setCreatingDepartment(true)}
            size="sm"
          >
            {tDepartments("create.addButton")}
          </Button>
        }
        coo={{
          state: cooState,
          label: t("cooAvatarLabel"),
          ariaLabel: t("cooAvatarLink", { state: stateLabels[cooState] }),
        }}
        labels={{
          zoomOut: t("controls.zoomOut"),
          zoomIn: t("controls.zoomIn"),
          zoomLevel: t("controls.zoomLevel"),
          fill: t("controls.fill"),
          minimap: t("controls.minimap"),
          workingOn: t("popover.workingOn"),
        }}
        onAgentClick={(_roomId, employeeId) => router.push(`/org/people/${employeeId}` as Route)}
        onCooClick={() => router.push(cooHref as Route)}
        onRoomClick={(id) => router.push(`/org/departments/${id}` as Route)}
        rooms={rooms}
        stateLabels={stateLabels}
      />
    </Stack>
  );
}

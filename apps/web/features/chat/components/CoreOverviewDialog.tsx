"use client";

import type { DepartmentId, DepartmentWithStatus } from "@zibby/contracts";
import {
  Container,
  Dialog,
  Grid,
  Icon,
  Pressable,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useDepartmentsQuery } from "../../departments/queries/useDepartmentsQuery";

export enum CoreOverviewDialogTestId {
  Root = "core-overview-dialog-root",
  Close = "core-overview-dialog-close",
  Stat = "core-overview-dialog-stat",
  DepartmentRow = "core-overview-dialog-department-row",
}

export interface CoreOverviewDialogProps {
  open: boolean;
  onClose: () => void;
  /** Picks a department for further inspection — wired to `DepartmentDrawer` by a
   * later task (C1). Fires before `onClose` so the caller can open its own
   * surface without racing this dialog's own close. */
  onSelectDepartment: (id: DepartmentId) => void;
}

interface StateCounts {
  running: number;
  error: number;
  report: number;
  waiting: number;
  idle: number;
}

/** Pure tally of the roster by live state — feeds the 4 header stats. */
function countByState(subs: DepartmentWithStatus[]): StateCounts {
  return {
    running: subs.filter((s) => s.state === "running").length,
    error: subs.filter((s) => s.state === "error").length,
    report: subs.filter((s) => s.state === "report").length,
    waiting: subs.filter((s) => s.state === "waiting").length,
    idle: subs.filter((s) => s.state === "idle").length,
  };
}

/**
 * Center-orb overview modal (Velín-D task A1): what the operator sees when they
 * click the WebGL orb on `/chat` — a snapshot of the whole federation, not one
 * department. Ports the `VcCoreDetailD` prototype's layout onto DS primitives: a
 * butler-mark header with a live `ok` status dot, a one-line derived summary, the
 * 4 state-tally stats (`running`/`report`/`waiting`/`idle`), then a 2-col roster grid.
 *
 * The header is fully custom (mark + name + dot + role line + its own close
 * button) rather than `Dialog`'s built-in `title`/`description` header, because
 * the prototype's header composes several elements DS's plain string header
 * can't — so `Dialog` renders with no `title` here and this component supplies
 * `ariaLabel` for the accessible name instead.
 *
 * Summary source (step 5): `useBriefingQuery` returns the *whole* assembled
 * `Briefing` (needsYou/didForYou/watching/engagements/trend7d, …) — far heavier
 * than a one-liner, and duplicating that subscription here would pull in
 * approval/channel detail this dialog doesn't show. Rendering a summary derived
 * from the roster's own state tally (already fetched for the stats row) needs no
 * second query and stays scoped to "what's happening across departments right now".
 *
 * Wiring `onSelectDepartment` into the existing `DepartmentDrawer` and making the
 * orb open this dialog are both later tasks (C1) — this component only exports
 * the `{ open, onClose, onSelectDepartment }` surface.
 */
export function CoreOverviewDialog({ open, onClose, onSelectDepartment }: CoreOverviewDialogProps) {
  const t = useTranslations("chat.overview");
  const tChat = useTranslations("chat");
  const tDepartments = useTranslations("departments");
  const { data: departments = [] } = useDepartmentsQuery();

  if (!open) return null;

  const counts = countByState(departments);
  const stats: Array<{ key: keyof StateCounts; label: string }> = [
    { key: "running", label: t("statWorking") },
    { key: "error", label: t("statError") },
    { key: "report", label: t("statReport") },
    { key: "waiting", label: t("statWaiting") },
    { key: "idle", label: t("statIdle") },
  ];

  const selectDepartment = (id: DepartmentId) => {
    onSelectDepartment(id);
    onClose();
  };

  return (
    <Dialog open ariaLabel={t("title")} onClose={onClose} width="lg">
      <Container data-testid={CoreOverviewDialogTestId.Root}>
        <Stack gap="200">
          <Stack align="center" direction="row" justify="between">
            <Stack align="center" direction="row" gap="150">
              <Icon name="butlerSign" size="lg" />
              <Stack gap="25">
                <Stack align="center" direction="row" gap="75">
                  <Typography type="title" weight="bold">
                    ZIBBY
                  </Typography>
                  <StatusDot pulse tone="ok" />
                </Stack>
                <Typography size="xs" type="note" variant="secondary">
                  {t("role", { count: departments.length })}
                </Typography>
              </Stack>
            </Stack>
            <Pressable
              aria-label={tChat("close")}
              data-testid={CoreOverviewDialogTestId.Close}
              onClick={onClose}
            >
              <Icon name="x" />
            </Pressable>
          </Stack>

          <Typography size="sm" type="text" variant="secondary">
            {t("summary", {
              error: counts.error,
              report: counts.report,
              waiting: counts.waiting,
              working: counts.running,
            })}
          </Typography>

          <Grid cols={5} gap="150">
            {stats.map(({ key, label }) => (
              <Container data-testid={CoreOverviewDialogTestId.Stat} key={key}>
                <Stack gap="25">
                  <Typography mono size="2xl" type="num" weight="bold">
                    {counts[key]}
                  </Typography>
                  <Typography size="xs" type="note" variant="tertiary">
                    {label}
                  </Typography>
                </Stack>
              </Container>
            ))}
          </Grid>

          <Stack gap="100">
            <Typography type="label">{t("crossDepartments")}</Typography>
            <Grid cols={2} gap="100">
              {departments.map((department) => (
                <Pressable
                  data-testid={CoreOverviewDialogTestId.DepartmentRow}
                  key={department.id}
                  onClick={() => selectDepartment(department.id)}
                >
                  <Container
                    padding="150"
                    style={{ border: "1px solid var(--color-border)", borderRadius: 8 }}
                    width="100%"
                  >
                    <Stack align="center" direction="row" gap="100" justify="between">
                      <Stack align="center" direction="row" gap="100">
                        <Container
                          height="8px"
                          style={{ backgroundColor: department.color, borderRadius: "9999px" }}
                          width="8px"
                        />
                        <Typography size="sm" type="label" weight="semibold">
                          {department.name}
                        </Typography>
                      </Stack>
                      <Typography size="xs" type="note" variant="tertiary">
                        {tDepartments(`state.${department.state}`)}
                      </Typography>
                    </Stack>
                  </Container>
                </Pressable>
              ))}
            </Grid>
          </Stack>
        </Stack>
      </Container>
    </Dialog>
  );
}

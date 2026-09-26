"use client";

import { DEPARTMENTS, type DepartmentId, type EmployeeWithState } from "@zibby/contracts";
import {
  AgentGlyph,
  Button,
  Card,
  Container,
  FilterBar,
  Grid,
  Legend,
  SearchInput,
  SectionLabel,
  SegmentedControl,
  SelectField,
  Stack,
  StatePill,
  Typography,
} from "@zibby/design-system";
import type { StateTone } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useEmployeesQuery } from "../../employees";
import { usePinToggle } from "../../pins";

/** Employee-state vocabulary (`EmployeeStateSchema`) → the DS state-tone palette
 * — same tones the department map and the profile hero already use. */
const STATE_TONE: Record<EmployeeWithState["state"], StateTone> = {
  working: "working",
  thinking: "thinking",
  blocked: "blocked",
  error: "error",
  done: "done",
  idle: "idle",
};

const ALL = "all";

export function PeopleScreen() {
  const t = useTranslations("people");
  const router = useRouter();
  const { data: employees = [], isPending, isError, refetch } = useEmployeesQuery();
  const { isPinned } = usePinToggle();

  const [department, setDepartment] = useState<string>(ALL);
  const [state, setState] = useState<string>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) set.add(e.position.title ?? e.position.name);
    return [...set].sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (e.status !== "active") return false;
      if (department !== ALL && e.department !== department) return false;
      if (state !== ALL && e.state !== state) return false;
      const roleLabel = e.position.title ?? e.position.name;
      if (role !== ALL && roleLabel !== role) return false;
      if (q && !e.name.toLowerCase().includes(q) && !roleLabel.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [employees, department, state, role, search]);

  const grouped = useMemo(() => {
    const byDept = new Map<DepartmentId, EmployeeWithState[]>();
    for (const e of filtered) {
      const list = byDept.get(e.department) ?? [];
      list.push(e);
      byDept.set(e.department, list);
    }
    for (const list of byDept.values()) {
      list.sort((a, b) => {
        const pinnedDiff = Number(isPinned("employee", b.id)) - Number(isPinned("employee", a.id));
        if (pinnedDiff !== 0) return pinnedDiff;
        return a.name.localeCompare(b.name);
      });
    }
    return DEPARTMENTS.filter((d) => byDept.has(d.id)).map((d) => ({
      department: d,
      employees: byDept.get(d.id)!,
    }));
  }, [filtered, isPinned]);

  const legendItems = (["working", "thinking", "blocked", "error", "done", "idle"] as const).map(
    (s) => ({
      state: STATE_TONE[s],
      label: t(`state.${s}`),
      count: filtered.filter((e) => e.state === s).length,
    }),
  );

  if (isPending) return <QueryLoading />;
  if (isError) return <QueryError onRetry={() => void refetch()} />;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Stack wrap align="end" direction="row" gap="200" justify="between">
            <Typography type="title">{t("title")}</Typography>
            <Button icon="plus" intent="primary" onClick={() => router.push("/org/people/new")}>
              {t("hire")}
            </Button>
          </Stack>

          <FilterBar
            onClear={() => {
              setDepartment(ALL);
              setState(ALL);
              setRole(ALL);
              setSearch("");
            }}
          >
            <SelectField
              label={t("filterDepartment")}
              onValueChange={setDepartment}
              options={[
                { value: ALL, label: t("allDepartments") },
                ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={department}
            />
            <Stack gap="75">
              <Typography tracking="wider" type="labelSm" variant="tertiary">
                {t("filterState")}
              </Typography>
              <SegmentedControl
                ariaLabel={t("filterState")}
                items={[
                  { value: ALL, label: t("allStates") },
                  ...(["working", "thinking", "blocked", "error", "done", "idle"] as const).map(
                    (s) => ({ value: s, label: t(`state.${s}`) }),
                  ),
                ]}
                onChange={setState}
                value={state}
              />
            </Stack>
            <SelectField
              label={t("filterRole")}
              onValueChange={setRole}
              options={[
                { value: ALL, label: t("allRoles") },
                ...roleOptions.map((r) => ({ value: r, label: r })),
              ]}
              value={role}
            />
            <SearchInput
              ariaLabel={t("search")}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              value={search}
            />
          </FilterBar>

          <Legend items={legendItems} />

          {grouped.length === 0 ? (
            <EmptyState
              actionLabel={t("hire")}
              description={t("emptyDescription")}
              glyph="bot"
              onAction={() => router.push("/org/people/new")}
              title={t("emptyTitle")}
            />
          ) : (
            grouped.map(({ department: d, employees: list }) => (
              <Container key={d.id}>
                <SectionLabel
                  action={
                    <Typography mono size="xs" type="note" variant="tertiary">
                      {list.length}
                    </Typography>
                  }
                >
                  {d.name}
                </SectionLabel>
                <Grid cols={1} gap="150" lg={5} sm={3}>
                  {list.map((e) => (
                    <Link href={`/org/people/${e.id}`} key={e.id}>
                      <Card interactive radius="sm">
                        <Container padding="200">
                          <Stack align="center" gap="100">
                            <AgentGlyph seed={e.agentId} size={48} state={STATE_TONE[e.state]} />
                            <Typography truncate type="labelSm">
                              {isPinned("employee", e.id) ? "★ " : ""}
                              {e.name}
                            </Typography>
                            <Typography size="xs" type="note" variant="tertiary">
                              {e.position.title ?? e.position.name}
                            </Typography>
                            <StatePill label={t(`state.${e.state}`)} state={STATE_TONE[e.state]} />
                          </Stack>
                        </Container>
                      </Card>
                    </Link>
                  ))}
                </Grid>
              </Container>
            ))
          )}
        </Stack>
      </PageContainer>
    </Container>
  );
}

"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  Dropdown,
  Panel,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@zibby/design-system";
import type {
  Company,
  LevelMappingEntry,
  LevelMappingKind,
  LevelMappingTarget,
} from "@zibby/contracts";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useLevelMappingQuery } from "../../roadmap/queries";
import { useUpdateCompanyMutation } from "../mutations";

export enum CompanyLevelMappingTestId {
  Row = "company-level-mapping-row",
  Override = "company-level-mapping-override",
  Global = "company-level-mapping-global",
  Reset = "company-level-mapping-reset",
}

export interface CompanyLevelMappingPanelProps {
  company: Company;
}

const KINDS: LevelMappingKind[] = ["jira", "github"];
const TARGETS: LevelMappingTarget[] = ["epic", "task", "ignore"];
/** The dropdown value meaning "no company override — use the global table". */
const USE_GLOBAL = "global";

/** Same normalisation `composeLevelMapping` / `resolveLevel` use: case-insensitive per kind. */
const keyOf = (e: Pick<LevelMappingEntry, "kind" | "externalLevel">) =>
  `${e.kind}:${e.externalLevel.trim().toLowerCase()}`;

/**
 * Per-company level-mapping overrides (Phase 128, D9). Rows are the GLOBAL table
 * for each kind; each shows the global target and lets the company override it
 * (a change is saved immediately as the whole `levelMapping.entries` document).
 * "Reset to global" — or picking "Global" in the dropdown — removes the entry.
 * The global table itself stays at `/settings?tab=tasks`.
 */
export function CompanyLevelMappingPanel({ company }: CompanyLevelMappingPanelProps) {
  const t = useTranslations("companies.levelMapping");
  const ts = useTranslations("settings.tasks");
  const mappingQuery = useLevelMappingQuery();
  const updateCompany = useUpdateCompanyMutation();

  const overrides = company.levelMapping?.entries ?? [];
  const overrideFor = (e: Pick<LevelMappingEntry, "kind" | "externalLevel">) =>
    overrides.find((o) => keyOf(o) === keyOf(e));

  const save = (entries: LevelMappingEntry[]) =>
    updateCompany.mutate({ params: { id: company.id }, body: { levelMapping: { entries } } });

  const setOverride = (row: LevelMappingEntry, value: string) => {
    const others = overrides.filter((o) => keyOf(o) !== keyOf(row));
    save(
      value === USE_GLOBAL
        ? others
        : [
            ...others,
            {
              kind: row.kind,
              externalLevel: row.externalLevel,
              target: value as LevelMappingTarget,
            },
          ],
    );
  };

  const options = [
    { value: USE_GLOBAL, label: t("useGlobal") },
    ...TARGETS.map((target) => ({ value: target, label: ts(`target.${target}`) })),
  ];

  // Global rows plus company-only overrides (a level the global table doesn't list yet).
  const rowsFor = (
    kind: LevelMappingKind,
  ): { row: LevelMappingEntry; global?: LevelMappingEntry }[] => {
    const globals = (mappingQuery.data?.entries ?? []).filter((e) => e.kind === kind);
    const globalKeys = new Set(globals.map(keyOf));
    return [
      ...globals.map((g) => ({ row: g, global: g })),
      ...overrides
        .filter((o) => o.kind === kind && !globalKeys.has(keyOf(o)))
        .map((o) => ({ row: o })),
    ];
  };

  return (
    <Panel header={t("title")} padding="200">
      <Stack gap="150">
        <Typography size="xs" type="note" variant="tertiary">
          {t("hint")}
        </Typography>
        {mappingQuery.isPending ? (
          <QueryLoading />
        ) : mappingQuery.isError ? (
          <QueryError onRetry={() => void mappingQuery.refetch()} />
        ) : (
          <Tabs defaultValue="jira">
            <TabList>
              {KINDS.map((kind) => (
                <Tab key={kind} value={kind}>
                  {ts(`kind.${kind}`)}
                </Tab>
              ))}
            </TabList>
            {KINDS.map((kind) => (
              <TabPanel key={kind} value={kind}>
                <Stack gap="100">
                  {rowsFor(kind).map(({ row, global }) => {
                    const override = overrideFor(row);
                    return (
                      <Stack
                        align="center"
                        data-testid={`${CompanyLevelMappingTestId.Row}-${keyOf(row)}`}
                        direction="row"
                        gap="100"
                        key={keyOf(row)}
                      >
                        <Container grow minW0>
                          <Typography size="sm" type="text">
                            {row.externalLevel}
                          </Typography>
                        </Container>
                        <Container grow minW0>
                          <Typography
                            data-testid={`${CompanyLevelMappingTestId.Global}-${keyOf(row)}`}
                            size="xs"
                            type="note"
                            variant="tertiary"
                          >
                            {global
                              ? t("global", { target: ts(`target.${global.target}`) })
                              : t("companyOnly")}
                          </Typography>
                        </Container>
                        <Container grow minW0>
                          <div data-testid={`${CompanyLevelMappingTestId.Override}-${keyOf(row)}`}>
                            <Dropdown<string>
                              aria-label={t("override")}
                              onChange={(value) => setOverride(row, value)}
                              options={options}
                              value={override?.target ?? USE_GLOBAL}
                              variant="field"
                            />
                          </div>
                        </Container>
                        <Button
                          data-testid={`${CompanyLevelMappingTestId.Reset}-${keyOf(row)}`}
                          disabled={!override || updateCompany.isPending}
                          intent="ghost"
                          onClick={() => setOverride(row, USE_GLOBAL)}
                          size="sm"
                        >
                          {t("reset")}
                        </Button>
                      </Stack>
                    );
                  })}
                </Stack>
              </TabPanel>
            ))}
          </Tabs>
        )}
      </Stack>
    </Panel>
  );
}

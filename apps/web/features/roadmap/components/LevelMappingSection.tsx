"use client";

import type { LevelMappingEntry, LevelMappingKind } from "@zibby/contracts";
import { Button, Stack, Tab, TabList, TabPanel, Tabs, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useSetLevelMappingMutation } from "../mutations";
import { useLevelMappingQuery } from "../queries";
import { LevelMappingTable, type LevelMappingTableRow } from "./LevelMappingTable";

export interface LevelMappingSectionProps {
  /**
   * Visual language (D7, docs/hud2chat/DECISIONS.md), same convention as
   * `GateRulesSection` — defaults to `"hud"`. The Settings "Tasky" tab (this
   * component's only call site so far) opts in with `surface="glass"`.
   */
  surface?: "hud" | "glass";
}

const KINDS: LevelMappingKind[] = ["jira", "github"];

/**
 * The `/settings?tab=tasks` body — the global external-level -> epic/task/ignore
 * mapping table (125a), inner-tabbed Jira/GitHub (`Tabs` unmounts the inactive
 * `TabPanel`'s content, but the draft state below lives on THIS component, not the
 * panel, so switching the inner tab never drops unsaved edits to the other kind).
 *
 * Owns its own query + mutation, like `GateRulesSection`. Save always PUTs the WHOLE
 * `{ entries }` document (`putLevelMapping`) — `setRowsFor` rebuilds it from every
 * OTHER kind's untouched entries plus this kind's edited rows, so editing Jira can
 * never silently drop GitHub's rows (and vice versa).
 */
export function LevelMappingSection({ surface }: LevelMappingSectionProps = {}) {
  const t = useTranslations("settings.tasks");
  const tk = useTranslations();
  const mappingQuery = useLevelMappingQuery();
  const setMapping = useSetLevelMappingMutation();

  // Controlled state — null means "follow server data" (ProfileScreen's idiom).
  const [entries, setEntries] = useState<LevelMappingEntry[] | null>(null);
  const effectiveEntries = entries ?? mappingQuery.data?.entries ?? [];

  const rowsFor = (kind: LevelMappingKind): LevelMappingTableRow[] =>
    effectiveEntries
      .filter((e) => e.kind === kind)
      .map((e) => ({ externalLevel: e.externalLevel, target: e.target }));

  const setRowsFor = (kind: LevelMappingKind, rows: LevelMappingTableRow[]) => {
    const otherEntries = effectiveEntries.filter((e) => e.kind !== kind);
    const kindEntries: LevelMappingEntry[] = rows.map((r) => ({
      kind,
      externalLevel: r.externalLevel,
      target: r.target,
    }));
    setEntries([...otherEntries, ...kindEntries]);
  };

  const save = () => {
    const cleaned = effectiveEntries.filter((e) => e.externalLevel.trim());
    setMapping.mutate({ body: { entries: cleaned } }, { onSuccess: () => setEntries(null) });
  };

  const canSave = !setMapping.isPending && !mappingQuery.isPending && !mappingQuery.isError;

  return (
    <HudPanel
      action={
        <Button
          data-testid="level-mapping-save"
          disabled={!canSave}
          icon="check"
          intent="primary"
          onClick={save}
          size="sm"
        >
          {tk("common.save")}
        </Button>
      }
      padding="300"
      surface={surface}
      title={t("title")}
    >
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
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
                  {t(`kind.${kind}`)}
                </Tab>
              ))}
            </TabList>
            {KINDS.map((kind) => {
              const rows = rowsFor(kind);
              return (
                <TabPanel key={kind} value={kind}>
                  <Stack gap="150">
                    {rows.length === 0 && (
                      <EmptyState
                        description={t("emptyDesc")}
                        glyph="flow"
                        title={t("emptyTitle")}
                      />
                    )}
                    <LevelMappingTable
                      kind={kind}
                      onChange={(next) => setRowsFor(kind, next)}
                      rows={rows}
                    />
                  </Stack>
                </TabPanel>
              );
            })}
          </Tabs>
        )}
      </Stack>
    </HudPanel>
  );
}

"use client";

import type { TeamKbDigestItem } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  BoardText,
  Button,
  Container,
  SectionLabel,
  SelectField,
  Stack,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { ResolveQuestionDialog } from "../../teams/components/ResolveQuestionDialog";
import { isNoKbError, useTeamKbDigestQuery, useTeamsQuery } from "../../teams/queries";
import type { BridgeSelection, BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum TeamKbWidgetTestId {
  TeamSelect = "team-kb-widget-team-select",
  Pick = "team-kb-widget-pick",
  NoKb = "team-kb-widget-no-kb",
  Questions = "team-kb-widget-questions",
  Decisions = "team-kb-widget-decisions",
  Row = "team-kb-widget-row",
  Resolve = "team-kb-widget-resolve",
}

/** The team-note viewer URL (same route the knowledge graph opens notes in). */
export const teamNoteHref = (teamId: string, noteId: string) =>
  `/knowledge/vault?source=${encodeURIComponent(`team:${teamId}`)}&note=${encodeURIComponent(noteId)}`;

/** `BridgeSelection.id` of a note row: `<teamId>:<noteId>` (team ids are slugs, so the first `:` splits). */
export const noteSelectionId = (teamId: string, noteId: string) => `${teamId}:${noteId}`;
export const parseNoteSelectionId = (id: string) => {
  const i = id.indexOf(":");
  return { teamId: id.slice(0, i), noteId: id.slice(i + 1) };
};

/**
 * Team knowledge: the open questions and agreements lifted from a team's KB meeting notes. A row
 * opens its source note in the detail sheet.
 * Scoped to a team (`widget.scope.teamId`), chosen via the header configure toggle. Empty (collapsed)
 * until a team is chosen.
 */
export function TeamKbWidget({
  widget,
  editing,
  onEmptyChange,
  onCountChange,
  onScopeChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.teamKb");
  const teamId = widget.scope?.teamId;
  const teamsQuery = useTeamsQuery();
  const digestQuery = useTeamKbDigestQuery(teamId);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const [resolving, setResolving] = useState<TeamKbDigestItem | null>(null);
  const teamName = teams.find((x) => x.id === teamId)?.name;

  const digest = digestQuery.data;
  const noKb = isNoKbError(digestQuery.error);
  const failed = digestQuery.isError && !noKb;
  const loading = teamId !== undefined && digestQuery.isPending;
  const count =
    teamId === undefined || loading
      ? undefined
      : digest
        ? digest.questions.length + digest.decisions.length
        : 0;
  // Header aside: the team name (the frame shows ALL CLEAR itself when empty).
  useWidgetReport(
    { loading, count, you: 0, aside: teamName, failed },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      {editing ? (
        <Container padding={["100", "150"]}>
          <Stack data-testid={TeamKbWidgetTestId.TeamSelect}>
            <SelectField
              label={t("team")}
              onValueChange={(id) => onScopeChange({ teamId: id })}
              options={teams.map((x) => ({ value: x.id, label: x.name }))}
              value={teamId ?? ""}
            />
          </Stack>
        </Container>
      ) : null}
      {teamId === undefined ? (
        <Note testId={TeamKbWidgetTestId.Pick}>{t("pick")}</Note>
      ) : noKb ? (
        <Note testId={TeamKbWidgetTestId.NoKb}>{t("noKb")}</Note>
      ) : failed ? (
        <QueryError onRetry={() => void digestQuery.refetch()} />
      ) : digest ? (
        <>
          <Group
            editing={editing}
            group="questions"
            items={digest.questions}
            onOpen={onOpen}
            onResolve={setResolving}
            selection={selection}
            sheetSide={sheetSide}
            teamId={teamId}
            testId={TeamKbWidgetTestId.Questions}
            title={t("questions")}
            widgetId={widget.id}
          />
          <Group
            editing={editing}
            group="decisions"
            items={digest.decisions}
            onOpen={onOpen}
            onResolve={setResolving}
            selection={selection}
            sheetSide={sheetSide}
            teamId={teamId}
            testId={TeamKbWidgetTestId.Decisions}
            title={t("decisions")}
            widgetId={widget.id}
          />
        </>
      ) : null}
      {resolving && teamId !== undefined ? (
        <ResolveQuestionDialog
          item={resolving}
          onClose={() => setResolving(null)}
          teamId={teamId}
        />
      ) : null}
    </>
  );
}

function Note({ testId, children }: { testId: string; children: string }) {
  return (
    <BoardRow tone="neutral">
      <span data-testid={testId}>
        <BoardText kind="meta" tone="ink3">
          {children}
        </BoardText>
      </span>
    </BoardRow>
  );
}

interface GroupProps {
  title: string;
  group: "questions" | "decisions";
  items: TeamKbDigestItem[];
  teamId: string;
  testId: string;
  widgetId: string;
  selection: BridgeSelection | null;
  editing: boolean;
  onOpen: (selection: BridgeSelection) => void;
  onResolve: (item: TeamKbDigestItem) => void;
  sheetSide: BridgeWidgetProps["sheetSide"];
}

function Group({
  title,
  group,
  items,
  teamId,
  testId,
  widgetId,
  selection,
  editing,
  onOpen,
  onResolve,
  sheetSide,
}: GroupProps) {
  const t = useTranslations("bridge.widgets.teamKb");
  if (items.length === 0) return null;
  return (
    <div data-testid={testId}>
      <Container padding={["100", "150"]}>
        <SectionLabel>{title}</SectionLabel>
      </Container>
      {items.map((item, i) => {
        // One note can source several items: the key is per item, the sheet per note.
        const key = `${widgetId}:${group}:${i}`;
        return (
          <BoardRow
            action={
              group === "questions" && !editing ? (
                <Button
                  aria-label={t("resolveLabel", { text: item.text })}
                  data-testid={TeamKbWidgetTestId.Resolve}
                  intent="ghost"
                  onClick={() => onResolve(item)}
                  size="sm"
                >
                  {t("resolve")}
                </Button>
              ) : undefined
            }
            key={key}
            onClick={() =>
              onOpen({
                kind: "note",
                id: noteSelectionId(teamId, item.noteId),
                widgetId,
                key,
                href: teamNoteHref(teamId, item.noteId),
              })
            }
            rowKey={key}
            selected={selection?.key === key}
            sheetSide={sheetSide}
            tone="neutral"
          >
            <span data-testid={TeamKbWidgetTestId.Row}>
              <BoardText kind="title">{item.text}</BoardText>
              <BoardLine gap="6" indent={false}>
                <BoardText kind="meta" tone="ink">
                  {item.noteTitle}
                </BoardText>
                {item.date ? (
                  <BoardText kind="meta" tone="ink3">
                    · {item.date}
                  </BoardText>
                ) : null}
              </BoardLine>
            </span>
          </BoardRow>
        );
      })}
    </div>
  );
}

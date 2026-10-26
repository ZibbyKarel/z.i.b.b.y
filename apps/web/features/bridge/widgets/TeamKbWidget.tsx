"use client";

import type { TeamKbDigestItem } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  BoardText,
  Container,
  SectionLabel,
  SelectField,
  Stack,
  type SubNavLinkComponent,
  TextLink,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { isNoKbError, useTeamKbDigestQuery, useTeamsQuery } from "../../teams/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum TeamKbWidgetTestId {
  TeamSelect = "team-kb-widget-team-select",
  Pick = "team-kb-widget-pick",
  NoKb = "team-kb-widget-no-kb",
  Questions = "team-kb-widget-questions",
  Decisions = "team-kb-widget-decisions",
  Row = "team-kb-widget-row",
}

/** The team-note viewer URL (same route the knowledge graph opens notes in). */
export const teamNoteHref = (teamId: string, noteId: string) =>
  `/knowledge/vault?source=${encodeURIComponent(`team:${teamId}`)}&note=${encodeURIComponent(noteId)}`;

/**
 * Team knowledge: the open questions and agreements lifted from a team's KB meeting notes.
 * Scoped to a team (`widget.scope.teamId`), chosen in edit mode. Empty (collapsed) outside edit
 * mode until a team is chosen.
 */
export function TeamKbWidget({
  widget,
  editing,
  onEmptyChange,
  onCountChange,
  onScopeChange,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.teamKb");
  const teamId = widget.scope?.teamId;
  const teamsQuery = useTeamsQuery();
  const digestQuery = useTeamKbDigestQuery(teamId);
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
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
            items={digest.questions}
            teamId={teamId}
            testId={TeamKbWidgetTestId.Questions}
            title={t("questions")}
          />
          <Group
            items={digest.decisions}
            teamId={teamId}
            testId={TeamKbWidgetTestId.Decisions}
            title={t("decisions")}
          />
        </>
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
  items: TeamKbDigestItem[];
  teamId: string;
  testId: string;
}

function Group({ title, items, teamId, testId }: GroupProps) {
  if (items.length === 0) return null;
  return (
    <div data-testid={testId}>
      <Container padding={["100", "150"]}>
        <SectionLabel>{title}</SectionLabel>
      </Container>
      {items.map((item, i) => (
        <BoardRow key={`${item.noteId}:${i}`} tone="neutral">
          <TextLink
            data-testid={TeamKbWidgetTestId.Row}
            href={teamNoteHref(teamId, item.noteId)}
            linkComponent={Link as SubNavLinkComponent}
          >
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
          </TextLink>
        </BoardRow>
      ))}
    </div>
  );
}

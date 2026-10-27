"use client";

import { AnchoredSheet, Markdown, SheetBlock, SheetSection } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTeamKbNoteQuery } from "../../../knowledge/queries";
import { useTeamsQuery } from "../../../teams/queries";
import { parseNoteSelectionId, teamNoteHref } from "../../widgets/TeamKbWidget";
import { type SheetProps, geometry } from "./sheetTypes";

/** Team KB note (`GET /api/teams/:id/kb/note`): the rendered body; the title opens it in the vault. */
export function NoteSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const { teamId, noteId } = parseNoteSelectionId(id);
  const { data: note } = useTeamKbNoteQuery(teamId, noteId);
  const { data: teams } = useTeamsQuery();

  if (!note) return null;
  const team = teams?.find((x) => x.id === teamId)?.name ?? teamId;

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      chips={[team, note.id]}
      closeLabel={t("bridge.sheet.close")}
      kind={t("bridge.sheet.kind.note")}
      onClose={onClose}
      onTitleClick={() => router.push(teamNoteHref(teamId, noteId) as Route)}
      title={note.title}
    >
      <SheetSection>
        <SheetBlock label={t("bridge.sheet.description")}>
          <Markdown escapeHtml source={note.body} />
        </SheetBlock>
      </SheetSection>
    </AnchoredSheet>
  );
}

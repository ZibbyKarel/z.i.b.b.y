"use client";

import { Button, Chip, Pressable, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Note } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";

export interface NoteViewProps {
  /** The open note, or undefined when nothing is selected. */
  note: Note | undefined;
  /** Navigate to a linked/backlinked note (index-first traversal). */
  onSelect: (id: string) => void;
  /** Open the note editor. */
  onEdit: () => void;
}

/** A row of clickable wiki-link chips — the index-first navigation affordance. */
function LinkChips({
  ids,
  kind,
  onSelect,
}: {
  ids: readonly string[];
  kind: "link" | "backlink";
  onSelect: (id: string) => void;
}) {
  return (
    <Stack wrap align="center" direction="row" gap="50">
      {ids.map((id) => (
        <Pressable
          data-testid={`memory-note-${kind}-${id}`}
          key={id}
          onClick={() => onSelect(id)}
        >
          <Chip tone="idle">{id}</Chip>
        </Pressable>
      ))}
    </Stack>
  );
}

/**
 * The memory note viewer: the note's body plus its **navigable** wiki-links — outbound
 * `links` (→) and inbound `backlinks` (←), each a clickable chip that selects that note.
 * This is the index-first navigation the North Star describes ("MOCs are the way in… notes
 * joined by wiki-links"): open a MOC, click through its links, click a backlink to return.
 */
export function NoteView({ note, onSelect, onEdit }: NoteViewProps) {
  const t = useTranslations("memory");

  return (
    <HudPanel padding="250" title={note?.title ?? t("noteFallback")}>
      {note ? (
        <Stack gap="150">
          <Stack align="center" direction="row" gap="150" justify="between">
            <Typography mono size="caption" type="note" variant="tertiary">
              {note.path} · {note.tier}
            </Typography>
            <Button
              data-testid="memory-note-edit"
              icon="edit"
              intent="ghost"
              onClick={onEdit}
              size="sm"
            >
              {t("editNote")}
            </Button>
          </Stack>

          <Typography size="base" type="note" variant="secondary">
            {note.body ?? ""}
          </Typography>

          {note.links.length > 0 && (
            <Stack gap="50">
              <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                {t("noteLinks")}
              </Typography>
              <LinkChips ids={note.links} kind="link" onSelect={onSelect} />
            </Stack>
          )}

          {note.backlinks && note.backlinks.length > 0 && (
            <Stack gap="50">
              <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                {t("noteBacklinks")}
              </Typography>
              <LinkChips ids={note.backlinks} kind="backlink" onSelect={onSelect} />
            </Stack>
          )}
        </Stack>
      ) : (
        <Typography mono size="sm" type="note" variant="secondary">
          {t("selectNode")}
        </Typography>
      )}
    </HudPanel>
  );
}

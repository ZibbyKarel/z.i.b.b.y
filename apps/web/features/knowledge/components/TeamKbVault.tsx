"use client";

import { useMemo, useState } from "react";
import {
  Container,
  Grid,
  List,
  ListItem,
  ListItemText,
  Panel,
  SearchInput,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Note } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useTeamKbNoteQuery, useTeamKbNotesQuery } from "../queries";
import { NoteView } from "./NoteView";

export interface TeamKbVaultProps {
  teamId: string;
  /** The open note's repo-relative path, or null. */
  selected: string | null;
  onSelect: (path: string) => void;
}

/** Wikilink target -> repo-relative id, by exact path, extensionless path or basename. */
function resolveLink(link: string, ids: readonly string[]): string | undefined {
  const norm = link.replace(/\.md$/, "");
  return (
    ids.find((id) => id.replace(/\.md$/, "") === norm) ??
    ids.find((id) => id.replace(/\.md$/, "").split("/").pop() === norm)
  );
}

/**
 * Read-only browser of a team's knowledge base (the Trezor with a team source): notes
 * grouped by top folder with a filter box on the left, the open note on the right via
 * the shared `NoteView` in `readOnly` mode. No edit / capture / import / create.
 */
export function TeamKbVault({ teamId, selected, onSelect }: TeamKbVaultProps) {
  const t = useTranslations("knowledge");
  const tm = useTranslations("memory");
  const [search, setSearch] = useState("");
  const notesQuery = useTeamKbNotesQuery(teamId);
  const noteQuery = useTeamKbNoteQuery(teamId, selected);

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byFolder = new Map<string, typeof notes>();
    for (const n of notes) {
      if (q && !n.title.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q)) continue;
      byFolder.set(n.folder, [...(byFolder.get(n.folder) ?? []), n]);
    }
    return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [notes, search]);

  const note: Note | undefined = useMemo(() => {
    const data = noteQuery.data;
    if (!data) return undefined;
    const ids = notes.map((n) => n.id);
    const links = [
      ...new Set(
        data.links.flatMap((l) => {
          const id = resolveLink(l, ids);
          return id && id !== data.id ? [id] : [];
        }),
      ),
    ];
    return {
      id: data.id,
      path: data.id,
      tier: "knowledge",
      title: data.title,
      frontmatter: {},
      links,
      body: data.body,
    };
  }, [noteQuery.data, notes]);

  if (notesQuery.isPending) return <QueryLoading />;
  if (notesQuery.isError) return <QueryError onRetry={() => void notesQuery.refetch()} />;

  const nav = (
    <Panel header={t("vault.teamReadOnly")} padding="150">
      <Stack gap="200">
        <SearchInput
          ariaLabel={t("vault.title")}
          data-testid="vault-search-input"
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tm("searchPlaceholder")}
          value={search}
        />
        {notes.length === 0 ? (
          <EmptyState description={t("vault.emptyTeam")} glyph="brain" title={tm("emptyTitle")} />
        ) : (
          <List>
            {groups.map(([folder, items]) => (
              <Stack gap="50" key={folder}>
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {folder || t("vault.rootFolder")} · {items.length}
                </Typography>
                {items.map((n) => (
                  <ListItem
                    active={n.id === selected}
                    id={`kb-${n.id}`}
                    key={n.id}
                    onSelect={() => onSelect(n.id)}
                  >
                    <ListItemText>{n.title}</ListItemText>
                  </ListItem>
                ))}
              </Stack>
            ))}
          </List>
        )}
      </Stack>
    </Panel>
  );

  return (
    <Grid align="start" gap="200" sidebar="left">
      {nav}
      {noteQuery.isError ? (
        <Container>
          <Typography mono size="sm" type="note" variant="secondary">
            {t("vault.noteError")}
          </Typography>
        </Container>
      ) : (
        <NoteView readOnly note={note} onSelect={onSelect} />
      )}
    </Grid>
  );
}

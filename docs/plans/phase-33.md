# Phase 33 — Memory note viewer: navigable wiki-links + backlinks

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** — restore the North Star's core
> index-first navigation on the second-brain surface.

## Audit result

The `/memory` screen reads the **real vault** — `useMemoryGraphQuery` (force-directed
wiki-link graph), `useMemorySearchQuery` (index-first search, no embeddings),
`useNoteQuery` (note body + tier + path), a daily timeline, and a create/edit note dialog
(vault write API, Phase 4). Most of it is solid and not a mock.

The gap is in the **note viewer**: it broke index-first navigation.
- The note **body** renders as a single raw `Typography` — `[[wikilinks]]` are inert text.
- **Backlinks** render as plain `← {backlinks.join(", ")}` — not clickable.
- The note's resolved outbound **`links`** (the `[[wiki-link]]` targets, already on
  `NoteSchema` as note-id arrays) are **not shown at all**.

So from an open note — especially a **MOC**, whose whole point is to be the entry point of
links — you cannot click through to a linked note. Only the graph lets you traverse. North
Star: _"MOCs and descriptive filenames are the way in… notes joined by wiki-links into a
graph."_ The data is already there (`note.links`, `note.backlinks`); it just isn't navigable.

## Fix

- Extract the note panel (currently inline in `memory/Screen.tsx`) into a testable
  `features/memory/components/NoteView.tsx` — props `{ note: Note | undefined; onSelect:
  (id: string) => void; onEdit: () => void }`.
- Below the body, render two **navigable** rows when present:
  - outbound `note.links` (→): each id a clickable `Chip` (`Pressable`,
    `data-testid={`memory-note-link-${id}`}`) → `onSelect(id)`;
  - inbound `note.backlinks` (←): same, `memory-note-backlink-${id}` → `onSelect(id)`.
  (Mirrors the existing `tierChips` / search-hit `Pressable<Chip>` pattern.)
- `memory/Screen.tsx`: replace the inline note `HudPanel` with
  `<NoteView note={note} onSelect={setSelected} onEdit={() => setEditor({ mode: "edit" })} />`.
- i18n `memory.noteLinks` / `memory.noteBacklinks` (cs+en).

## Tests
`features/memory/components/NoteView.test.tsx`:
- a note with `links` + `backlinks` renders both rows (body shown);
- clicking a link chip calls `onSelect` with that target id;
- clicking a backlink chip calls `onSelect` with that backlink id;
- `note === undefined` → the "select a node" fallback (no chips).

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Deferred (follow-up candidate)
Full markdown rendering of the note body (inline `[[…]]` in prose clickable, headings/lists
rendered) — larger; the structured `links`/`backlinks` rows deliver index-first nav now.

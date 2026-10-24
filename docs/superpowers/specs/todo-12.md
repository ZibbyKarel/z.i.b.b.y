# TODO 12 — Týmy a scope widgetů

**Raw TODO item:** Týmy a scope widgetů: entita Team a týmový widget znalostní báze (otevřené otázky a dohody)

## Interpretation (night-run rulings, operator asleep)

- **The Team entity already exists.** It has CRUD, a detail page, a read-only knowledge base (KB),
  notes, a graph, ingest and ff-sync (`libs/contracts/src/teams`, `apps/api/src/teams`,
  `features/teams`). This item adds no new team fields. What is missing is:
  - widgets that can be **scoped**, i.e. a widget instance bound to a team;
  - a **team KB widget** on the Bridge that shows the team's open questions and agreements.
- **Where questions and agreements come from.** The team KB's `kb-librarian` agent writes each
  meeting note with dedicated template sections for decisions and open questions. The widget
  reads exactly those sections. It is read-only, like everything that touches a team KB (law:
  `readOnly: true` is structural). ZIBBY never writes to the KB.
- **Scope v1.** `BridgeWidget` gains an optional `scope: { teamId }`. Only the new `teamKb`
  widget uses it. Existing widgets ignore it; scoping issues/PRs/runs by team is a later, separate
  change.

## Requirements

1. **Contracts.**
   - Add a read-only route to `teamsContract`: `getTeamKbDigest`, `GET /api/teams/:id/kb/digest`.
     - It returns `200 TeamKbDigest`.
     - It returns `404 ErrorSchema` when the team is unknown or has no `knowledgeBase`, mirroring
       the other `kb/*` routes.
   - Schemas:
     - `TeamKbDigestItemSchema = { text: string (max 300), noteId: string (KB-relative path), noteTitle: string, date?: string }`.
     - `TeamKbDigestSchema = { questions: TeamKbDigestItem[], decisions: TeamKbDigestItem[] }`.
   - `BridgeWidgetSchema`:
     - `type` gains `"teamKb"`;
     - add an optional `scope: z.object({ teamId: TeamIdSchema.optional() }).strict().optional()`.
2. **API.** Add `KbReaderService.digest(source): Promise<TeamKbDigest>`, a pure, read-only scan
   over the same browsable notes (`.vtt` and `_templates/` excluded).
   - **Section detection.** A markdown heading of any level whose text, after trimming,
     stripping a trailing `:` and lowercasing, matches:
     - questions: `open questions`, `open question`, `otevřené otázky`, `otázky`, `questions`;
     - decisions: `decisions`, `decision`, `agreements`, `rozhodnutí`, `dohody`, `dohodnuto`.
     - A section runs until the next heading of the same or higher level.
   - **Items.** List lines inside a section: `-`, `*`, `+`, `1.` and `- [ ]`.
     - A checked task line (`- [x]`) is skipped (a resolved question or done item).
     - Each item's text is trimmed, list markers are removed, and it is capped at 300 chars.
     - Empty items are skipped.
     - Nested list lines (indented) are skipped. Only top-level items are taken.
     - Frontmatter is ignored when detecting sections.
   - **Date.** The note's frontmatter `date` (a string, or a Date which is ISO-formatted), when
     present.
   - **Order.** Newest-dated notes first. Undated notes come after, ordered by `noteId`
     descending. Within a note, items keep their document order.
   - **Caps.** At most 30 items per list.
   - **Failure.** A missing or unreadable KB root yields empty lists, never a throw (same posture
     as the reader).
3. **Web.**
   - **Bridge state.** Add a `configure(id, scope)` action that updates one widget's `scope` in the
     edit draft, the same draft path `move`/`resize` use. It is saved with the layout. Widgets
     receive an `onScopeChange(scope)` prop.
   - **`TeamKbWidget`** (`features/bridge/widgets/TeamKbWidget.tsx`), registered as `teamKb`:
     - label cs "Tým — znalosti" / en "Team knowledge";
     - desc cs "Otevřené otázky a dohody z týmové znalostní báze." / en "Open questions and
       agreements from the team knowledge base."
   - **Edit mode.** A `SelectField` lists the teams (cs "Tým" / en "Team"). Choosing one calls
     `onScopeChange({ teamId })`.
   - **No team chosen.** The text is cs "Vyber tým v režimu úprav." / en "Pick a team in edit
     mode." It reports `empty: true` outside edit mode.
   - **Team has no KB, or the digest returns 404.** The text is cs "Tým nemá znalostní bázi." / en
     "This team has no knowledge base."
   - **Otherwise.** Two groups, in order:
     1. cs "Otevřené otázky" / en "Open questions";
     2. cs "Dohody" / en "Agreements".
     - Each row shows the item text plus the note title (and date when present).
     - Each row links to `/knowledge/vault?source=team:<teamId>&note=<noteId>` (URL-encoded),
       the existing team-note viewer route.
   - **Header.** `count` = questions + decisions. `aside` = the team name.
   - **Freshness.** A query `useTeamKbDigestQuery(teamId)` in `features/teams/queries`, with
     `staleTime` 5 min. No polling: the KB changes only through sync or ingest.
4. Every string goes through next-intl, in cs and en.
5. Docs: `docs/api/teams.md` (the new route). Also update the doc that lists Bridge widgets, if
   one exists.

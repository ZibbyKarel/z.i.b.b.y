# F8 — Hearth + the Personal Domain — Implementation Plan

> NS2 phase F8, planned against branch `north-star-2`. Contract-first (exact Zod below), tests = DoD, no `any`, per-package `tsc -p` (never `rtk pnpm typecheck`), testid enums for any web selector, i18n cs+en for every new string (parity test `apps/web/i18n/messages/parity.test.ts` enforces both files). Three independently-committable subphases: **F8a seat Hearth**, **F8b personal-domain data**, **F8c Hearth duties v1**. Assumes F1–F7 have all landed.

---

## Factual corrections (verified in code — flag before implementing)

**FC-1 — Calendar ownership must NOT move to Hearth. The scope-guidance line "calendar integrations → hearth" contradicts both canonical documents.**
- North Star II §The Chairs is explicit: **"Puls — Tep systému. Owns every inbound heartbeat: channel polling, calendar, CI/CD monitors…"** (`.zibby/data/vault/north-star-2.md:80`).
- ROADMAP-2 §F8 keeps it under Puls too: **"Calendar-aware daily note: *Puls's calendar reads* compose into a daily personal note"** (`ROADMAP-2.md:330-331`).
- Charter duty 6 (`north-star-2.md:63-65`) reserves heartbeat/watcher duties for watcher subsystems; Hearth is defined Tier-3-leaning ("surface, don't act"), not a watcher. Making Hearth own the poller violates its own charter.
- There is a **live** calendar integration on disk: `.zibby/data/integrations/zibbycalendar.json` (`kind:"calendar"`, `calendarId:"primary"`, `projectId:"zibby-self"`). After F1b's boot backfill it is owned by **puls** (`integrationOwnerSeed()` returns `"puls"` for every integration — `apps/api/src/subsystems/owner-seed.ts:60-62`).

  **Resolution (implemented by this plan): Puls polls, Hearth consumes.** Integration ownership is left untouched in F8a. Hearth owns *the personal vault domain, quick capture, the personal shelf, the personal agenda/reminders surface* — vault artifacts, not stored dispatchable entities. This is exactly the F1 precedent where **codex/ledger legitimately own zero dispatchable entities** and render empty rosters. If the operator later insists calendar be a Hearth asset, it is a one-line change in `owner-seed.ts` — but it would then contradict the charter, so it is deliberately not done here.

**FC-2 — The registry is already at 10 (codex+ledger seated in F1a), and the schema's "closed enum, no eleventh without a design decision" comment IS satisfied.** Operator ruling `docs/ns2/DECISIONS.md` ("hearth (personal domain) in F8") is that design decision. `SubsystemIdSchema` (`libs/contracts/src/subsystems/subsystem.schema.ts:9-20`) and `SUBSYSTEMS` (`:51-123`) currently hold 10 ids incl. `codex`/`ledger`. F8a grows both to 11; the doc comments at `:3-8` and `:44-50` must be updated to "eleven".

**FC-3 — A `personal/` vault directory / namespace is impossible in this vault — same constraint F4 hit for shelves.** Note ids are file **basenames unique vault-wide** (`NOTE_ID` regex forbids separators, `vault.service.ts:137`), and `createNote` only ever writes into the three tier dirs `memory`/`daily`/`knowledge` (`resolveNoteFile`/`tierDir`, `vault.service.ts:302-317`, `TIERS` `:59`). ROADMAP-2 §F8's "personal/ + personal MOCs" cannot be a directory. **Implement the personal domain as a frontmatter marking `domain: personal`** — a direct parallel to how project isolation already works via `project:` frontmatter + `ownerProjectOf` (`vault.service.ts:119-130`). Hearth's shelf follows the F4 scheme: `knowledge/subsystem-hearth-moc.md` (id `subsystem-hearth-moc`, auto-recognized as an entry point by the `/(^|[-_ ])(index|moc)$/i` test at `vault.service.ts:186`).

**FC-4 — Four exact `length === 10` assertions become 11** (all four verified today, will fail the instant `hearth` is appended):
- `libs/contracts/src/subsystems/subsystems.contract.test.ts:58` `toHaveLength(10)` and `:72` `new Set(colors).size).toBe(10)`
- `apps/api/test/subsystems.e2e.test.ts:65` `toHaveLength(10)`
- `apps/api/src/subsystems/subsystems.service.test.ts:465` `toHaveLength(10)`
- (`libs/design-system/src/immersive/ellipseLayout.test.ts:9` `toHaveLength(8)` is an 8-node fixture, unrelated — leave it.)

**FC-5 — Quick capture triaging "like the halda flow" is free.** `createNote` called **without a `tier`** defaults to `knowledge` and forces `raw: true` (`vault.service.ts:333-335`); the nightly distiller already sweeps every `raw:true` note (`rawNotes()` `vault.service.ts:235-253`; distiller gather `memory-distiller.service.ts:199-216`, triage `:373-428`). A `capture_note` tool that calls `createNote({ id, title, body, frontmatter: { domain: "personal" } })` needs **zero distiller changes**.

**FC-6 — Calendar events already become channel items; a live integration exists.** The calendar adapter normalizes each event to `text: "[<start>] <summary>"` (`calendar.adapter.ts:195`) and items persist through triage into `ChannelItemStore`. `ChannelItem` carries a top-level `kind` field (`channel.schema.ts:60`), so the briefing can filter `kind === "calendar"` with no new injection. F8c needs **no new adapter**.

**FC-7 — Personal-task dispatch (roadmap "scout/herald as owners, domain:personal") is deferred, not in F8 core.** The F8 scope is "surface, don't act… NO new heavy entity unless the code makes it natural." This plan therefore ships the `domain` marking on the *data/grounding* layer (F8b) and the *surface* layer (F8c), and leaves personal-task routing as an explicitly-noted future increment. Nothing here blocks it.

**Confirmed premises (no correction needed):** orb map is count-generic — going 10→11 orbs needs zero layout code, only the two `Record<SubsystemId, IconName>` glyph tables (`subsystemVisuals.ts:35`, `ChatQuickTask.tsx:41`) must gain the `hearth` key or TS won't compile (F1 established this). `SubsystemsService` iterates `SUBSYSTEMS` generically. `subsystemLoad.ts:41-42` is a `Partial<Record<…>>` — no change.

---

## F8a — Seat Hearth (registry 10 → 11)

### Verified current state
- Enum `libs/contracts/src/subsystems/subsystem.schema.ts:9-20` (10 ids); registry array `:51-123`; color regex `/^#[0-9a-f]{6}$/i` `:39`; existing colors listed `:44-49`.
- Glyph tables (compile-breakers): `apps/web/features/subsystems/subsystemVisuals.ts:35-46` and `apps/web/features/chat/components/ChatQuickTask.tsx:41-52` — both already carry `codex: "brain"`, `ledger: "dollar"`.
- DS icon set (`libs/design-system/src/assets/icons/index.ts`) includes `coffee`, `moon`, `spark`, `pulse`, `pin` — **no** `home`/`flame`/`hearth`. Use **`coffee`** (warmest domestic-life glyph in the set).
- F4c committed 10 shelf files + `zibby-index`'s `## Subsystémy` section; F4c's `composeSeedNotes` generates one shelf per `SUBSYSTEMS` entry — so once `hearth` is in the registry the empty-vault seeder auto-includes it; only the **committed** shelf file + the index line must be added by hand.
- Owner-seed rules `apps/api/src/subsystems/owner-seed.ts:28-83` — no calendar-specific rule; all integrations → puls.

### Ordered change list
1. `subsystem.schema.ts:9-20` — append `"hearth"` to `SubsystemIdSchema`. Update the header doc comment `:3-8` from "ten"→"eleven" and cite `docs/ns2/DECISIONS.md` / F8.
2. `subsystem.schema.ts:51-123` — append the 11th `SUBSYSTEMS` entry (Czech, matching the existing chairs' voice):
   ```ts
   {
     id: "hearth",
     name: "Hearth",
     tagline: "Krb domova",
     mandate:
       "Osobní život operátora — rychlé poznámky, denní agenda, osobní poličky a připomínky, oddělené od práce.",
     color: "#d9694a",
   },
   ```
   Update the color-list doc comment `:44-49` to add `hearth #d9694a`. (`#d9694a` is a warm terracotta ember, distinct from beacon `#f4785c` and maestro `#e0a83c`; the contract test only requires **uniqueness**, so a designer may retune later.)
3. `apps/web/features/subsystems/subsystemVisuals.ts:35-46` — add `hearth: "coffee"`.
4. `apps/web/features/chat/components/ChatQuickTask.tsx:41-52` — add `hearth: "coffee"` (keep the two tables in sync; collapsing the duplication stays out of scope).
5. **Owner-seed: no change** (FC-1). Add a one-line comment in `owner-seed.ts` above `integrationOwnerSeed` documenting that calendar stays puls-owned (heartbeat duty) and Hearth consumes calendar reads — so a future reader does not "fix" it.
6. **Committed Hearth shelf** — new file `.zibby/data/vault/knowledge/subsystem-hearth-moc.md`, mirroring the 10 F4c shelves exactly:
   ```markdown
   ---
   title: "Hearth — polička"
   subsystem: hearth
   type: fact
   tags: [subsystem, hearth, moc]
   ---
   Krb domova — osobní život operátora: rychlé poznámky, denní agenda, osobní
   poličky a připomínky, držené odděleně od práce.

   ## Poznatky

   [[zibby-index]] · [[north-star-2]]
   ```
7. `.zibby/data/vault/knowledge/zibby-index.md` — add `- [[subsystem-hearth-moc]] — <mandate one-liner>` to its `## Subsystémy` section (created in F4c).

### Test list (scoped)
- `libs/contracts/src/subsystems/subsystems.contract.test.ts` — `:58` → `toHaveLength(11)`; `:72` → `size).toBe(11)`; extend the codex/ledger non-empty assertion (`:61-66`) to include `"hearth"`; assert `hearth` color matches the hex regex.
- `apps/api/test/subsystems.e2e.test.ts:65` → `toHaveLength(11)`.
- `apps/api/src/subsystems/subsystems.service.test.ts:465` → `toHaveLength(11)` (verify the aggregate/roster still resolves for an entity-less subsystem — Hearth's roster is empty, exactly like codex/ledger).
- Web: `SubsystemOrbMap` / `subsystemLoad` tests pass with 11 nodes (no assertion change expected — count-generic). Add nothing unless a snapshot pins the count.
- Runner: `pnpm exec vitest run libs/contracts/src/subsystems apps/web/features/subsystems apps/web/features/chat`; `pnpm exec vitest run apps/api/src/subsystems`; `pnpm exec tsc -p libs/contracts && pnpm exec tsc -p apps/api && pnpm exec tsc -p apps/web`. Verify glyph tables with `grep -rn "Record<SubsystemId" apps libs` after editing.

### Commit
`feat(contracts): seat hearth — the eleventh chair for the personal domain`

---

## F8b — Personal-domain data (marking + grounding isolation + quick capture)

### Verified current state
- `visibleToProject` isolation filter `apps/api/src/memory/grounding.service.ts:37-42`; `GroundingInput` `:25-29`; compose applies it at `:106-107`; direct-id adds (north-star, self-knowledge, F4a's shelf) bypass the filter `:101-108`.
- `ownerProjectOf` frontmatter derivation `vault.service.ts:119-130`; `index()` spreads `project` when present `:189-190`; `graph()` `:217-219`; `note()` via `typedFieldsOf` `:208`.
- Contract `libs/contracts/src/memory/memory.schema.ts` — `NoteSchema:27`, `IndexEntrySchema:43` (has `project:52`), `MemoryGraphSchema:57` (node `project:68`), `CreateNoteSchema:116` (`frontmatter:121`). Post-F4b these also carry an optional `subsystem` field — `domain` sits alongside it.
- Chat MCP tools registered in `apps/api/src/chat/chat-mcp.controller.ts:105-206` (`buildServer`); tool logic in `apps/api/src/chat/chat-tools.service.ts` (delegates to `VaultService` etc., injected `:31-36`). `recall_memory` precedent `:83-86` + controller `:135-146`.
- Distiller halda triage is owner-agnostic (FC-5) — a `domain:personal` raw note triages unchanged.

### Contract additions (exact Zod, all additive/optional)
In `libs/contracts/src/memory/memory.schema.ts`, top-level:
```ts
/**
 * A note's life-domain (F8). "personal" marks the operator's private second brain
 * (calendar, notes, reminders); the ABSENCE of this field means work — the default,
 * so every existing note stays work-domain with no migration. Isolated from project
 * grounding the same way projects are isolated from each other (see GroundingService).
 */
export const NoteDomainSchema = z.literal("personal");
export type NoteDomain = z.infer<typeof NoteDomainSchema>;
```
Then add `domain: NoteDomainSchema.optional()` to: `NoteSchema`, `IndexEntrySchema`, `MemoryGraphSchema` node, `SearchHitSchema` (if it carries `project`), and confirm `CreateNoteSchema` already permits it via `frontmatter`. (A `z.literal` rather than an enum keeps it minimal and honestly single-valued; it widens to `z.enum` later without breaking parsers.)

### Ordered change list
1. **Contract** — the additions above. Doc-comment each field as "retrieval/isolation marker, never embeddings".
2. **VaultService** (`vault.service.ts`):
   - New pure export `domainOf(frontmatter: Record<string, unknown>): NoteDomain | undefined` — `NoteDomainSchema.safeParse(frontmatter.domain).success ? "personal" : undefined`, mirroring `ownerProjectOf` (`:119-130`).
   - `index()` `:188-191`, `graph()` `:217-220`, `note()`/`rawNotes()`/`search()` — spread `domain` when present, exactly like the existing `project` spread.
3. **GroundingService** (`grounding.service.ts`):
   - `GroundingInput` gains `domain?: NoteDomain` (`:25-29`).
   - New pure exported filter (composes with `visibleToProject`, does not replace it):
     ```ts
     /**
      * Domain isolation (F8): a work run (domain absent) never sees a personal note;
      * a personal run sees personal + global notes (project notes are already excluded
      * upstream because a personal run carries no projectId). Personal life and project
      * work never cross-ground — the same wall projects have between each other.
      */
     export function visibleInDomain(entries: IndexEntry[], domain: NoteDomain | undefined): IndexEntry[] {
       if (domain === "personal") return entries;
       return entries.filter((e) => e.domain !== "personal");
     }
     ```
   - `compose` `:106-107` — wrap: `const visible = visibleInDomain(visibleToProject(entries, input.projectId), input.domain);`
   - After the self-knowledge add (`:102`), ground the Hearth shelf for personal runs: `if (input.domain === "personal") await add(subsystemShelfId("hearth"));` (reuses F4a's `subsystem-shelf.ts` helper; missing shelf is skipped by `add`'s existing catch `:96-98`).
4. **Quick capture — `capture_note` MCP tool.**
   - `ChatToolsService` — add `async capturePersonalNote(input: { text: string; title?: string }): Promise<string>`: build a deterministic id (`personal-<YYYYMMDD-HHmmss>` or slug of title, guarded to `NOTE_ID` shape), call `this.vault.createNote({ id, title: input.title ?? …, body: input.text, frontmatter: { domain: "personal" } })` (no `tier` → halda/raw), catch `DuplicateNoteError` by suffixing, return a Czech confirmation (`"Zapsal jsem osobní poznámku (<id>) — v noci ji zařadím."`). Fail-open on other errors → apologetic string, never throw into the transport.
   - `chat-mcp.controller.ts` `buildServer` — register `capture_note` (description: files a PRIVATE personal note to the operator's second brain; never dispatches work; triaged overnight). `inputSchema: { text: z.string(), title: z.string().optional() }`.
   - No new grounding producer is wired for personal *runs* in F8b (FC-7); `recall_memory`/search already reach personal notes for the operator's own direct recall, which is acceptable (search is operator-facing, not a work-run prompt).

### Test list (scoped)
- `libs/contracts/src/memory/memory.contract.test.ts` — `domain:"personal"` parses on Note/IndexEntry/graph node; a legacy payload without it parses; `domain:"work"` (any non-`personal`) is rejected.
- `apps/api/src/memory/vault.service.test.ts` — `domainOf` valid/invalid/absent; `index()` and `graph()` carry `domain` from a `domain:personal` fixture.
- `apps/api/src/memory/grounding.service.test.ts` — **the key assertion:** a `domain:personal` note is ABSENT from a project-scoped compose (`{ task, projectId:"acme" }`) and from a plain work compose (`{ task }`); `visibleInDomain` unit cases (personal passes all; work drops personal); a personal compose (`{ task, domain:"personal" }`) INCLUDES the personal note and the `subsystem-hearth-moc` shelf; determinism preserved.
- `apps/api/src/chat/chat-tools.service.test.ts` — `capturePersonalNote` creates a raw note with `frontmatter.domain === "personal"` and no tier (→ knowledge/raw); duplicate id suffixes rather than throwing; a vault failure returns the apology string.
- `apps/api/src/chat/chat-mcp.controller.test.ts` — `capture_note` is registered and round-trips the confirmation.
- Runner: `pnpm exec vitest run libs/contracts/src/memory apps/api/src/memory apps/api/src/chat`; `tsc -p` libs/contracts, apps/api.

### Commit
`feat(memory): personal domain — domain:personal marking, grounding isolation, capture_note`

---

## F8c — Hearth duties v1 (calendar-aware agenda + reminders in the briefing)

> **Binding rebase instruction.** The briefing is edited by F3b (per-subsystem restructure), F5 (Sentinel/Maestro/Loom lines), F6c (stale watchers) and F7b (merged-work celebration) before F8. Plan file/line refs below are the **pre-F3** briefing; the implementer MUST rebase these strictly-additive fields onto the actual post-F7 `briefing.schema.ts` / `briefing-assembly.ts` / `briefing.service.ts`. Add fields and render blocks; **never** restructure existing sections. If F3b introduced a per-subsystem section layout, render the personal agenda/reminders under a Hearth grouping instead of a standalone `## Osobní` heading — but the schema fields and gather logic are identical either way.

### Verified current state (pre-F3 baseline)
- `BriefingSchema` optional-array pattern (`trend7d`/`learnedPatterns`/`automationGaps`/`appIdeas`) `libs/contracts/src/briefing/briefing.schema.ts:96-104`.
- `assembleBriefing` spread-if-non-empty pattern `apps/api/src/briefing/briefing-assembly.ts:103-110`; `renderBriefingMarkdown` section pattern `:349-359`; `BriefingInput` `:17-48`.
- `briefing.service.assemble` gather `apps/api/src/briefing/briefing.service.ts:58-110`; `channelItems` already loaded `:65`, filtered to in-flight `:80`; note-backed reads precedent `readAutomationGaps` `:183-195`.
- `ChannelItem.kind` top-level field `libs/contracts/src/channels/channel.schema.ts:60`; calendar item text format `[<ISO start>] <summary>` (`calendar.adapter.ts:195`).

### Contract additions (exact Zod)
`briefing.schema.ts`, appended to `BriefingSchema`:
```ts
/** F8 — today's personal calendar events (from the Puls-owned calendar reads). */
personalAgenda: z.array(z.string()).max(50).optional(),
/** F8 — open personal reminders parsed from the `personal-reminders` vault note. */
reminders: z.array(z.string()).max(50).optional(),
```

### Ordered change list
1. **Contract** — the two optional arrays above.
2. **`briefing-assembly.ts`**:
   - `BriefingInput` gains `personalAgenda?: string[]` and `reminders?: string[]`.
   - New pure exported helper:
     ```ts
     /** Today's personal calendar lines: calendar-kind channel items whose event
      *  start (the `[<ISO>]` prefix the calendar adapter writes) falls on `now`'s date. */
     export function buildPersonalAgenda(channelItems: ChannelItem[], now: Date): string[] {
       const today = now.toISOString().slice(0, 10);
       return channelItems
         .filter((i) => i.kind === "calendar")
         .map((i) => {
           const m = /^\[([^\]]+)\]\s*(.*)$/.exec(i.text);
           return m ? { start: m[1], label: m[2] || i.text } : null;
         })
         .filter((e): e is { start: string; label: string } => e !== null && e.start.startsWith(today))
         .sort((a, b) => a.start.localeCompare(b.start))
         .map((e) => `${e.start.slice(11, 16) || e.start} — ${e.label}`);
     }
     ```
     (Fail-open on parse: an unparseable item is dropped, never throws. Deterministic → snapshot-testable.)
   - `assembleBriefing` — call `buildPersonalAgenda(input.channelItems ?? [], input.now)` (prefer building here from `channelItems` so it stays pure) and spread `personalAgenda`/`reminders` only when non-empty, matching `:103-110`.
   - `renderBriefingMarkdown` — additive block (pre-F3 heading; rebase per instruction):
     ```
     ## Osobní — dnešní agenda   (only if personalAgenda.length)
     ## Připomínky               (only if reminders.length)
     ```
3. **`briefing.service.ts`**:
   - New `private async readReminders(): Promise<string[]>` mirroring `readAutomationGaps` `:183-195` — reads vault note `personal-reminders`, parses `- [ ] …` / `- [x] …` bullets, keeps unchecked first, caps at 5, `[]` on any error.
   - In `assemble`, add `readReminders()` to the parallel gather `:86-91`; pass `reminders` and (already-available) `channelItems: inFlight` into `assembleBriefing`.
   - Everything fail-open (calendar absent → empty agenda → section omitted; no `personal-reminders` note → empty reminders → section omitted). Honors the autonomy contract: **surface only, no action** (Tier-3-leaning).
4. **Seed a starter `personal-reminders` note** — commit `.zibby/data/vault/knowledge/personal-reminders.md` with `domain: personal`, `subsystem: hearth`, an empty `## Připomínky` checkbox list, so the operator (or `capture_note`) has a home for reminders and the briefing read resolves. Keep it a plain operator-editable note — **no new entity, no new store**.
5. **Web (minimal):** if the web briefing card renders section-by-section (verify post-F7), add the two optional sections behind their non-empty guards with testid enums and i18n keys `briefing.personalAgenda` / `briefing.reminders` (cs: `"Osobní — dnešní agenda"` / `"Připomínky"`; en: `"Personal — today's agenda"` / `"Reminders"`). If the card renders raw markdown, no web change is needed — confirm before touching web.

### Test list (scoped)
- `libs/contracts/src/briefing/briefing.contract.test.ts` — both optional arrays parse; a legacy briefing without them parses; `.max(50)` enforced.
- `apps/api/src/briefing/briefing-assembly.test.ts` — `buildPersonalAgenda`: a calendar item dated today → one line; a calendar item dated tomorrow → dropped; a non-calendar channel item → ignored; an unparseable text → dropped (no throw); sorted by start. `renderBriefingMarkdown`: agenda/reminders sections appear iff non-empty; a briefing with neither renders **byte-identical to today** (snapshot regression — proves strict additivity).
- `apps/api/src/briefing/briefing.service.test.ts` — `readReminders` parses bullets from a fixture `personal-reminders` note, `[]` when absent; `assemble` surfaces a fixture calendar event dated `now` as `personalAgenda` and does NOT throw when there is no calendar integration.
- (If web edited) `apps/web/features/.../Briefing*.test.tsx` — sections render behind guards via testid enum.
- Runner: `pnpm exec vitest run libs/contracts/src/briefing apps/api/src/briefing`; `pnpm exec vitest run apps/api/test/briefing.e2e.test.ts` (must stay green — additivity); `tsc -p` libs/contracts, apps/api (+ apps/web if edited).

### Commit
`feat(briefing): hearth duties — personal calendar agenda and reminders, additively`

---

## Sequencing & global gotchas
- **Order F8a → F8b → F8c strictly.** F8b's Hearth-shelf grounding uses F8a's registry id; F8c's reminders note reuses F8b's `domain:personal` marking. Each subphase: scoped tests green → checkpoint commit; repo-wide `pnpm test` + `pnpm check:deps` + `pnpm check:cycles` at phase end only.
- **Two glyph tables are the whole F8a compile risk** — verify `grep -rn "Record<SubsystemId" apps libs` after editing (ignore `.next/` build artifacts).
- **Do not reassign calendar ownership** (FC-1). If a reviewer flags Hearth's empty roster, that is correct and matches codex/ledger.
- **data-test landmine:** running any CLI/boot with `ZIBBY_DATA_DIR` at the shared fixture mutates tracked files via boot backfill/seeding — temp copy + `git status --short apps/api/data-test` before committing. The new committed vault shelves live under `.zibby/data/vault/knowledge/`, which is git-tracked (only `daily/` is gitignored) — expected to be staged.
- **Briefing additivity is load-bearing** — the `briefing.e2e` and the "byte-identical when empty" snapshot are the guardrails that keep F8c from colliding with F3b/F5/F6c/F7b. Rebase, never restructure.
- **Fail-open everywhere** — capture, grounding, agenda, reminders each degrade to a no-op/empty on any error; a personal-domain hiccup must never block a work run, a chat turn, or a briefing.
- Commit messages end with the standard `Co-Authored-By` + `Claude-Session` footers.

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with the following rulings:

1. **FC-1 accepted and binding:** calendar stays puls-owned ("Puls polls, Hearth
   consumes"). Hearth's empty roster is correct by design. The clarifying comment
   in `owner-seed.ts` is mandatory so nobody "fixes" it later.
2. **FC-3 accepted:** the personal domain is the `domain: personal` frontmatter
   marking, never a directory. `NoteDomainSchema` as `z.literal("personal")` is
   the approved shape.
3. **Domain-isolation invariants are non-negotiable and must each have a test:**
   (a) a work compose (no domain, with or without projectId) NEVER includes a
   `domain: personal` note; (b) a personal compose includes personal + global and
   grounds the hearth shelf; (c) `capture_note` always stamps
   `domain: "personal"`; (d) the briefing personal sections are surface-only — no
   action, no dispatch (FC-7 deferral holds).
4. **F8c briefing rebase rule inherited:** implementation order on the briefing
   file stays strictly sequential (F3 → F4 → F5 → F6 → F7 → F8); the
   byte-identical-when-empty snapshot is mandatory.
5. Glyph `coffee` + color `#d9694a` approved (designer may retune later; the
   contract test enforces only uniqueness).
6. Commit messages end with the standard Co-Authored-By + Claude-Session footers.

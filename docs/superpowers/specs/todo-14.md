# TODO 14 — Revize Návrhy

**Raw TODO item:** Revize Návrhy: widget co zobrazí systémové návrhy vzniklé z automatizací, s možností zamítnout nebo upravit poznatek (provenance, jistota, expirace) - například z automatizace Továrna agentů, Návrhy na automatizaci, Extrakce vzorů a dalších

## Interpretation (night-run rulings, operator asleep)

- Today, three automations "propose without acting" in three unrelated shapes:
  - **Extrakce vzorů** (`pattern-extract`) writes plain bullets to the vault note `patterns/suggestions`.
  - **Návrhy na automatizaci** (`gap-detect`) writes plain bullets to `suggestions/automation-gaps`.
  - **Továrna agentů** (`agent-factory`) parks a candidate agent behind an `agent-proposal` approval.
- None of them carries provenance, confidence or expiry, and none can be dismissed or edited.
- This item adds one structured **proposal record** that every producer writes, a small API to
  list, dismiss and edit those records, and a Bridge widget **Návrhy** to review them.
- Producers keep writing their existing vault notes, so the briefing is unchanged. On their next
  run they respect the operator's decisions:
  - a dismissed proposal is no longer written into the note;
  - an edited proposal is written with the edited text.
- More producers (security-scan, arch-audit, review-learning…) plug in later through the same
  `ProposalsService.upsert`. v1 wires the three sources the operator named.

## Requirements

1. **Contract `proposalsContract`** (`libs/contracts/src/proposals/`).
   - `ProposalSchema`:
     - `id: string`. It is a stable id, a short hash of `source` + the producer's dedupe key, so
       reruns update the record instead of duplicating it.
     - `source: "pattern-extract" | "gap-detect" | "agent-factory"` (a closed enum, extended
       per producer).
     - `text: string`, max 500 chars. This is the producer's current wording.
     - `editedText?: string`, max 500 chars. This is the operator's wording; when present, it
       wins everywhere.
     - `confidence: "low" | "medium" | "high"`.
     - `occurrences: number`, the evidence count the producer saw.
     - `provenance: { automationId?: string, noteId?: string, approvalId?: string, agentId?: string }`.
     - `createdAt`, `lastSeenAt`, `expiresAt`: ISO strings.
     - `status: "open" | "dismissed"`.
     - `decidedAt?: string`.
   - `GET /api/proposals` returns `200 Proposal[]`. These are the open, unexpired proposals,
     sorted by confidence (high first), then by `lastSeenAt` descending.
   - `PATCH /api/proposals/:id` takes the body
     `{ action: "dismiss" } | { action: "edit", text: string (1–500) }`.
     - It returns `200 Proposal`.
     - It returns `404` when the id is unknown.
     - It returns `409` on `edit` of an `agent-factory` proposal, which is not editable. Its
       candidate agent is edited on the agent page.
     - It returns `409` on any action on a dismissed proposal.
2. **Confidence** is computed from `occurrences` against the producer's own minimum `m`:
   - `low` when the count is at most `m`;
   - `medium` when it is at most `2m`;
   - `high` otherwise.
3. **Expiry.** `expiresAt = lastSeenAt + 30 days`. Every producer run that still sees the
   proposal refreshes `lastSeenAt` and `expiresAt`. Expired proposals are not listed, but they
   are kept on disk.
4. **Store.** One JSON file `proposals/proposals.json` under the API data dir. Writes are atomic
   (temp file then rename) and serialized. An unreadable file reads as empty and never 500s.
5. **Upsert semantics** (`ProposalsService.upsert(input)`):
   - A new id is created as `open`.
   - An existing id gets updated `text`, `occurrences`, `confidence`, `lastSeenAt`, `expiresAt`
     and `provenance`.
   - An existing record keeps its `status`, `editedText` and `decidedAt`. A dismissed proposal is
     never re-opened by a rerun.
6. **Producers.**
   - **`pattern-extract`.** It upserts one proposal per pattern. The dedupe key is
     `action + decision`. Provenance is `{ automationId: "nightly-patterns", noteId: "patterns/suggestions" }`.
     - Use the id of the automation file that targets `pattern-extract`. Look it up rather than
       hard-coding it if a lookup exists. Otherwise omit `automationId`.
     - When writing the note, the extractor skips dismissed proposals and uses `editedText` when
       present.
   - **`gap-detect`.** The same treatment. The dedupe key is the normalized pattern, and the
     noteId is `suggestions/automation-gaps`.
   - **`agent-factory`.** It upserts one proposal per parked candidate. The dedupe key is the
     candidate agent id. Provenance is `{ agentId, approvalId }`. `occurrences` is the
     fallback count that triggered the candidate.
   - **Dismissing an `agent-factory` proposal rejects its pending `agent-proposal` approval**
     through the existing approval reject path, the same effect as rejecting it on the approvals
     page. If the approval is already decided, dismissal only updates the record.
7. **Activity.** Dismissing or editing records an activity entry of kind `proposal-decided`. Its
   summary is "dismissed" or "edited" plus the source, and its refs carry the proposal id.
8. **Web — Bridge widget `proposals`.**
   - Labels: cs "Návrhy" / en "Proposals". Description: cs "Návrhy z automatizací ke kontrole —
     zamítni nebo uprav poznatek." / en "Suggestions from automations to review — dismiss or
     edit the insight."
   - **Each row** shows:
     - the text (`editedText ?? text`);
     - a source label:
       - `pattern-extract`: cs "Extrakce vzorů" / en "Pattern extraction";
       - `gap-detect`: cs "Návrhy na automatizaci" / en "Automation ideas";
       - `agent-factory`: cs "Továrna agentů" / en "Agent factory";
     - a confidence badge: cs "nízká/střední/vysoká jistota" / en "low/medium/high confidence";
     - the expiry: cs "vyprší za {days} d" / en "expires in {days} d";
     - a provenance link:
       - noteId → `/knowledge/vault?note=<noteId>`;
       - agentId → the agent detail route;
       - approvalId → the approvals/gates page.
   - **Row actions:**
     - "Zamítnout" / "Dismiss" is available on every row.
     - "Upravit" / "Edit" is available on every row except `agent-factory`. It switches the row
       to an inline text area with "Uložit" / "Save" and "Zrušit" / "Cancel". Save is disabled
       when the text is empty or unchanged.
     - Errors show inline on the row (`meta.inlineError`).
     - Mutations invalidate the proposals query. A dismissed row disappears.
   - **Header:** `count` = the number of open proposals. The empty state is cs "Žádné návrhy ke
     kontrole." / en "No proposals to review." and reports `empty`.
   - **Freshness:** invalidate on `proposal-decided` and on the producers' run-completion
     activity, if the activity SSE mapping makes that natural. Otherwise use `staleTime` 5 min
     with no polling.
9. Every string goes through next-intl in cs and en. Use DS primitives and testid enums, with no
   inline style.
10. **Docs:** `docs/api/proposals.md`, plus whatever docs-sync names.

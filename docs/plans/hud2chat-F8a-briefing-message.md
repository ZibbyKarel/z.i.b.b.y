# F8a — The butler briefing as a chat message

Part of the HUD → Chat UI migration. **This is the first phase in the arc that touches
`libs/contracts` and `apps/api`** — everything before it was frontend-only. Contract-first is
not optional here: `libs/contracts` is the source of truth, so the Zod schema changes first,
then the API, then the web rendering.

Read `docs/hud2chat/DECISIONS.md` — **O3, O6, D16** apply directly — and `docs/hud2chat/ROADMAP.md`.

## Why this exists

O3 dissolved `/overview` three ways; the butler briefing is the part that becomes a chat
message. O6 settled *how*: **not** flattened into plain assistant markdown. The briefing is
structured — headline, "needs you" rows that link somewhere, per-subsystem lines, engagements,
did-for-you / watching / paused-limit counters — and prose would destroy the rows that make it
actionable. It gets its own rendered variant.

This must land **before** F8c deletes `/overview`, or the briefing has nowhere to live.

## The constraint that shapes the whole phase

`libs/contracts/src/chat/chat.schema.ts` defines `ChatRoleSchema = z.enum(["user",
"assistant"])`. There is no third role, and `features/chat/components/ChatMessage.tsx`
branches only on `role === "user"` vs. everything else.

**Do not add a third role.** A role is *who is speaking*, and the briefing is the butler
speaking — the same voice as any assistant turn. What differs is *what kind of content* the
turn carries. So extend the message with an optional structured payload (a `briefing` field,
or a `kind` discriminator alongside the existing `text`), keep `role: "assistant"`, and let
`ChatMessage.tsx` render the card when the payload is present and fall through to today's
markdown path when it is not.

Every existing persisted message must keep deserialising unchanged — transcripts are JSONL on
disk (files are the source of truth). If your schema change would make an existing transcript
line fail validation, it is wrong. Make the new field optional and verify against a real
transcript file under the data dir.

## Scope

1. **Contract** — `libs/contracts/src/chat/chat.schema.ts`: the briefing payload variant.
   Reuse the existing briefing schema from `libs/contracts/src/briefing/` rather than
   redefining its shape; if it needs to be shared, export it, don't copy it.
2. **API** — the briefing already exists: `GET /api/briefing`, `POST /api/briefing/generate`,
   implemented in `apps/api/src/briefing/`. Your job is the path by which a briefing *enters
   the transcript*. Read `apps/api/src/chat/chat-session.service.ts` to see how a turn is
   appended today, and follow that mechanism. **Decide and state explicitly** what triggers
   the briefing turn: generation, an operator request in chat, or a scheduled/heartbeat push.
   If the answer is not obvious from the existing code, implement the narrowest option
   (briefing generation appends the turn) and say so in your report — do not build a scheduler.
3. **Web** — `features/chat/components/ChatMessage.tsx` renders the variant. The visual
   reference is the existing `features/overview/components/BriefingCard/BriefingCard.tsx`:
   reuse its structure and sub-parts where you can rather than reinventing the layout, but it
   must sit inside the transcript as a message, not as a page panel — so glass surfaces, no
   `HudPanel`, and it must not assume page-width.
4. The "needs you" rows currently link to `/runs`. **Point them at `/archiv`** — `/runs` is
   deleted in F8c and `/archiv` replaced it in F2. This is the one link repoint that belongs
   in this phase rather than F8c, because you are writing the rows.

## Out of scope
Deleting `/overview`, `BriefingCard`, or `/runs` — that is F8c, and `BriefingCard` must keep
working until then. The topbar status line (F8b). Relocating the activity module (D16, F8c).
**Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit`, `npx tsc -p libs/design-system --noEmit`, and — new for this
  phase — `npx tsc -p apps/api --noEmit`. Run tsc DIRECTLY; `rtk pnpm typecheck` reports false
  success.
- Scoped vitest for `web-components` **and** the api project. Note a pre-existing flake that is
  not yours: `apps/api/src/runner/runner-core.test.ts`.
- **Backward compatibility is the sharpest risk.** Prove an existing transcript JSONL line
  still parses against the new schema — with an actual test over a real line, not by reasoning.
- **Live browser at 1680px:** trigger a briefing and see it rendered in the chat transcript.
  Confirm the "needs you" rows are clickable and land on `/archiv`. Report what you saw.

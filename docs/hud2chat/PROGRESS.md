# HUD → Chat UI migration — progress board

Live truth. Updated after every phase, immediately.

**Branch:** `feat/hud-to-chat-migration` (off `main` @ 32ce9b9e) · **Parked at PR gate** —
nothing pushed.

| #   | Phase                      | Status | Commit | Notes                                                                                  |
| --- | -------------------------- | ------ | ------ | -------------------------------------------------------------------------------------- |
| —   | Grounding + control docs   | ✅     | —      | audit read, design corpus + current chrome grounded, operator decisions O1–O4 captured |
| F0  | Immersive shell foundation | 🔩     | —      | in flight                                                                              |
| F1  | Settings                   | ⬜     | —      |                                                                                        |
| F2  | Archive of tasks           | ⬜     | —      |                                                                                        |
| F3  | Catalogs A                 | ⬜     | —      |                                                                                        |
| F4  | Catalogs B                 | ⬜     | —      |                                                                                        |
| F5  | Orchestration              | ⬜     | —      |                                                                                        |
| F6  | Delivery entities          | ⬜     | —      |                                                                                        |
| F7  | Memory + gates             | ⬜     | —      |                                                                                        |
| F8  | Overview dissolution       | ⬜     | —      |                                                                                        |
| F9  | Chat reachability sweep    | ⬜     | —      |                                                                                        |
| F10 | Old shell deletion         | ⬜     | —      |                                                                                        |

## Migration ledger — per route

`native` = lives inside Chat UI · `immersive` = rewritten full page Chat links to ·
`hud` = still old chrome · `deleted` = gone.

| Route                                                    | Target                        | State              |
| -------------------------------------------------------- | ----------------------------- | ------------------ |
| `/chat`                                                  | native                        | ✅ native          |
| `/settings`                                              | immersive                     | hud                |
| `/archiv`                                                | immersive                     | does not exist yet |
| `/runs`                                                  | deleted (→ `/archiv`)         | hud                |
| `/overview`                                              | deleted (→ topbar + briefing) | hud                |
| `/skills`, `/skills/[id]`                                | immersive                     | hud                |
| `/commands`, `/commands/[id]`                            | immersive                     | hud                |
| `/mcp`, `/mcp/[id]`                                      | immersive                     | hud                |
| `/hooks`, `/hooks/[id]`                                  | immersive                     | hud                |
| `/agents`, `/agents/[id]`                                | immersive                     | hud                |
| `/automations`, `/automations/[id]`                      | immersive                     | hud                |
| `/pipelines`, `/pipelines/[id]`                          | immersive                     | hud                |
| `/chains`, `/chains/[id]`                                | immersive                     | hud                |
| `/projects`, `/[id]`, `/new`, `/[id]/integrations/[iid]` | immersive                     | hud                |
| `/companies`, `/[id]`, `/new`                            | immersive                     | hud                |
| `/memory`                                                | immersive                     | hud                |
| `/gates`                                                 | immersive                     | hud                |

## Session log

- **2026-07-19** — Arc opened. Audit `docs/web/hud-to-chat-migration-gap.md` read; design
  corpus and current chrome grounded by two Explore agents; operator answered the four
  strategic questions (O1–O4). Branch created, control docs written. F0 dispatched.

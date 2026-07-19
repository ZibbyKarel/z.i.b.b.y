# HUD → Chat UI migration — progress board

Live truth. Updated after every phase, immediately.

**Branch:** `feat/hud-to-chat-migration` (off `main` @ 32ce9b9e) · **Parked at PR gate** —
nothing pushed.

| #   | Phase                      | Status | Commit   | Notes                                                                                  |
| --- | -------------------------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| —   | Grounding + control docs   | ✅     | —        | audit read, design corpus + current chrome grounded, operator decisions O1–O4 captured |
| F0  | Immersive shell foundation | ✅     | e683f0bf | `ImmersiveShell` (DS) + `ImmersivePage` (app) + `FULLSCREEN_ROUTES`; behaviour-neutral |
| F1  | Settings                   | 🔩     | —        | in flight                                                                              |
| F2  | Archive of tasks           | ⬜     | —        |                                                                                        |
| F3  | Catalogs A                 | ⬜     | —        |                                                                                        |
| F4  | Catalogs B                 | ⬜     | —        |                                                                                        |
| F5  | Orchestration              | ⬜     | —        |                                                                                        |
| F6  | Delivery entities          | ⬜     | —        |                                                                                        |
| F7  | Memory + gates             | ⬜     | —        |                                                                                        |
| F8  | Overview dissolution       | ⬜     | —        |                                                                                        |
| F9  | Chat reachability sweep    | ⬜     | —        |                                                                                        |
| F10 | Old shell deletion         | ⬜     | —        |                                                                                        |

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
  strategic questions (O1–O4). Branch created, control docs written.
- **2026-07-19** — F0 landed (`e683f0bf`). Review notes: subagent reimplemented `IconTile`'s
  accent-tile recipe by hand because `IconTile` hardcodes its testid with no override;
  backdrop reproduces `ChatScreen`'s radial vignette but deliberately not its scanline/grid
  ambience. Orchestrator fixed one real defect before commit: `Container grow` and
  `Spacer grow` sat side by side in the header, so a long title would truncate at half width
  while free space sat in the spacer — Spacer removed. D7–D9 recorded from the F1/F2
  grounding pass. F1 dispatched.

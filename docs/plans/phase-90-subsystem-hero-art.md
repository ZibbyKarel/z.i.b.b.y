# Phase 90 — Hero art for the seven faceless subsystems + Forge wiring

> Design doc: only Forge has hero art (`design/Z.I.B.B.Y/uploads/Forge.png` — orange-glowing
> mecha-boss with its 5-agent squad strip, "FORGE / DELIVERY PIPELINE ORCHESTRATION" label).
> The other seven (Puls, Sentinel, Maestro, Beacon, Scout, Herald, Loom) need art in the SAME
> established style — one visual family, not eight inventions. Colors remain PROVISIONAL
> (deferred item); art uses the phase-80 registry colors so a future palette decision means
> regenerating/regrading, not redesigning.

## 1 — Generation (image-generation skill, style-locked)

Use the installed image-generation skill (`imagegen-frontend-web` or the best-fitting
installed one — this phase is run by the ARCHITECT directly, not a code sub-agent, because it
is taste work). Study `Forge.png` first; per subsystem generate a hero matching: dark
backdrop, single mecha/guardian figure expressing the mandate, subsystem color as the glow,
name + mandate caption band, same framing/aspect as Forge. Mandate→figure direction:

- **Puls** – sensor/radar watcher (listening posture, waveform motifs)
- **Sentinel** – armored warden scanning outward (shield, threat-horizon)
- **Maestro** – conductor over release/ship motifs
- **Beacon** – signal tower / flare-bearer (urgent, upward light)
- **Scout** – ranger/pathfinder with survey optics
- **Herald** – envoy/speaker figure (outward-facing, message motifs)
- **Loom** – weaver over code-thread lattice

2–3 candidates per subsystem, pick one each; consistency across the eight beats individual
brilliance — regenerate outliers.

## 2 — Wiring

- Assets → `apps/web/public/subsystems/{id}.png` (all eight — COPY `Forge.png` from `design/`
  in as `forge.png`; optimize sizes to the ~130–140K ballpark of the existing agent avatars,
  resize/compress as needed).
- Phase-80 registry: `heroImage: "/subsystems/<id>.png"` for all eight.
- Drawer header (phase 84) already renders `heroImage` when present — verify the real images
  render with the color-band fallback removed for populated entries; keep the fallback code
  path (a registry entry with `heroImage: null` must still work).
- The avatar-schema constraint (root-relative or data URI only) applies — confirm paths pass.

## Tests / verification

- Registry test updated: all eight entries carry a `/subsystems/*.png` heroImage.
- Drawer header test: image branch renders (fixture with heroImage) + fallback branch still
  covered.
- `npx tsc -p` web + contracts, `npx eslint <touched>`, targeted `npx vitest run` — clean.
- Visual: screenshot the drawer header for 2–3 subsystems; eyeball the family consistency
  across all eight in one contact-sheet screenshot for the PR.

## Constraints

- Style family is LOCKED to Forge's reference; do not invent a new style per subsystem.
- Repo weight: PNGs compressed; no source/PSD-scale files into the repo.
- If generation quality can't reach family consistency for some subsystem, ship the ones that
  match and leave `heroImage: null` for the rest (fallback band exists) — note which, rather
  than shipping an off-family image.

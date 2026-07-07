# Chat cosmic scene (`features/chat/scene`)

The full-screen living interface behind ZIBBY's chat: a text-reactive orb in a
procedural deep-space nebula, ringed by a constellation of sub-agents that light up
when dispatched and dock while they work. It replaces the old flat `ChatOrb`/
`ChatOrbSphere` (a 264px 2D-ish orb) with one **vanilla three.js** scene.

Vanilla three (not react-three-fiber) is deliberate: a single `requestAnimationFrame`
loop drives two stacked renderers — the **background** (droppable to half framerate /
lower resolution) and the **orb** (always full quality) — which r3f's per-`<Canvas>`
loop can't express cleanly. React never touches three; it only pushes derived chat
state in and disposes on unmount.

## Layers

| Module | Role |
| --- | --- |
| `CosmicScene.tsx` | React shell. Mounts the controller (browser + WebGL only — jsdom/no-WebGL renders just the `data-mode` root), pushes props in, disposes on unmount, handles tab-visibility pause/resume, exposes `window.__cosmicScene` in dev. |
| `sceneController.ts` | Owns the renderers, camera, layers, and the one rAF loop. Eases everything toward its target each frame — nothing snaps. |
| `orbLayer.ts` | Wireframe icosahedron with simplex-noise vertex ripple + fresnel rim + additive glow shell. Reads a per-mode `OrbTarget`; applies the completion flash. |
| `backgroundLayer.ts` | Fullscreen nebula/stars/vignette shader + orb-tracking glow, plus the 3D node-web (~100 nodes in 7 category clusters + proximity lines + dust). Renders every other frame. |
| `constellationLayer.ts` | Orbiting sprite avatars + DOM label overlay (imperative, no per-frame React). Depth-fades behind the orb; flies docked avatars to their dock chip. |
| `ringsLayer.ts` | Helix rings that fade in during thinking/tool, drifting accent → cyan with travelling pulses. |
| `dispatchLayer.ts` | Transient dispatch beams (orb → avatar → back) + ring pulses at the orb and agent. |
| `dockLayer.ts` | DOM bar of the running/queued agents & pipelines only; caches chip screen positions for the fly-to. |
| `modeVisuals.ts` / `tokens.ts` / `glsl.ts` | Mode → visual target map; token/category-colour resolution; shared simplex noise. |
| `constellation.ts` / `dock.ts` | Pure builders: dedupe the live agent catalog → roster; live runs feed → dock items. |

## Driven entirely by real chat plumbing (no audio)

Everything reacts to conversation activity, not voice. `ChatScreen` derives the state
and feeds the scene:

- **Mode** (`idle`/`listening`/`thinking`/`streaming`/`tool`/`waiting-approval`/`error`)
  from `useChatStream` events + composer draft + last-run status (unchanged derivation).
- **Streaming energy** — the token-cadence signal: `streamChars` diffs feed
  `pushActivity`, smoothed asymmetrically (fast attack, slow decay) inside the loop,
  driving surface displacement, the size pulse and glow. The direct substitute for the
  reference design's audio loudness.
- **Completion flash** — `completedTick` bumps on the stream's `onComplete`; a brief
  `--color-ok` pulse on the orb, glow shell and background pool.
- **Dispatch** — a `tool` event naming an agent bumps `dispatch.seq`; the scene fires a
  beam to that avatar (coloured by its category) with a flare and rings.
- **Dock / working** — `useRunsQuery` (kept fresh by `RunEventsProvider`) → the dock's
  running/queued items; agents with a live run pulse and fly to their dock slot.

## Colours

Uses ZIBBY's existing semantic tokens — `--color-accent` (idle/thinking),
`--color-run` (streaming), `--color-ok` (completion flash), `--color-bad` (error) — and
one hue per real agent category (`_categories.json`) shared by the constellation and the
background node-web. No new brand colour.

## Performance & accessibility

- Background renders every other frame; lower pixel ratio on low-power devices (mobile
  or ≤4 cores). Orb always full quality.
- Reduced motion: sub-agents held at their start positions, camera drift and ring/orb
  churn calmed.
- Loop pauses when the tab is hidden or `/chat` unmounts (phase 23: a routed page
  inside the dashboard shell, not a fullscreen overlay); all GPU resources disposed
  on unmount. The constellation hides on small mobile.

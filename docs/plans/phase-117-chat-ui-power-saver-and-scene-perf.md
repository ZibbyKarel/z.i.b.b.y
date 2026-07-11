# Phase 117 — Chat-UI power-saver toggle + scene performance

## Motivation

Opening `/chat` spins the machine's fan up. Root cause (verified in code):

- The CosmicScene runs an **unconditional `requestAnimationFrame` loop with two
  `WebGLRenderer`s** any time `/chat` is mounted and the tab is foregrounded
  (`sceneController.ts:582-653`). The orb renderer draws **every frame at full quality**
  (`antialias: true`, `sceneController.ts:258,639`) regardless of idle vs. active `mode`.
- The single most expensive draw is the **full-screen background shader**
  (`backgroundLayer.ts`): a full-viewport plane whose fragment shader runs a **5-octave
  `fbm()`** (`backgroundLayer.ts:66-75`) **twice per pixel** (`n1`, `n2`,
  `backgroundLayer.ts:144-145`) plus two star layers, at DPR up to 1.5, ~30fps forever.
- The **only** pause trigger is `visibilitychange` (`CosmicScene.tsx:118`). There is no
  idle throttle, no pause on window-blur, and no pause when the scene is scrolled
  off-screen / occluded. `prefers-reduced-motion` dampens motion but does **not** reduce
  the render cadence.

Two tracks:

- **Always-on perf** (variants 1–3): make the scene stop burning GPU when nothing is
  happening and cut the background's per-pixel cost. No user opt-in — pure wins.
- **Power-saver toggle** (variants 4–6): a new **Settings → Chat UI → „Úsporný mód"**
  switch that trades visual fidelity for a hard floor on GPU usage — 30fps cap,
  antialias off, and the scene freezes to a static frame once the intro finishes.

---

## Scope map (variant → sub-phase)

| Variant | What | Sub-phase | Gated by |
|---|---|---|---|
| 4 | FPS cap 30 + orb `antialias: false` | 117b | `powerSaver` |
| 5 | Freeze to a static frame after intro (like reduced-motion, but stops the loop) | 117b | `powerSaver` |
| 6 | Settings → Chat UI section + `powerSaver` toggle | 117a | — (is the toggle) |
| 1 | Idle demand-render — drop cadence / stop redrawing when the scene is at rest | 117c | always |
| 2 | Pause on window-blur + `IntersectionObserver` off-screen | 117d | always |
| 3 | Cheaper background: half-res render target, `fbm` once, 5→3 octaves | 117e | always |

Implementation order: **117a → 117b → 117c → 117d → 117e**. 117a+117b are the toggle
end-to-end; 117c/d/e are independent always-on perf and can each land as its own commit.

---

## 117a — Settings „Chat UI" section + `powerSaver` on SystemConfig

Reuse the existing `system` config resource (file-backed, files-as-source-of-truth); no
new contract/endpoint. Mirror the `goalAutoResume` boolean end-to-end and the
instant-apply mutate pattern of `ChatSection.tsx` (no Save button).

**Contract** — `libs/contracts/src/system/system.schema.ts`
- Add to `SystemConfigSchema` (`.strict()`): `powerSaver: z.boolean().default(false),`.
  No change to `system.contract.ts` (reuses `getConfig` / `putConfig`).

**Web — new settings section** — `apps/web/features/settings/components/ChatUiSection.tsx`
- New component (distinct from the existing persona `ChatSection.tsx` — the tab value is
  `chatUi`, not `chat`). Consumes `useSystemConfigQuery()` +
  `useSetSystemConfigMutation()` from `apps/web/features/system` (same as `ChatSection`).
- Render one `ToggleField` (from `@zibby/design-system`): `label={t("chatUi.powerSaver")}`,
  `hint={t("chatUi.powerSaverHint")}`, `checked={config.powerSaver ?? false}`,
  `onChange={(next) => setConfig.mutate({ body: { ...config, powerSaver: next } })}`.
- Add a `ChatUiSectionTestId` enum (`Root`, `PowerSaverToggle`) and wire `data-testid`.

**Web — wire the tab** — `apps/web/features/settings/Screen.tsx`
- Import `ChatUiSection`; add `<Tab value="chatUi">{t("chatUi.title")}</Tab>` to the
  `<TabList>` and a matching `<TabPanel value="chatUi"><ChatUiSection /></TabPanel>` next
  to the existing `chat` persona panel.

**i18n** — `apps/web/i18n/messages/{cs,en}.json`
- Add a `chatUi` sub-block under `settings`, parallel to `chat`:

| key | CS | EN |
|---|---|---|
| `chatUi.title` | Chat UI | Chat UI |
| `chatUi.hint` | Vzhled a výkon 3D scény v chatu. | Look and performance of the chat 3D scene. |
| `chatUi.powerSaver` | Úsporný mód | Power-saver mode |
| `chatUi.powerSaverHint` | Omezí 3D scénu (30 fps, bez vyhlazení, po úvodní animaci se zastaví) — méně zatíží grafiku a větrák. | Caps the 3D scene (30 fps, no antialiasing, freezes after the intro) — easier on the GPU and fan. |

**Tests** — `ChatUiSection.test.tsx`: renders the toggle (select via testid), toggling
calls the mutation with `powerSaver: true` merged onto the existing config.

**Verify:** `pnpm check:types && pnpm check:lint && pnpm web:test && pnpm api:test`
(system config schema round-trips; settings suite green).

---

## 117b — Wire `powerSaver` into the scene (variants 4 + 5)

Flow the flag the same way `reducedMotion` flows, but it comes from the persisted config,
not a media query.

**Read it** — `apps/web/features/chat/scene/CosmicScene.tsx`
- `const { data: systemConfig } = useSystemConfigQuery();`
  `const powerSaver = systemConfig?.powerSaver ?? false;`
- **Antialias caveat:** `antialias` is fixed at `WebGLRenderer` construction and cannot be
  toggled live. Give `<CosmicScene>` a React `key` that includes `powerSaver` (or key the
  wrapper in `ChatScreen.tsx`) so flipping the toggle fully remounts the scene and rebuilds
  the orb renderer with the correct flag. Toggling is a rare, explicit user action —
  remount cost is acceptable and avoids renderer dispose/recreate plumbing.
- Pass `powerSaver` into `createSceneController(container, { mode, dock, reducedMotion,
  powerSaver })` and into the live `setInputs({ ..., powerSaver })` push (lines ~106,141).

**Type** — `apps/web/features/chat/scene/sceneTypes.ts`
- Extend `SceneInputs` with `powerSaver: boolean`.

**Controller** — `apps/web/features/chat/scene/sceneController.ts`
- **Variant 4a (antialias):** at renderer construction (`:258`) use
  `antialias: !initialInputs.powerSaver`. (This is why remount-on-toggle is required.)
- **Variant 4b (FPS cap 30):** in `frame()` gate the render+update work behind a
  wall-clock accumulator when `inputs.powerSaver` — target ~33ms/frame. Keep scheduling
  `requestAnimationFrame` every tick, but skip the update/render body until ≥ the interval
  has elapsed (accumulate `dt`; this preserves the existing background half-rate as a
  further /2). Non-power-saver path unchanged (full rate).
- **Variant 5 (freeze after intro):** when `inputs.powerSaver`, after the one-shot mitosis
  entry finishes (`finishEntry`) and `energy`/`flash` have decayed to ~0 and no particle is
  in flight, **stop scheduling new frames** (let `frame()` return without re-arming `rafId`
  and set an `idle` flag). Re-arm the loop from `pushActivity` / `flashComplete` /
  `setInputs` (mode change) — i.e. only redraw when something actually changes. Under
  power-saver the resting scene draws **zero** frames. (This is the power-saver-specific,
  hard version of variant 1.)

**Tests** — controller/scene unit tests: with `powerSaver: true`, assert the loop parks
(no further RAF) once at rest, and re-arms on `pushActivity`. Assert `antialias:false` is
requested when `powerSaver` at construction (mock `WebGLRenderer`).

**Verify:** `pnpm check:types && pnpm web:test`; manual — toggle in Settings, confirm
`/chat` scene visibly freezes at rest and the fan settles (see WebGL-screenshot memory for
how to eyeball the scene under swiftshader).

---

## 117c — Idle demand-render (variant 1, always-on)

The non-power-saver counterpart to 117b's freeze: don't fully stop, but stop **redrawing**
when the scene is genuinely at rest.

- In `sceneController.ts`, track a `dirty`/`atRest` state: the scene is at rest when
  `mode` is idle, `energy≈0`, `flash≈0`, no particle in flight, camera-drift disabled
  (reduced motion) **or** — since drift is a continuous animation — when drift is active,
  cap the resting cadence to ~10fps instead of full rate rather than stopping.
- Concretely: keep the RAF alive, but when `atRest && !reducedMotion` render at a reduced
  interval (~10fps); when `atRest && reducedMotion` (no drift) stop redrawing entirely and
  re-arm on the same triggers as 117b. Any activity restores full rate.
- Factor the "should we draw this tick" decision into one helper shared with 117b's
  power-saver cap so the two don't fight.

**Verify:** `pnpm check:types && pnpm web:test`; manual — idle `/chat` for ~10s, confirm
GPU/fan drop while the scene still looks alive on the first interaction.

---

## 117d — Pause on blur + off-screen (variant 2, always-on)

**`apps/web/features/chat/scene/CosmicScene.tsx`**
- Add `window` `blur`/`focus` listeners alongside the existing `visibilitychange` handler
  (`:118`) → `pause()` / `resume()`. Guard against double-pause/resume (idempotent).
- Add an `IntersectionObserver` on the scene container: `pause()` when the canvas leaves
  the viewport, `resume()` when it re-enters (threshold ~0). Dispose the observer on
  unmount alongside the controller.
- All three signals (`hidden` tab, blurred window, off-screen) collapse into one derived
  "should the loop run" — track them as a small set/bitmask so resume only fires when
  **all** clear.

**Verify:** `pnpm check:types && pnpm web:test`; manual — scroll the scene out of view /
click another window, confirm the loop parks and resumes cleanly (no time-jump — `resume()`
already drops the accumulated `clock` gap).

---

## 117e — Cheaper background shader (variant 3, always-on)

**`apps/web/features/chat/scene/backgroundLayer.ts`**
- **Half-res render target:** render the full-screen nebula/star plane into a
  `THREE.WebGLRenderTarget` at ~0.5× the canvas resolution, then blit/upscale it to the
  screen. The background is a slow drift — half-res is visually indistinguishable and
  quarters the fragment work. (Keep the existing DPR caps as an outer bound.)
- **`fbm` once, not twice:** collapse the two `fbm()` calls (`n1`, `n2`,
  `backgroundLayer.ts:144-145`) into a single evaluation reused for both terms (or one
  cheaper combination) — verify the look holds.
- **Octaves 5 → 3:** reduce the `fbm` loop (`backgroundLayer.ts:69`) from 5 to 3 octaves;
  the highest octaves are barely visible on a drifting nebula.
- Keep the existing `lowPower` path (mobile / ≤4 cores) capping resolution further.

**Verify:** `pnpm check:types && pnpm web:test`; manual — compare the background before/after
(the WebGL scene renders non-deterministically under swiftshader — eyeball for gross
regressions, not pixel-equality).

---

## Non-goals / notes

- No change to the SSE/event plumbing — it isn't the load source.
- The unused `@react-three/fiber` dependency is out of scope (separate cleanup).
- `powerSaver` is persisted per-operator (system config), unlike `reducedMotion` (an OS
  media query) — the two are OR-able inside the controller if power-saver should imply
  reduced-motion damping, but 117b keeps them distinct so power-saver can be stricter
  (full freeze) than reduced-motion.

BATCH: web-chat-scene

[SEVERITY: High] [FILE: apps/web/features/chat/scene/sceneController.ts:253] [CATEGORY: file-size/single-responsibility]
`createSceneController` is a single ~745-line closure (lines 253–997, file total 1006) that owns renderer/camera setup, mini-orb construction, net-geometry buffer building, the mitosis entry animation (collapse/apply/finish), projection plumbing, resize, the frame-budget/throttle decision, the RAF loop, and the returned public API — far too much in one function to navigate or test in isolation.
Doporučení: Extract cohesive builders (`buildNet`, `createMiniOrbs`, `createEntryAnimation`, `createProjector`) into sibling modules and have the controller compose them.

[SEVERITY: High] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:128] [CATEGORY: business-logic-in-component]
The mount effect (~105 lines) inlines heavy imperative side-effect logic: the three-source visibility gate (visibility/blur/focus), an IntersectionObserver, the dynamic `import()` + controller lifecycle, dev-only `window` exposure, and full teardown — all in the component body behind an `exhaustive-deps` disable.
Doporučení: Move it into a dedicated `useCosmicSceneController` hook so the component stays a thin shell and the lifecycle logic is independently testable.

[SEVERITY: Medium] [FILE: apps/web/features/chat/scene/backgroundLayer.ts:259] [CATEGORY: file-size/single-responsibility]
`createBackgroundLayer` (501-line file) mixes two large GLSL shader strings, the half-res render-target/upscale pass, and full construction of the node-web/proximity-lines/dust geometry in one function.
Doporučení: Split the node-web (pass 2) construction into its own builder and consider moving the sky/upscale shaders alongside `glsl.ts`.

[SEVERITY: Medium] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:242] [CATEGORY: duplication/missing-hook]
The prev-value diffing for `streamChars` (prevChars ref) and `completedTick` (prevTick ref) is two near-identical inline effects computing a delta against a ref.
Doporučení: Extract a small `usePreviousDelta`/`useIncrementCallback` hook and reuse for both signals.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/dockLayer.ts:79] [CATEGORY: performance/cleanup]
`makeChip` (line 79) and `setItems` (line 101) schedule `requestAnimationFrame` callbacks whose ids are never stored or cancelled; on `dispose()` a pending rAF still fires (`this.measure()` runs `getBoundingClientRect` after the map is cleared, fade-in writes style on a detached node). Harmless today but an uncancelled-rAF pattern.
Doporučení: Track the rAF id and `cancelAnimationFrame` it in `dispose`.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/tokens.ts:89] [CATEGORY: duplication]
The "read a CSS var via `getComputedStyle` once, then cache in a module-level `let x = null`" pattern is duplicated three times (`resolveSceneTokens`, `resolvePipelineAccentHex`, `resolveForegroundFaintHex`), each with its own cache var and test-reset seam.
Doporučení: Factor a `memoizedCssVar(name, fallback)` helper and derive the three resolvers from it.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/orbLayer.ts:218] [CATEGORY: performance]
`update()` calls `resolveSceneTokens()` on every frame for every orb (central + 8 minis ≈ 9 calls/frame); it is cached so cost is trivial, but the resolved token record could be captured once at factory time since it never changes for a given mount.
Doporučení: Resolve tokens once in `createOrbLayer` and close over the result instead of re-fetching per frame.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx:133] [CATEGORY: performance/memoization]
The `ordered` roster (`filter` + `sort`) is recomputed on every React render, and the per-node `ref` callbacks (lines 163, 192) are fresh closures each render, forcing React to run ref detach/attach cycles. Negligible at 8 nodes, but avoidable.
Doporučení: `useMemo` the `ordered` array and hoist stable ref-setter callbacks (or use a `useCallback`-keyed map).

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx:111] [CATEGORY: correctness/edge-case]
The label/badge fade-in effect only re-runs on `reducedMotion` change; subsystems added to the feed after mount get no `opacity: 0` seed and skip the delayed fade (they pop in at full opacity), and their new `fadeRefs` entries are never initialised.
Doporučení: Seed opacity per-node on mount (e.g. inline initial style or an effect keyed on the node set) rather than a one-shot list-wide effect.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:180] [CATEGORY: typing]
`window` is reached via `window as unknown as { __cosmicScene?: SceneController }` at three sites (180, 226) and similar `as unknown as {...}` feature-detect casts appear in `canMountWebGL.ts:20-23`.
Doporučení: Declare a typed `global`/`Window` augmentation for `__cosmicScene` and the WebGL globals so the casts disappear.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/ringsLayer.ts:89] [CATEGORY: duplication]
The exponential damping easing `x += (target - x) * (1 - Math.exp(-dt * RATE))` is reimplemented inline here, in `orbLayer.ts` (`damp`, line 141), and as `glowColor.lerp(..., 1 - Math.exp(-dt*4))` in `backgroundLayer.ts:445`.
Doporučení: Share a single `damp(current, target, dt, rate)` util across the layers.

STATS:
- Source files analyzed: 16 (3980 lines); plus 6 test files (1306 lines) reviewed for coverage only. 23 files total in batch.
- Top 3 largest source files: sceneController.ts (1006), backgroundLayer.ts (501), CosmicScene.tsx (320).
- Overall: mature, exceptionally well-documented WebGL code with disciplined RAF/geometry/material disposal (`dispose()` is thorough — no real memory leaks found) and strong throttle/park test coverage. Main debt is concentration of logic in two oversized units (`sceneController.ts` factory, `CosmicScene.tsx` mount effect); remaining items are minor perf/duplication polish.

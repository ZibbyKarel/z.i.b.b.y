# The living-state contract

> _One state vocabulary, one living-glow primitive — shared by the HUD and the Chat-UI._

CLAUDE.md makes it a law: **"HUD and Chat-UI share one visual language."** This
document is where that law is cashed out for _state_ — "is this thing alive, and in
what state?" — so no surface ever invents a third parallel system for it.

There are two halves:

1. **The vocabulary** — one canonical `StateTone`. (static half)
2. **The motion** — one `LivingGlow` primitive. (animated half)

Everything below resolves from these two. If you are building a new "this is live
and in state X" component, you use them — you do **not** add a fourth colour enum or
a second hand-rolled pulse.

---

## 1. The canonical state vocabulary — `StateTone`

Defined once in `libs/design-system/src/stateTone.ts`, exported from
`@zibby/design-system`. ZibbyCorp (ZA-01) redefines it to the six states an agent's
work can be in, in canonical order:

```ts
export type StateTone = "working" | "thinking" | "blocked" | "error" | "done" | "idle";
export const STATE_ORDER: readonly StateTone[]; // working → thinking → blocked → error → done → idle
```

| tone       | means                                    | `--color-*`           |
| ---------- | ---------------------------------------- | --------------------- |
| `working`  | in-flight work, streaming                | `--color-state-work`  |
| `thinking` | reasoning, no tool call yet              | `--color-state-think` |
| `blocked`  | needs you — attention, awaiting approval | `--color-state-block` |
| `error`    | error, danger, parked-on-failure         | `--color-state-err`   |
| `done`     | success, healthy, handed off             | `--color-state-done`  |
| `idle`     | no activity, listening for new work      | `--color-state-idle`  |

Color is the _only_ hue in the system (DS.md §1/§2.2): it goes on dots, glyphs, pods,
progress fills and flow packets — never on whole-card backgrounds or borders of text.

### The legacy vocabulary — `LegacyStateTone` / `LEGACY_TONE_MAP`

The pre-ZibbyCorp five-tone vocabulary is kept as `LegacyStateTone`, and every DS
component that used to be typed `StateTone` at its public boundary now accepts
`AnyStateTone = StateTone | LegacyStateTone` instead — so the many app call sites that
still emit the old names (`features/runs/run.ts#runStateTone`, the approvals `UiTone`,
…) keep compiling until Part B rewrites them onto the new vocabulary directly.

```ts
export const LEGACY_TONE_MAP: Record<LegacyStateTone, StateTone> = {
  accent: "thinking",
  ok: "done",
  warn: "blocked",
  bad: "error",
  run: "working",
};
```

`normalizeStateTone(tone: AnyStateTone): StateTone` is the one place every such
component boundary (`Card`, `LivingGlow`, `Stat`, `StatusDot`, `Tag`) resolves through
before touching a Tailwind class or CSS var — there is no second copy of this map, and
no component re-derives it locally. `normalizeToneLike` is the loose sibling for the
DS "superset" tone unions (`TagTone`, `StatTone`, `DotTone`) that add their own extras
(`neutral`, `wait`, a `RiskKind`) on top of the tone vocabulary.

The **legacy CSS vars** (`--color-accent`, `--color-ok`, `--color-warn`, `--color-bad`,
`--color-run`) are not deleted — they repoint to the new state colors via the exact
same table (`--color-accent: var(--color-state-think)`, …), so every existing
Tailwind-class-driven surface (`bg-accent`, `border-run`, `shadow-glow-accent`, …)
automatically repaints in the ZibbyCorp palette without a class name changing.

Companion exports (all from `stateTone.ts`):

- `STATE_ORDER` — canonical iteration order (`STATE_TONES` is a deprecated alias).
- `stateToneVar[tone]` → the `var(--color-state-…)` string (for CSS/`style`) — used by
  `LivingGlow`, `AgentGlyph`, `StatePill`, `CellStrip`.
- `stateToneHex[tone]` → hex fallback mirroring `globals.css`.
- `resolveStateToneHex(tone)` → the **one** DOM-reading, cached hex resolver for
  non-CSS consumers (a WebGL uniform, a canvas). Accepts `AnyStateTone`. The Chat-UI
  orb uses this — it does **not** keep its own hex table.

### Consumers of the vocabulary (no private palettes)

| Surface                                             | Type                                                     | Note                                                                 |
| --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `Card.tone` / `Card.edge` / `Corners`/`CornersTone` | `AnyStateTone`                                           | the border + corner tint + left-edge bar                             |
| `AgentGlyph` / `StatePill` / `CellStrip`            | `StateTone`                                              | ZA-03 — the new canonical-only components, no legacy vocabulary      |
| approvals `UiTone`                                  | `Exclude<LegacyStateTone, "run">`                        | unchanged by ZA-01; Part B rewrites it onto the canonical vocabulary |
| chat `SceneColorToken`                              | `Extract<LegacyStateTone, "accent"\|"run"\|"ok"\|"bad">` | the orb has no `warn` state; unchanged by ZA-01                      |

`TagTone`, `StatTone` and `DotTone` are DS-owned _supersets/aliases_ of `AnyStateTone`
(`Tag` adds the risk categories `payment/deletion/push/send`; `Stat` adds `neutral`;
`StatusDot` adds `wait`). They are the same tone vocabulary plus their surface-specific
extras — not competing vocabularies.

### Rich state → canonical tone

Richer state machines map **down** onto the vocabulary. The mapping lives in code next
to each machine and reads the same way everywhere; `run.ts#runStateTone` and the chat
`SceneMode` mapping still emit the **legacy** names (`run.ts`'s own `StateTone` import
was renamed to `LegacyStateTone` in ZA-01 — see the plan) until Part B moves them onto
`working`/`thinking`/`blocked`/`error`/`done`/`idle` directly.

---

## 2. Where state is **static** vs **animated**

The same tone shows up two ways. Pick by whether the thing is _genuinely in flight_.

| Static (matte) — "it is in state X"            | Animated (living) — "it is actively X, right now"                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `Card`/`Corners` tone border + `toneGlow` ring | `Card living` / `HudPanel live` → `LivingGlow`                                  |
| `Tag` tone                                     | `StatusDot pulse` (glow + `animate-live`)                                       |
| `StatusDot` (no `pulse`)                       | the Chat-UI orb (`CosmicScene`)                                                 |
| `StatePill` (ZA-03)                            | `AgentGlyph`'s per-state motion (ZA-03 — working bobs+types, blocked shakes, …) |

**Rule of thumb:** matte by default. Reserve the animated form for running /
awaiting / streaming / erroring — motion is expensive attention in a quiet control
room, so spend it only on the live thing. In the dark theme, live status additionally
gets a `--gw` glow (`8px` dark, `0px` light — nothing glows in light, DS.md §2.3).

---

## 3. The animated primitive — `LivingGlow`

`libs/design-system/src/components/LivingGlow/LivingGlow.tsx`, exported from
`@zibby/design-system`.

```tsx
<div className="relative …">
  <LivingGlow tone="working" intensity="hot" />
  {/* content */}
</div>
```

- `tone: AnyStateTone` — sets `--living-color: stateToneVar[normalizeStateTone(tone)]`.
- `intensity: "idle" | "hot"` — the ambient vs energized pulse, mapped onto the
  `v-glow-idle` / `v-glow-hot` keyframes.
- `breathe` — add the `v-breath` scale/opacity for a free-standing orb-like glow.
- Renders `absolute inset-0` into its nearest positioned ancestor, is `aria-hidden`,
  and honours `prefers-reduced-motion`.

The `v-glow-idle` / `v-glow-hot` keyframes in `globals.css` are **tone-parametrized**
via `--living-color` (defaulting to accent, so any bare `animate-[v-glow-*]` caller is
unchanged). That default is why the same three keyframes serve both the accent-only
legacy callers and every toned `LivingGlow`.

---

## 4. The glyph family — `AgentGlyph` (ZA-03)

`libs/design-system/src/components/AgentGlyph/AgentGlyph.tsx` is a deterministic,
seeded 12×12 pixel sprite (ported from `design/ZibbyCorp/zibby.js`), tinted by
`stateToneVar` and animated per state with the `zb-*` keyframe family (DS.md §9):
`zb-bob`/`zb-key` (working), `zb-breathe` (idle/thinking), `zb-shake` (error),
`zb-hop` (done), `zb-blink` (idle/working/thinking eyes). All of it is wrapped in
`@media (prefers-reduced-motion: no-preference)` in `globals.css`, so a reduced-motion
user gets a static glyph for free (an `animation-name` with no matching `@keyframes`
is a no-op) — no per-call-site `motion-reduce:` variant needed.

---

## The one rule

> **Every new "is this alive and in what state" surface uses `StateTone` +
> `LivingGlow` (or `AgentGlyph`/`StatePill`/`CellStrip` for the agent-facing ones). It
> does not declare a seventh colour, a second hex table, or a hand-rolled pulse.**

If the six tones genuinely don't fit, that's a design-system conversation (extend
`StateTone`), not a local enum in one component.

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
`@zibby/design-system`:

```ts
export type StateTone = "accent" | "ok" | "warn" | "bad" | "run";
```

| tone     | means                                   | `--color-*` |
| -------- | --------------------------------------- | ----------- |
| `accent` | neutral / interactive / dormant-live    | `--color-accent` |
| `ok`     | success, done, healthy                  | `--color-ok`     |
| `warn`   | attention, awaiting approval, held      | `--color-warn`   |
| `bad`    | error, danger, parked-on-failure        | `--color-bad`    |
| `run`    | in-flight work, streaming               | `--color-run`    |

Companion exports (all from `stateTone.ts`):

- `STATE_TONES` — canonical iteration order.
- `stateToneVar[tone]` → the `var(--color-…)` string (for CSS/`style`).
- `stateToneHex[tone]` → hex fallback mirroring `globals.css`.
- `resolveStateToneHex(tone)` → the **one** DOM-reading, cached hex resolver for
  non-CSS consumers (a WebGL uniform, a canvas). The Chat-UI orb uses this — it does
  **not** keep its own hex table.

### Consumers of the vocabulary (no private palettes)

| Surface | Type | Note |
| ------- | ---- | ---- |
| `Card.tone` / `Corners`/`CornersTone` | `StateTone` | the border + corner tint |
| approvals `UiTone` | `Exclude<StateTone, "run">` | `run` collapses to `accent` in these surfaces |
| chat `SceneColorToken` | `Extract<StateTone, "accent"\|"run"\|"ok"\|"bad">` | the orb has no `warn` state |

`TagTone` and `DotTone` are DS-owned _supersets/aliases_ of this palette (`Tag` adds
the risk categories `payment/deletion/push/send`; `StatusDot` renames `warn→wait` and
adds `idle`). They are the same five state colours plus their surface-specific extras —
not competing vocabularies.

### Rich state → canonical tone

Richer state machines map **down** onto the five. The mapping lives in code next to
each machine and reads the same way everywhere:

| Rich state (source) | → `StateTone` |
| --- | --- |
| chat `SceneMode`: `idle` / `listening` / `thinking` / `tool` | `accent` |
| chat `SceneMode`: `streaming` | `run` |
| chat `SceneMode`: `waiting-approval` / `error` | `bad` |
| run `FeedStatus`: `running` / `pending` | `run` |
| run `FeedStatus`: `awaiting-approval` / `parked` / `held` | `warn` |
| run `FeedStatus`: `done` | `ok` |
| run `FeedStatus`: `error` | `bad` |
| risk severity: `low` / `medium` / `high` | `ok` / `warn` / `bad` |

(Chat's header `StatusDot` maps `SceneMode` → `DotTone` in `ChatScreen.tsx#MODE_DOT`;
runs map `FeedStatus` → tone in `features/runs/run.ts#RUN_STATE`.)

---

## 2. Where state is **static** vs **animated**

The same tone shows up two ways. Pick by whether the thing is _genuinely in flight_.

| Static (matte) — "it is in state X" | Animated (living) — "it is actively X, right now" |
| --- | --- |
| `Card`/`Corners` tone border + `toneGlow` ring | `Card living` / `HudPanel live` → `LivingGlow` |
| `Tag` tone | `StatusDot pulse` (glow + `animate-live`) |
| `StatusDot` (no `pulse`) | the Chat-UI orb (`CosmicScene`) |
| `SeverityMeter` segments | `LivingGlow` (standalone) |

**Rule of thumb:** matte by default. Reserve the animated form for running /
awaiting / streaming / erroring — motion is expensive attention in a quiet control
room, so spend it only on the live thing.

---

## 3. The animated primitive — `LivingGlow`

`libs/design-system/src/components/LivingGlow/LivingGlow.tsx`, exported from
`@zibby/design-system`.

```tsx
<div className="relative …">
  <LivingGlow tone="run" intensity="hot" />
  {/* content */}
</div>
```

- `tone: StateTone` — sets `--living-color: var(--color-<tone>)`.
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

## The one rule

> **Every new "is this alive and in what state" surface uses `StateTone` +
> `LivingGlow`. It does not declare a sixth colour, a second hex table, or a
> hand-rolled pulse.**

If the five tones genuinely don't fit, that's a design-system conversation (extend
`StateTone`), not a local enum in one component.

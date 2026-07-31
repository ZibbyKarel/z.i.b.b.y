# Measured property whitelist

`getComputedStyle` exposes ~340 properties. Measuring all of them buries the real
delta in noise (every inherited default shows up as a "difference" the moment one
node's structure shifts). The whitelist in `.claude/skills/design-match/scripts/extract.mjs`
(`VALUE_PROPS`) is deliberately narrow — **51 properties**, confirmed by counting
the array — across six groups:

| Group     | Properties                                                                                                                                                                                     | Why                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Box       | `display`, `position`, `boxSizing`, `width`/`height` + min/max                                                                                                                                 | the frame everything else sits in                                                      |
| Spacing   | `margin*`, `padding*`, `gap`, `rowGap`, `columnGap`                                                                                                                                            | the single most common source of "nearly right"                                        |
| Flex/Grid | `flexDirection`, `flexWrap`, `alignItems`, `justifyContent`, `flexGrow`, `flexShrink`, `flexBasis`, `gridTemplateColumns`, `gridTemplateRows`                                                  | duplicated in the skeleton on purpose — the skeleton has the mode, this has the detail |
| Type      | `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textTransform`, `textAlign`                                                                                            | where 14 vs 16 px hides                                                                |
| Paint     | `color`, `backgroundColor`, `backgroundImage`, `borderTopWidth`/`borderRightWidth`/`borderBottomWidth`/`borderLeftWidth`, `borderColor`, `borderStyle`, `borderRadius`, `boxShadow`, `opacity` | what token mapping consumes                                                            |
| Effects   | `transform`, `backdropFilter`, `mixBlendMode`                                                                                                                                                  | ZIBBY's glass surfaces live here                                                       |

Not every measured property is tokenisable: `tokens.mjs`'s `TOKEN_PROPS` (the
subset `tokens.md` actually reports mappings for) only covers `color`,
`backgroundColor`, `borderColor`, `gap`, `rowGap`, `columnGap`, `paddingTop`,
`paddingLeft`, `borderRadius`, `boxShadow`, `fontSize`, `lineHeight`,
`letterSpacing` — a `display: flex` delta, for instance, is a real value
comparison in `values.md` but will never produce a `tokens.md` row, because
there is no token family for it. `tokens.md` itself is a **design-side
inventory**, built once from `spec.skeleton` at `measure` time against the
app's theme CSS — not a design-vs-app delta the way `values.md` is. It lists
every tokenisable design value (one row per distinct `prop`/value pair,
including ones that map exactly onto an existing token), not only the
unmatched ones — reviewing it means checking which rows already have a home
and which propose a new token, not scanning for "differences".

## `fontFamily` — measured as an exact string (open limitation)

`compareValues` compares every whitelisted property by strict string equality,
and `fontFamily` is the one where that has a standing cost. The font preflight
deliberately compares only the **first resolved family** and leaves the rest of
the stack to this layer (see `SKILL.md`, _Preflights_) — which is the right
home for it, because a delta here names the node it occurred on. But a declared
fallback order that differs from the design's is then a value delta on every
node, and any value delta keeps the round at `POKRAČUJ`. Against Storybook,
whose stack order genuinely differs from these mockups', a run therefore cannot
reach `HOTOVO` until the implementation's declared stack matches the design's.

This is recorded as open, not resolved: whether the value layer should
normalise `fontFamily` or whether the difference is a real thing the operator
must fix has not been decided.

## Adding a property

Add it only when a real run produced a visible difference that no listed property
explained. Note the case in the table above so the list stays justified rather
than accumulating.

## Deliberately excluded

- **Animation and transition timing** — the skill compares static frames
  (spec: out of scope).
- **Scroll and overflow state** — non-deterministic between runs.
- **Inherited text defaults** (`wordSpacing`, `fontKerning`, …) — noise.

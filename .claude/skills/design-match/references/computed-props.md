# Measured property whitelist

`getComputedStyle` exposes ~340 properties. Measuring all of them buries the real
delta in noise (every inherited default shows up as a "difference" the moment one
node's structure shifts). The whitelist in `tools/design-match/extract.mjs`
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
there is no token family for it.

## Adding a property

Add it only when a real run produced a visible difference that no listed property
explained. Note the case in the table above so the list stays justified rather
than accumulating.

## Deliberately excluded

- **Animation and transition timing** — the skill compares static frames
  (spec: out of scope).
- **Scroll and overflow state** — non-deterministic between runs.
- **Inherited text defaults** (`wordSpacing`, `fontKerning`, …) — noise.

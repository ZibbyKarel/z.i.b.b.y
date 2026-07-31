# Skeleton rules

The skeleton is the structural fingerprint the blocking gate compares. It answers
"is this the same structure?", never "does it look the same".

## What is a structural node

A visible element (any non-zero box — `rect.width > 0 && rect.height > 0`, so
a sub-pixel node still counts — and not `display:none` / `visibility:hidden` /
`opacity:0`) up to depth 6 from the chosen region root. The visibility filter
only applies when collecting **children**; the region root itself is always
snapped, unconditionally — a `--selector` that happens to point at a hidden
root produces a one-node skeleton, not an error.

## Wrapper collapsing (default ON)

A node collapses into its parent when **all** of:

- it has exactly one child,
- its layout mode is `block` (it lays nothing out itself), and
- its box is within 1 px of its parent's box on all four sides.

The region **root** itself is never collapsed — only its descendants; collapsing
needs a parent box to compare against, and the root has none.

**Why:** implementations routinely add one presentational wrapper with no visual
effect. Failing the gate on it would make the gate cry wolf, and a gate people
route around is worse than none. A collapsed wrapper takes its own measured
values with it — the values layer (`values.md`) says plainly which nodes went
unmeasured this way.

**When to turn it off:** `--strict-wrappers`. Use it if a run shows that the extra
wrappers themselves are what is going wrong — for example a wrapper introducing a
stacking context or clipping. `measure` and `compare` must use the same setting
for a given slug, or the two trees collapse differently and the gate compares
trees that were never meant to line up.

## Layout mode

Collapsed from `display` + `flex-direction` into one of `grid`, `flex-row`,
`flex-column`, `block`, `inline`. `grid` additionally carries a column count
parsed from `grid-template-columns`.

**A layout-mode mismatch stops the walk at that node** — everything beneath is
being positioned by a different engine, so descending only produces noise. A
**grid column-count mismatch, by contrast, is reported but does not stop the
walk** — both sides are still in grid mode, so their children are still worth
pairing and comparing.

## Roles: `role` (readable) vs `matchRole` (compared)

Two different derivations exist, and only one of them decides the gate:

- **`role`** is the full derivation — tag first (`form`, `label`, `input`,
  `button`→`action`, …), then `role`/`data-role`, then class-name hints (`row`,
  `column`, `card`), then `text`/`group`. This is what **paths** are built from
  (`card/form[0]/row[1]`) — a path is for a human to find a node with, and only
  the design side ever builds one, so the two sides can never disagree about it.
- **`matchRole`** is narrower: only a tag or an explicit author declaration
  (`role`/`data-role`) counts. A class-name hint or the `text`/`group` fallback
  is **not** a structural commitment, so it collapses to the neutral `"node"`.
  This is what the **comparison itself** runs on.

This split is deliberate: it is what keeps the gate stable across differing
class-name conventions between the mockup and the implementation. A design
`div.row` (`role: "row"`, class hint) and an app `div.stack` (`role: "group"`,
no class hint matches) are both `matchRole: "node"` and pair without
complaint, even though their readable `role`s genuinely differ — the gate does
not care that the class names disagree. A design `<form>` rebuilt as a
`<section>` **is** caught, because `form` and `section` (→ `"node"`) are
genuinely different `matchRole`s, one tag-derived and one not.

The root's own `matchRole` is compared directly (`kind: "role"`); each level's
sibling `matchRole`s are compared as a sequence, folded into `child-order`.

Children are sorted by computed CSS `order` before pairing, not DOM order — so
the comparison is **visual** order. A design using `order:` on flex children
pairs correctly against an implementation whose DOM order differs, which is
worth knowing before a `child-order` finding looks impossible to explain.

**A child-order or child-count mismatch stops the walk at that node**, including
descent into children that are still correctly paired. Fix structure outermost-first
and re-run — a short finding list after such a mismatch does not mean nothing else
is wrong, only that nothing deeper was looked at.

## Relative geometry

Every node's box is stored as a fraction of its parent's, rounded to 3 decimals —
`w`, `h`, and also `x`/`y` (position within the parent, not just size). Position
matters because two equal-sized siblings swapped in place are a real structural
difference (a reordering) that role/child-order comparison alone cannot always
catch once `matchRole` collapses both to the same generic value — `rel.x`/`rel.y`
are what catches it. Default tolerance is 2 % of the parent box.

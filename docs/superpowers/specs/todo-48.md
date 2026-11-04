# TODO 48 — PR widget: distinguish own PRs inside stacks

Raw item (operator, Czech):

> Potřebujeme rozlišit ve widgetu PR moje PRs. Teď se stal případ kdy je stack PRs master <- moje PR <- kolegovo PR <- moje PR. Celý stack je v sekci "Moje" ve widgetu ale není to pravda. Potřebujeme rozlišit

## Meaning

The dashboard PRs widget groups stacked PRs under their root, and the group's section
follows the root's bucket. A stack rooted in the operator's PR lands entirely under
"Mine" even when it contains a colleague's PR. Ownership must be per-PR (`bucket ===
"mine"`, which the API derives from `author:@me`), never inherited from the stack root,
and a PR whose ownership differs from its section must be visibly marked. The
unresolved-conversations badge (item 41) follows per-PR ownership too.

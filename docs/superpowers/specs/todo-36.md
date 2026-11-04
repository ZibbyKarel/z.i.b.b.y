# TODO 36 — Override a ZIBBY code review with the operator's own verdict

## Raw item (operator's words)

> U code-review bychom měli mít možnost i ho ignorovat a poslat svoje vlastní. Například u http://localhost:3000/dashboard?run=pr-review-tested_1793279624199 se mi nelíbí a chtěl bych PR rovnou aproovnout bez komentáře ale nemám jak

## Summary

At the PR-review sign-off (the final `comment` phase `workflow-gate` of a
`pr-review-*` workflow, or a pending `pr-review` approval) the operator can pick
the review event and edit the findings' text, but cannot drop ZIBBY's review.
Add "Write my own review": the operator discards the generated review and
submits their own event (approve / request changes / comment) with an optional
body. An empty body is allowed only for Approve ("approve without comment") —
GitHub requires a body for the other two.

## Rulings

- The override goes through the existing gated path (approve → artifact →
  `pr-review` approval → `InboxReviewService.post`); no new GitHub call site.
- New explicit `ownReview: true` flag on the approve body and the approval record,
  instead of overloading an empty `reviewDocument` (blank keeps meaning "no edit").
- The contract rejects `ownReview` with a blank body unless the event is `APPROVE`.
- An empty own review posts without a `body` field and without inline comments.

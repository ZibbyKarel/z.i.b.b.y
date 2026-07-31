# Phase 126 — decisions log

Append-only. Each entry: the call, the alternatives, why. A later session must read this
before reopening any of these questions.

---

## D0 — one branch, one commit per sub-phase

**Call:** the whole TODO arc lands on `feat/phase-126-todo-arc`, one commit per sub-phase,
never batched.

**Why:** matches the phase-125 arc convention; keeps `git log` a readable record of which
operator-reported item each change answers, which is what makes recovery cheap.

---

_(further entries appended as the arc proceeds)_

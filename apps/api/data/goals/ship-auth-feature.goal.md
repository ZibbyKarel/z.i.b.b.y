---
name: Ship the auth feature green
objective: Implement the new login flow in auth-svc and get all checks green.
maker:
  kind: pipeline
  id: build-feature
verifier:
  kind: checks
maxIterations: 5
desc: Iterate the build-feature pipeline until the auth-svc checks pass.
---

Drive the build-feature pipeline toward green checks. Each iteration, address what
the verifier flagged last time; do not re-do already-committed work.

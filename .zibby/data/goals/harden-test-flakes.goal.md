---
name: harden-test-flakes
objective: Drive the api e2e suite to a reliable green across repeated runs.
maker:
  kind: pipeline
  id: delivery
verifier:
  kind: checks
  commands:
    - "pnpm api:test"
maxIterations: 5
budget:
  dailyRuns: 10
  monthlyRuns: 80
---

Identify under-load flaky e2e specs, isolate the contention, and stabilize them
(fork caps, timeouts, per-spec state reset) without weakening assertions.

# Example chains (ZB-05a / D-005)

These are **suggestions**, not seed data — ZB-05a ships the chains _feature_
(`ChainsService`, the CRUD endpoints, `HandoffService`'s hop-walking) with **no
system chains pre-created**. The operator authors chains through the same PUT
endpoint these examples describe. They're lifted from the ZibbyCorp design's
`design/ZibbyCorp/zc-data.js` (`ZC.chains`), translated into the real
`ChainInputSchema` shape (`entry` + `steps: {department, gate}[]`).

Department ids: `rnd` (R&D), `dev` (Development), `rel` (Release), `inc`
(Incident Response), `sec` (Security), `knw` (Knowledge), `com`
(Communications), `qa` (Quality), `fin` (Finance), `per` (Personal Office).

| id         | Label           | Entry → steps                                                    | Description                                       |
| ---------- | --------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `feature`  | Feature         | `rnd` → `dev` (auto) → `rel` (ask)                                 | New capability: research, build, release.           |
| `bugfix`   | Bugfix          | `dev` → `rel` (ask)                                                | Known defect with a clear fix.                      |
| `hotfix`   | Hotfix          | `inc` → `dev` (auto) → `rel` (ask)                                 | Production incident that needs a code change.       |
| `secpatch` | Security patch  | `sec` → `dev` (auto) → `rel` (ask)                                 | CVE or leaked secret that needs remediation.         |
| `research` | Research        | `rnd` → `knw` (auto)                                               | Question answered and filed into the vault.          |
| `announce` | Announcement    | `rel` → `com` (ask)                                                | Public note about a shipped release.                 |
| `sweep`    | Quality sweep   | `qa` → `dev` (ask)                                                 | Proactive scan, findings fixed in Development.       |

Two entries in the design's list, `personal` (`per`) and `finance` (`fin`),
are a single department with no further hop — they don't fit
`ChainInputSchema` (which requires at least one step past `entry`, D-005
invariant: 1–11 steps) and aren't chains under this model. They're plain
department targets, not suggestions for `PUT /api/handoff/chains/:id`.

## Example PUT body (`feature`)

```json
{
  "label": "Feature",
  "description": "New capability: research, build, release.",
  "entry": "rnd",
  "steps": [
    { "department": "dev", "gate": "auto" },
    { "department": "rel", "gate": "ask" }
  ],
  "enabled": true
}
```

`"auto"` maps to a Tier-2 rule (act, then report); `"ask"` maps to a Tier-3
rule (a `handoff-proposal` approval — Law 1: an ASK hop never auto-advances).
See [handoff.md § Chains](../../api/handoff.md#chains-zb-05a--d-005) for the
full dispatch/idempotency/`chainEndedAt` model.

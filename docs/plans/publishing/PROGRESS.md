# Publishing Factory — progress and handoff

**Read this first after a context loss.** Then run `rtk git log --oneline` on
`feat/publishing-factory` to see what actually landed.

- **Plan and night-run loop:** [`PLAN.md`](./PLAN.md) (§5 conventions, parts P0–P6, waves)
- **Defaults for open questions:** [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md)
- **Org decisions:** `docs/plans/zibbycorp/DECISIONS.md` (D-022 is written by P0-04)

**Branch:** `feat/publishing-factory`, worktree `worktrees/publishing-factory`.
**Wave order:** Wave 1 (P0-01..03 ∥ P1 ∥ P2) → Wave 2 (P0-04 → P4 ∥ P3 ∥ P7-01..02) →
Wave 3 (P5 → P7-03..04 → P8) → Wave 4, second night (P9 ∥ P10).
**Last updated:** 2026-10-01 (plan written, nothing started).
**Resume at:** Wave 1.

---

## Status board

Legend: ⬜ todo · 🟦 in progress · ✅ landed (sha) · ⛔ parked (reason)

### Part P0 — Departments become data (D-022)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P0-01 | Contract: open id, department fields, divisions | ⬜ | |
| P0-02 | API: store, seed, create/update, existence checks | ⬜ | |
| P0-03 | Web: departments from the query, Create department dialog | ⬜ | |
| P0-04 | DECISIONS D-022 + `pub` department data | ⬜ | |

### Part P1 — Engine
| Phase | Title | Status | Commit |
|---|---|---|---|
| P1-01 | `tool` phase type | ⬜ | |
| P1-02 | Stage-level approval | ⬜ | |
| P1-03 | Per-run cost cap + external cost seam | ⬜ | |
| P1-04 | Employee pin | ⬜ | |

### Part P2 — Publishing contracts + toolkit (mock)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P2-01 | Contracts | ⬜ | |
| P2-02 | CLI: validate-plan, render, preflight, mock provider, pixel QA | ⬜ | |
| P2-03 | `produce` batch loop | ⬜ | |

### Part P3 — Local generation
| Phase | Title | Status | Commit |
|---|---|---|---|
| P3-01 | mflux provider + licence allow-list | ⬜ | |
| P3-02 | Vision providers (ollama, haiku) | ⬜ | |
| P3-03 | 24 GB memory choreography + ops doc | ⬜ | |
| P3-04 | Bake-off | ⬜ | |

### Part P4 — Milestone 1 (mock end-to-end)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P4-01 | Agents, skills, employees | ⬜ | |
| P4-02 | Pipeline file | ⬜ | |
| P4-03 | End-to-end test | ⬜ | |

### Part P5 — Chains and sub-pipelines
| Phase | Title | Status | Commit |
|---|---|---|---|
| P5-01 | Chain step targets | ⬜ | |
| P5-02 | `pipeline` sub-phase | ⬜ | |
| P5-03 | `book-factory` chain | ⬜ | |

### Part P7 — Product model, marketplaces, economic gate
| Phase | Title | Status | Commit |
|---|---|---|---|
| P7-01 | Contracts: Product, Edition, Marketplace, Opportunity | ⬜ | |
| P7-02 | Marketplace seed + economics tool + catalog | ⬜ | |
| P7-03 | Economic gate as phase 0 of product pipelines | ⬜ | |
| P7-04 | Swap interim `listing` phase for `catalog` | ⬜ | |

### Part P8 — Distribution (dist)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P8-00 | Operator: Etsy shop + API key, Gumroad create-API check | ⬜ (morning) | |
| P8-01 | `edition` pipeline | ⬜ | |
| P8-02 | Adapters: kdp-manual, etsy-api, gumroad-api, tpt/ucitelnice/fler-manual | ⬜ | |
| P8-03 | `product-release` chain | ⬜ | |

### Part P9 — Demand research (rnd)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P9-01 | `opportunity-scan` pipeline + `demand-to-product` chain | ⬜ | |

### Part P10 — Economics & analytics (fin)
| Phase | Title | Status | Commit |
|---|---|---|---|
| P10-01 | Sales import, economics report, `monthly-economics` automation | ⬜ | |

### Part P11 — Batch mode + own store (later, not scheduled)

---

## Defaults applied
_(Q-number · default taken · where it shows)_

## Data written
_(path · reason · subphase)_

## Execution notes

## Follow-ups found

## PR drafts

## Operator action needed (morning)
- Install local tooling (Q5 default = night run does not install):
  `uv tool install --upgrade mflux` · `ollama pull qwen3-vl:8b` · then `product-factory doctor`
- Pick the bake-off winner (P3-04) once it has run.
- P8-00 (when convenient, not blocking): create the Etsy shop + Seller-App API key
  (store in `project-secrets`) — `etsy-api` flips from prepare-only to full on its own;
  check Gumroad live docs for `POST /v2/products` (Q16).
- Ask the accountant about CZ VAT registration before any direct (own-store) sale (Q20).

## Run log

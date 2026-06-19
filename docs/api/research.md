# Research / Intelligence (M6)

> "ZIBBY brings the world to the operator."

The research layer fetches the operator's watched sources, ranks items by interest
overlap, and folds a digest into the morning briefing. It is **operator-level**
(not per-project) and follows the same file-as-truth posture as the rest of ZIBBY.

## Pieces

| Piece        | File                                               | Role                                                                                      |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Contract     | `libs/contracts/src/research/`                     | `ResearchConfig`, `ResearchDigest`, `ResearchItem` schemas + the `research` router        |
| Config store | `apps/api/src/research/research-config.store.ts`   | reads/writes `data/research-config.json` (committed, operator-owned)                      |
| Source seam  | `apps/api/src/research/research-source.adapter.ts` | `ResearchSourceAdapter` — one impl per source kind (real RSS/HN/PH fetchers are deferred) |
| Fake adapter | `apps/api/src/research/fake.adapter.ts`            | reads `data/research/fixtures/<sourceId>.json`; the floor today, dependency-free          |
| Ranking      | `apps/api/src/research/research-ranking.ts`        | pure: `relevanceOf` (interest-overlap in [0,1]) + `rankSourceItems`                       |
| Service      | `apps/api/src/research/research.service.ts`        | digest pass: fetch → rank → persist JSON + vault note → record activity                   |

## Endpoints (`/api/research`)

- `GET /research/config` / `PUT /research/config` — the operator config.
- `GET /research/digest` — the latest persisted digest (empty before the first pass).
- `POST /research/refresh` — regenerate the digest now (same path the nightly automation takes).

## Flow

1. `refresh()` reads the config and fetches each **enabled** source through the
   adapter seam. A `finance` source is skipped unless `financeWatch` is on
   (finance is overview-only, never advice).
2. Each source's items are scored by interest overlap; zero-relevance items are
   dropped. With no interests configured every item scores a neutral `0.5`.
3. The top 25 ranked items are persisted to `data/research-digest.json` (machine
   read by the API) **and** mirrored to the vault note `intelligence/digest` as
   `- **title** — summary` bullets.
4. A Tier-1 `research-digest` activity entry is recorded.
5. The morning briefing reads the top 5 bullets from `intelligence/digest` into its
   **Intelligence** section (`Briefing.intelligence`).

## Scheduling

The `research-digest` automation target (`data/automations/research-digest.json`,
`0 6 * * *`) dispatches a digest pass before the 07:00 briefing. Deterministic
assembly — no `claude` run.

## Adding real sources

Implement `ResearchSourceAdapter` for the source kind (e.g. an RSS fetcher) and
resolve it by `source.kind` behind the same seam the `FakeResearchAdapter` occupies
today. Adapters must never throw out of a pass — return `[]` on failure.

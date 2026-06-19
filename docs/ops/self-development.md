# Self-development runbook — ZIBBY jako bezpečný cíl vlastní loop engine

> **Phase 12.8.** ZIBBY smí mířit svůj Phase 10 loop engine na **vlastní** monorepo
> jen za podmínek níže. Tento runbook je závěr Phase 12 — "MEMORY BOMB" (commit
> 96d1294) vznikla přesně tím, že se loop pustil na repo bez těchto pravidel.
> Detailní RCA: [`docs/plans/phase-12.md`](../plans/phase-12.md).

## Zlaté pravidlo: **Builder ≠ Subject**

Orchestrátor, který self-development **řídí** (builder), nesmí běžet na tom samém
stromě, který **upravuje** (subject):

- **Builder** = běžící ZIBBY API. Pro self-development ho spouštěj z **pinned/built**
  artefaktu, NE `ts-node-dev --respawn` (`apps/api/package.json:6`, script `dev`).
  `--respawn` re-startuje na každý zápis souboru → pod self-developmentem by se
  AppModule re-bootoval uprostřed úprav (to byl jeden z meta-cirkulárních vektorů,
  viz Phase 12.4). Použij `pnpm api:start` / `serve` (`ts-node` bez `--respawn`),
  ideálně z jiného checkoutu než ten, který je subject.
- **Subject** = repo, na které goal míří. Zaregistruj ho jako **projekt** s vlastní
  `path` na **čerstvý checkout** (`git clone` / `git worktree add` mimo builderův
  strom). Goal runner mu stejně vyřízne vlastní worktree v `ZIBBY_WORKTREE_ROOT`
  (Phase 12.7), takže builderův pracovní strom se nikdy needituje.

Builder a subject **nesmí sdílet** ani pracovní strom, ani `ZIBBY_DATA_DIR`.

## Tři identity, které se musí držet oddělené (Phase 12 RCA)

Když je target == ZIBBY, kolabují tři věci — Phase 12 každou rozpojila:

| Identita | Kolaps | Fix |
|----------|--------|-----|
| **Proces** | verifier `pnpm test` bootne druhý AppModule → `reconstruct()` → re-dispatch téhož goalu | 12.1/12.2 (scope verifieru, nikdy full-repo), 12.4 (gate boot re-dispatch), 12.5 (e2e izolace) |
| **Filesystem** | worktree + artefakty uvnitř sledovaného/testovaného stromu | 12.7 (worktrees mimo repo přes `ZIBBY_WORKTREE_ROOT`) |
| **Zdroje** | žádný timeout/kill/cap/reaping → N kopií žere RAM | 12.3 (timeout + detached pgid + cap + reaping), 12.9 (await reaping na shutdownu), 8.1 (budget) |

## Resource-governance jako dimenze autonomy contractu

Autonomy contract (CLAUDE.md "Laws") dosud řešil autonomii **úsudku** (tiers, gate,
approval-first). Phase 12 přidává autonomii **exekuce** — kolik výpočtu smí jeden běh
spotřebovat — jako rovnocennou dimenzi floor:

- **Per-call ceiling:** `goalVerifyTimeoutMs` (12.3, runtime system config) + output
  cap; každý verifier shell je detached process-group, killnutý na deadline (SIGTERM→SIGKILL).
- **Per-run/per-goal budget:** Phase 8.1 `BudgetService` — daily/weekly token/run-count
  cap; překročení parkuje dispatch za Tier 3 approval.
- **OS-level ceiling (doporučeno, mimo proces):** subjektův verifier spouštěj pod
  reálným resource stropem — cgroup `memory.max`/`cpu.max`, kontejner s `--memory`/
  `--cpus`, nebo (nejsilnější izolace) microVM (Firecracker) / gVisor. Sdílené-kernel
  kontejnery jsou slabší (riziko escape); pro skutečně netrusted self-modifying běh
  preferuj microVM. In-process timeout (12.3) je jen interim strop, ne náhrada.

## Defense-in-depth: vrstvy, které už ZIBBY má

Žádná jediná vrstva nestačí — bezpečnost je jejich součet:

1. **Approval gate + Tier 3** (core) — žádný push/merge/spend-past-cap bez operátora.
2. **Worktree-per-run mimo repo** (12.7) — subjektovy commity nikdy nesahají na builder.
3. **Scoped verifier** (12.1/12.2) — nikdy full-monorepo suita zevnitř repa.
4. **Reaping + timeout** (12.3/12.9) — žádný orphan, žádný hung shell.
5. **Boot gate** (12.4) — restart nedispatchne goal bez `goalAutoResume: true` (runtime system config).
6. **Budget cap** (8.1) — bounded spend.
7. **Test izolace** (12.5) — `pnpm test` se nedotkne živých dat ani reálného claude.

## Postup spuštění self-development běhu

```bash
# 1) Builder: pinned běh z odděleného checkoutu (NE ts-node-dev --respawn)
#    s vlastním data-dir a worktrees mimo subject.
#    (goalVerifyTimeoutMs nastav v data/system-config.json nebo přes /settings)
ZIBBY_DATA_DIR=/var/zibby/builder-data \
ZIBBY_WORKTREE_ROOT=/var/zibby/worktrees \
AGENT_RUNNER_MODE=claude \
pnpm --filter @zibby/api serve

# 2) Subject: čerstvý checkout repa jako projekt s explicitními checks (scoped!)
git clone <zibby-remote> /var/zibby/subject
#    → zaregistruj projekt { path: "/var/zibby/subject", checks: ["pnpm --filter X test"] }
#    (NIKDY prázdné checks — to by spadlo na full-repo default a 12.1 to zaparkuje)

# 3) Goal: maker = delivery pipeline, verifier scoped na subjekt; spusť přes gate.
#    OS strop (doporučeno): celý builder proces v kontejneru/cgroup s memory+cpu cap.
```

## Exit-criterion checklist (Phase 12)

Goal mířící na ZIBBY repo musí doběhnout/zaparkovat, **aniž** by kdy:

- (a) spustil full-monorepo suitu zevnitř repa — **12.1 + 12.2** ✅
- (b) nechal orphan child po API killu — **12.3 + 12.9** ✅
- (c) re-dispatchnul se na restartu — **12.4** ✅
- (d) vyčerpal RAM — **12.3 timeout/cap + 8.1 budget + OS strop**

a `pnpm test` je plně izolovaný od živých dat a reálného claude — **12.5** ✅.

Blast-radius sada **12.1–12.4 musí být zelená** (je) předtím, než se loop pustí na
toto repo. Guard test invariantu (worktree-root mimo builder strom):
`apps/api/src/shared/self-development.test.ts`.

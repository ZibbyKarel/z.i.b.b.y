# Phase NC2 — knip dead-code sweep (verifikovaný, ne slepý)

> Knip = signál, ne soudce (research: ~40 % false positives v NX monorepech).
> Každý nález ručně ověřen grepem proti kódu; mazáno JEN potvrzené. Config
> `knip.json` commitnut pro příští sweep.

## Triage nálezů

**False positives (ponecháno, zdůvodnění):**
- `resolveXxxDir` exporty v modulech (~40) — module-factory konvence, používané
  ve vlastním souboru (useFactory); odstranit `export` = churn bez přínosu.
- `getXxxQueryKey` re-exporty z barrel indexů — P1 konvence (back-compat, keys
  pattern pro runEvents).
- `vitest.components.config.ts` + `vitest.setup.tsx` — vitest workspace refs.
- `features/chains/index.ts` barrel — P1 data-layer konvence (public surface),
  dnes bez cross-feature konzumenta, ale konvenčně správně.
- Závislosti (react-hook-form na rootu, autoprefixer, …) — pnpm hoisting +
  postcss config; změny deps mimo rozsah této fáze (riziko >> přínos).

**Potvrzený mrtvý kód (0 referencí mimo barrel exporty) — SMAZÁNO:**
- `features/agents/components/AgentRow.tsx`, `RunLogModal.tsx`,
  `RunningAgentsPanel.tsx` — pozůstatek před-N4 běhového panelu (HUD dnes
  jede přes runs feed + detail stránky).
- Jejich privátní hook cluster: `useRunningAgentsQuery.ts`, `useRunLogQuery.ts`
  (queries), `useStopAgentRunMutation.ts` (mutations) + barrel řádky;
  `getRunningAgentsQueryKey` zůstává v `queries/keys.ts` (runEvents ho používá).
- `features/projects/useRunTargetProjects.ts` — nikdy nezapojený helper.
- `apps/web/state/forms.ts` — superseded @zibby/forms.

## DoD

- [ ] Všechna smazání ověřena grepem (0 referencí) PŘED smazáním
- [ ] `pnpm lint && pnpm typecheck && pnpm test` zelené (žádný test se nemaže —
      mrtvý kód neměl testy; pokud měl, test se maže s ním a je to v plánu)
- [ ] knip.json commitnut; follow-up kandidáti zaznamenáni (deps triage)

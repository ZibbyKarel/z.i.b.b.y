# Fáze 18 — Potvrzení nevratných akcí + poctivé load stavy

Zdroj: systémový audit (artifact ca029212, 2026-07-06), P0 #3 a #7 — oba nálezy
ověřeny verifikačními agenty proti kódu. Oba jsou „quick win" povahy: vzory už
v repu existují (ConfirmDeleteDialog z fáze NC1, QueryLoading/QueryError z fází
40–44), jen se na třech místech nepoužily.

⚠️ **Souběžná session:** v working tree jsou cizí necommitnuté změny
(`RunDetail.tsx`, `RunDetail.test.tsx`, `time.ts`, `task-runs.service.*`,
`i18n/messages/{cs,en}.json`, `task-run.schema.ts`) — jiná session pracuje na
cost/duration metadatech runů. Pravidla: jejich hunky NEUPRAVOVAT, commitovat
selektivně jen vlastní hunky (`git add -p` / filtrovaný `git apply --cached`),
nechytat jejich failing test `RunDetail.test.tsx` „cena (odhad)".

---

## Ověřený stav

- `apps/web/features/runs/components/RunDetail.tsx:399,405` — Stop/Delete
  tlačítka volají `onStop`/`onDelete` přímo; handlery v
  `features/runs/Screen.tsx:201-202` jdou rovnou na `stop(...)`/`remove(...)`.
- `apps/web/features/chains/Screen.tsx:172-179` — delete tlačítko volá
  `deleteChain.mutate(...)` přímo.
- `apps/web/features/gates/components/GlobalRuleCard.tsx:159-164` — delete
  volá `onDelete(rule.id)` přímo.
- Sdílená komponenta: `apps/web/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx`
  (props: `title, body, confirmLabel, cancelLabel, icon?, pending?, onConfirm, onCancel`),
  používaná v 8 DetailScreenech (vzor: `features/agents/DetailScreen.tsx:187`).
- `features/overview/Screen.tsx:31-35`, `features/automations/Screen.tsx:26-28` —
  destrukturované `= []` defaulty, žádné `isPending`/`isError` větve.
- `features/runs/queries/useRunsQuery.ts:53` — vrací jen `{ runs }` (`?? []`),
  polyká loading i error; `runs/Screen.tsx` k nim nemá přístup.
- Správný vzor: `features/chains/Screen.tsx:94-115` (`QueryLoading` +
  `QueryError onRetry`); komponenty `components/LoadingState/QueryLoading.tsx`
  a `components/LoadError/QueryError.tsx`.

---

## 18.1 — ConfirmDeleteDialog na Runs / Chains / Gate rules

1. **Runs** (`RunDetail.tsx` + `runs/Screen.tsx`): Stop i Delete dostanou
   potvrzení. Dialog state + ConfirmDeleteDialog umístit podle vzoru
   DetailScreenů (stav v obrazovce vlastnící mutaci). Stop používá stejný
   dialog s vlastní copy (`confirmLabel` „Zastavit", icon podle dostupných
   IconName — prozkoumat enum; delete default `trash`). POZOR: v RunDetail.tsx
   editovat jen minimální okolí tlačítek (řádky ~394–410), nedotknout se
   cizích cost/duration hunků.
2. **Chains** (`chains/Screen.tsx`): delete → confirm dialog, `pending` z
   `deleteChain.isPending`.
3. **Gate rules** (`GlobalRuleCard.tsx` a/nebo rodič, který vlastní
   `onDelete`): confirm dialog podle stejného vzoru; rozhodnout umístění podle
   toho, kdo vlastní mutaci (konzistence s ostatními).
4. i18n: nové klíče do `cs.json`/`en.json` (selektivní staging — cizí hunky
   v katalozích nechat být). Klíče pojmenovat podle existující konvence
   confirm-delete klíčů (podívat se, jak je mají DetailScreeny).
5. Testy: rozšířit/přidat testy pro každé místo — klik na Stop/Delete otevře
   dialog, potvrzení volá mutaci, zrušení ne. `RunDetail.test.tsx` je rozdělaný
   souběžnou sessí — nové testy přidat opatrně (vlastní describe blok, žádné
   úpravy jejich testů); pokud by to kolidovalo, testovat přes `runs/Screen`
   test místo RunDetail testu.

Commit: `phase 18.1: confirm dialogs for run stop/delete, chain delete, gate rule delete`.

## 18.2 — Loading/error stavy: Overview, Automations, Runs

1. **Automations** (`automations/Screen.tsx`): přesně vzor
   `chains/Screen.tsx:94-115` — `isPending` → `QueryLoading`, `isError` →
   `QueryError onRetry={refetch}` pro primární query (automations); sekundární
   queries (agents/pipelines pro labely) nechat s defaulty.
2. **Runs** (`useRunsQuery.ts` + `runs/Screen.tsx`): hook musí přestat polykat
   stav — vrátit vedle `runs` i `isPending`/`isError`/`refetch` (nebo vrátit
   query výsledek podle konvence CLAUDE.md „return the useQuery result
   directly" — prozkoumat, proč je tenhle hook výjimka s `{ runs }`, a zvolit
   nejmenší bezpečnou změnu). `runs/Screen.tsx` přidá QueryLoading/QueryError
   větve.
3. **Overview** (`overview/Screen.tsx`): dashboard s více queries — prozkoumat,
   jak to řeší jiné více-query obrazovky; minimum: selhání primárních dat
   nesmí vypadat jako prázdný workspace (docstring `Collection.tsx`). Přijatelné
   řešení: `QueryLoading` dokud jsou primární queries pending, `QueryError`
   pokud VŠECHNY primární selžou, jinak per-sekce fallback — zvolit nejmenší
   konzistentní řešení, zapsat rozhodnutí do commit message.
4. Testy: každá obrazovka dostane test na loading a error větev (vzor v
   testech chains/Screen, pokud existují).

Commit: `phase 18.2: honest loading/error states on overview, automations, runs`.

## Ověření fáze

`pnpm lint` + přímý `tsc -p` (web, api, ds) + `pnpm test`. Známé cizí červené:
`RunDetail.test.tsx` „cena (odhad)" (souběžná session), `self-knowledge.e2e`
(lokální graphify-out drift), `agent-runs.e2e` 404 flake — nechytat, jen
vykázat. Žádný push (Zákon 3).

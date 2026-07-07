# Fáze 21 — Quick wins ze systémového auditu

Zdroj: systémový audit (artifact ca029212, 2026-07-06), sekce „⚡ Quick wins"
+ dva drobné P2 nálezy. Všechny položky ověřeny verifikačními agenty. Čistě
mechanické, nekonfliktní diffy. (Toaster hover-pause/success toast a live
regions jsou VĚDOMĚ mimo — patří do případné budoucí a11y fáze P1, nejsou
quick win.)

⚠️ Souběžná session má stále necommitnuté hunky (RunDetail.*, time.*,
task-runs.*, tasks.e2e, task-run.schema.ts, i18n katalogy) — nechat být,
`rtk git diff --cached --stat` před každým commitem.

---

## 21.1 — A11y quick wins v komponentách

1. **`type="button"` default při `as="button"`** —
   `libs/design-system/src/components/IconTile/IconTile.tsx` (ř. ~94–131) a
   `Card/Card.tsx` (ř. ~145–174): když `Tag === "button"` a konzument nepředal
   vlastní `type` v `...rest`, doplnit `type="button"` (jinak `<button>` ve
   formuláři defaultuje na submit). Test: render s `as="button"` má atribut
   `type="button"`; explicitní `type="submit"` v props vyhraje.
2. **Alert role podle severity** —
   `libs/design-system/src/components/Alert/Alert.tsx:34`: `role="alert"` jen
   pro `error`/`warn`; `info`/`ok` → `role="status"`. Test na obě větve
   (role jen jako asserce, selektor testid — konvence DS).
3. **BrandMark motion-reduce** —
   `apps/web/components/LoadingScreen/BrandMark.tsx`: všem `animate-*` třídám
   (ř. 14, 18, 22, 26, 30, 46) doplnit `motion-reduce:animate-none` — přesně
   vzor `libs/design-system/src/components/OrbitLoader/OrbitLoader.tsx:45,96`.
4. **DropZone i18n leak** — DS `DropZone` má zapečená česká slova (najít je
   grep-em v `libs/design-system/src/components/DropZone/`); povýšit na string
   props s anglickými defaulty (DS je i18n-agnostický) a v apps/web
   konzumentech předat stávající české texty přes `t()` (nové klíče do
   katalogů — selektivní staging kvůli souběžné sessi).

Commit: `phase 21.1: a11y quick wins (button type default, Alert role by severity, BrandMark motion-reduce, DropZone i18n props)`.

## 21.2 — Drobné úklidy

1. **TopBar minWidth** — `apps/web/components/layout/TopBar/TopBar.tsx:48`:
   `<Container minW0 style={{ flex: "0 1 360px", minWidth: 150, margin: "0 auto" }}>`
   — `minW0` nastavuje `minWidth: 0` a inline style ho hned přepisuje na 150.
   Prozkoumat props Containeru a zvolit nejčistší tvar (odstranit rozpor;
   style passthrough na DS komponentě je povolený, konflikt props je ta chyba).
2. **entity-file-store paralelní čtení** —
   `apps/api/src/shared/file-storage/entity-file-store.ts:122-136`: `list()`
   awaituje `fs.readFile` sekvenčně v cyklu → `Promise.all` nad entries
   (zachovat chování: ne-`fileExt` soubory přeskočit, chybné čtení → skip
   přes `.catch(() => null)`, stejné řazení výsledku jako dnes — zkontrolovat,
   zda dnešní pořadí něco garantuje, případně zachovat sort). Existující testy
   store musí projít beze změny.
3. **CLAUDE.md nav segmenty** — sekce Routing uvádí segmenty
   `agents, automations, gates, integrations, memory, overview, pipelines,
   projects, runs, settings, skills`; skutečná navigace
   (`apps/web/state/config.ts`) má navíc `chains, commands, hooks, mcp` a
   `integrations` jako stránka neexistuje (přesunuto pod profil projektu).
   Aktualizovat seznam podle skutečného stavu (ověřit proti
   `apps/web/app/(dashboard)/` adresářům).

Commit: `phase 21.2: TopBar minWidth cleanup, parallel entity-file-store reads, CLAUDE.md nav list refresh`.

## Ověření fáze

`pnpm lint` + přímé `tsc -p` (web, api) + `pnpm test`. Známé cizí červené
nechytat (RunDetail „cena (odhad)", self-knowledge drift, under-load flaky).
Žádný push (Zákon 3).

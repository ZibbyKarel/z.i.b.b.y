# Fáze 19 — Přístupnost na úrovni DS primitiv (Dialog, kontrast, landmark)

Zdroj: systémový audit (artifact ca029212, 2026-07-06), P0 #4–6 — všechny tři
nálezy ověřeny proti kódu. Opravy sedí ve sdílených primitivech, takže každá
spraví celou aplikaci najednou. P1 a11y nálezy (HudPanel headings, SearchMenu
focus ring, live regions, Toaster) jsou ZÁMĚRNĚ mimo rozsah — přijdou v
pozdější fázi.

⚠️ Souběžná session má stále necommitnuté hunky v `RunDetail.*`, `time.*`,
`task-runs.*`, `tasks.e2e`, `task-run.schema.ts` a i18n katalozích — nechat
být, stagovat selektivně (postup viz fáze 18: rekonstrukce vlastního blobu,
`git diff --cached --stat` před každým commitem).

---

## Ověřený stav

- `libs/design-system/src/components/Dialog/Dialog.tsx`: jediný keydown handler
  je Escape (ř. 73–80); initial focus na kontejner (ř. 85), restore openeru
  (ř. 84, 90), `role="dialog"` + `aria-modal` (ř. 107, 112), `aria-label` jen
  ze string `title` (ř. 108). ŽÁDNÝ focus trap — Tab uteče za dialog.
  `DialogTitle`/`DialogDescription` (ř. 152–179) mají testid, ale žádné `id`,
  takže `aria-labelledby`/`aria-describedby` neexistují.
- `apps/web/components/EntityFormModal/EntityFormModal.tsx` předává `title`
  jako JSX `<Stack>` (ř. 58–72) a žádný `ariaLabel` → dialog bez přístupného
  jména na všech create formulářích.
- `libs/design-system/src/themes/darkTheme.ts:22` `colorForegroundFaint:
  "#66737f"` — kontrast ~3.8:1 vs `colorSurface #10151c`, ~3.98:1 vs
  `colorBackground #0b0e13`, ~4.05:1 vs `colorBackgroundDeep #090c11`
  (potřeba ≥4.5:1; Typography `label`/`micro` → tertiary → tento token na xs
  velikosti). `lightTheme.ts:19` `#6b7c8d` má tentýž problém (~3.9–4.3:1 vs
  `#f5f7fa`/`#f0f3f7`).
- `apps/web/components/layout/MainLayout/MainLayout.tsx` (ř. 59–110): `nav` a
  `aside` landmarky existují, obsah je v plain `<Container>` (ř. 90–92) —
  žádný `<main>`, žádný skip-link (grep: 0 výskytů v celé appce mimo testy).

---

## 19.1 — Dialog: focus trap + automatické aria-labelledby/describedby

1. **Focus trap** v `Dialog.tsx`: Tab/Shift+Tab cyklí uvnitř `dialogRef`
   (standardní vzor: při keydown Tab spočítat fokusovatelné elementy —
   `a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])`
   — a na krajích wrapovat). Žádná nová závislost, ~20 řádků. Zachovat
   existující chování (Escape, initial focus, restore, overlay click).
2. **Aria wiring**: `useId()` pro title/description id; `DialogTitle` a
   `DialogDescription` dostanou `id` (přes context Dialogu, ne prop drilling —
   prozkoumat, jak jsou složené; pokud jsou to sourozenecké exporty bez
   kontextu, zavést malý interní context). Kontejner dostane
   `aria-labelledby`/`aria-describedby`, pokud se title/description skutečně
   renderují; explicitní `ariaLabel` prop zůstává jako override/fallback.
3. **EntityFormModal**: předat `ariaLabel` (má k dispozici string název
   entity/akce — prozkoumat props a použít existující string, ne nový povinný
   prop).
4. Testy (testid-first, role/aria jen jako asserce): Tab z posledního prvku →
   první; Shift+Tab z prvního → poslední; dialog má accessible name z title;
   describedby napojené; EntityFormModal dialog má jméno.
5. Story netřeba nová — chování, ne vizuál.

Commit: `phase 19.1: Dialog focus trap + automatic aria-labelledby/describedby`.

## 19.2 — colorForegroundFaint ≥ 4.5:1 v obou tématech

1. Napsat jednorázový výpočet (skript v `$CLAUDE_JOB_DIR/tmp` nebo inline node
   -e) WCAG kontrastu a najít nejbližší hodnoty k současným, které dají
   ≥4.5:1 proti VŠEM podkladům, na kterých text reálně sedí (dark:
   `#090c11`, `#0b0e13`, `#10151c`, `#151c25`; light: `#f5f7fa`, `#f0f3f7`,
   + surface/elevated tokeny světlého tématu — přečíst z lightTheme.ts).
   Kandidát z auditu pro dark: `#8a97a4` — OVĚŘIT výpočtem, nepřebírat slepě.
2. Zachovat vizuální hierarchii: faint musí zůstat znatelně slabší než
   foreground/muted tokeny (přečíst sousední tokeny a zkontrolovat odstup).
3. Aktualizovat oba theme soubory + případné hex asserce v testech/stories
   (grep na starý hex). Zapsat výsledné kontrastní poměry do commit message.

Commit: `phase 19.2: AA contrast for colorForegroundFaint in dark and light themes`.

## 19.3 — Skip-link + `<main>` landmark

1. `MainLayout.tsx`: obsahový `<Container>` (ř. 90–92) renderovat jako `main`
   (prozkoumat, zda Container má `as` prop; pokud ne, DS `Surface`/`Container`
   pattern — rozhodnout explicitně DS vs. lokální, podle toho jak to dělá
   `as="nav"`/`as="aside"` o pár řádků výš) s `id="main-content"` a
   `tabIndex={-1}` (aby focus po skoku fungoval).
2. Skip-link jako první fokusovatelný prvek layoutu: vizuálně skrytý, viditelný
   na focus (Tailwind `sr-only focus:not-sr-only` + DS vizuální jazyk),
   `href="#main-content"`, text přes `t()` (cs „Přeskočit na obsah", en
   „Skip to content"). Umístění: apps/web lokální komponenta (je to layout
   concern appky, ne DS primitiv) — pokud by ale bylo přirozenější v DS,
   rozhodnout explicitně a zapsat do commit message (CLAUDE.md: rozhodnutí
   DS vs. lokální nikdy nenechat implicitní).
3. Testy: MainLayout test — main landmark existuje, skip-link je první
   fokusovatelný a míří na `#main-content`.

Commit: `phase 19.3: skip-link and main landmark in MainLayout`.

## Ověření fáze

`pnpm lint` + přímé `tsc -p` (web, api) + `pnpm test`. Známé cizí červené
nechytat, jen vykázat: `RunDetail.test.tsx` „cena (odhad)", `self-knowledge.e2e`
drift, `agent-runs.e2e`/`runner-core` under-load flaky. Pozn.:
`libs/design-system/tsconfig.json` má pre-existující rootDir config error —
DS typy jdou přes root typecheck. Žádný push (Zákon 3).

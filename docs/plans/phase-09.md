# Plán fáze 09: Špatné časy v pravém panelu (posun o 2 h)

> **TODO.md #4** — _„v pravém bočním panelu jsou špatné časy. Jsou o dvě hodiny
> posunuté dozadu."_

---

## Zjištění (root cause nalezen)

- **`RightRail.tsx`** (`apps/web/components/layout/RightRail/RightRail.tsx`),
  helper `clockTime` (řádky 17–20):
  ```ts
  function clockTime(at: string): string {
    return at.length >= 16 ? at.slice(11, 16) : "";
  }
  ```
  Vyřízne `HH:MM` **přímo z ISO stringu = UTC**, ne lokální čas operátora.
  Komentář to i přiznává („in UTC … locale-free"). Pro operátora v UTC+2 (Praha,
  letní čas) to čte přesně **o 2 h pozadu** — to je ten bug.
- Volá se na řádcích 72 a 81 (`clockTime(row.entry.at)` / `clockTime(row.at)`).
- **Správný vzor už v repu je:** `apps/web/utils/time.ts` `resumeEta` používá
  `new Date(resumeAt).toLocaleTimeString(locale, { hour: "2-digit", minute:
  "2-digit" })` — locale/timezone-aware. To samé chceme tady.

## Návrh řešení

### 1. Locale-aware formátování času

- Přidej do `apps/web/utils/time.ts` čistý, testovatelný helper:
  ```ts
  /** Wall-clock "HH:MM" in the viewer's local timezone (fixes the UTC-slice bug). */
  export function clockTime(iso: string, locale: string): string {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return "";
    return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  ```
  (Umístění vedle `resumeEta` drží konvenci a testovatelnost — čas v UI se má
  formátovat locale-aware, ne slicem stringu.)

### 2. `RightRail` použije helper s locale

- Smaž lokální `clockTime` v `RightRail.tsx`.
- Získej locale z `useLocale()` (next-intl) v komponentě `RightRail`.
- Volej `clockTime(row.entry.at, locale)` / `clockTime(row.at, locale)`.

### 3. Testy

- Unit test pro `clockTime(iso, locale)` v `apps/web/utils/time.test.ts` (nebo
  existující): daný ISO v UTC + fixní locale/timezone → očekávaný lokální
  `HH:MM`. Aby byl test deterministický nezávisle na CI TZ, ověř přes stejný
  `toLocaleTimeString` výpočet nebo použij `timeZone` v porovnání (zvaž fixaci
  `process.env.TZ` v test setupu, pokud už není).
- Pokud `RightRail` má test, uprav ho, aby čekal lokální čas (ne UTC slice).

---

## Kroky

1. `clockTime(iso, locale)` do `utils/time.ts` (+ unit test).
2. `RightRail`: odstranit lokální slice-helper, použít `useLocale()` + nový
   helper na obou call-site.
3. Upravit případný `RightRail` test na lokální čas.
4. `pnpm lint && pnpm typecheck && pnpm test` zelené.

## Mimo rozsah

- Změna ostatních time helperů (`relativeTime`, `compactAgo` jsou relativní,
  bugem nedotčené).
- Zobrazení data (jen `HH:MM`, dle stávajícího chování panelu).

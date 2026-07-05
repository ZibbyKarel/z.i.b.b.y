# Plán fáze 08: Skrytí pravého bočního panelu

> **TODO.md #3** — _„možnost skrýt pravý boční panel."_

---

## Zjištění (ověřeno v kódu)

- **Pravý panel** renderuje `MainLayout`
  (`apps/web/components/layout/MainLayout/MainLayout.tsx`, řádky 70–84): když je
  `railSlot`, zobrazí `<Divider orientation="vertical"/>` + fixní `<Stack
  as="aside" style={{ width: 324 }}>`. Levá nav je paralela (width 224).
- **`AppShell`** (`AppShellInner`, `"use client"`) předává `railSlot={<RightRail
  />}` do `MainLayout`.
- **`TopBar`** (`MainLayout` ho renderuje) je horní lišta se sloty — přirozené
  místo pro toggle tlačítko. Bere `breadcrumb`, `walletSlot`, `taskSlot`,
  `chatSlot`.
- `MainLayout` už používá hook (`useTranslations`) bez `"use client"` direktivy
  — běží v klientském bundlu (importován z `AppShellInner`, který `"use
  client"` je). `useState` tam tedy půjde.
- Precedent perzistence do `localStorage` v projektu existuje (Phase 22
  `voicePreference`; Node 25 localStorage polyfill v testech).

## Návrh řešení

### 1. Stav viditelnosti panelu v `MainLayout`

- `MainLayout` získá lokální stav `railHidden`, perzistovaný v `localStorage`
  (klíč `zibby.railHidden`), SSR-safe lazy init (`typeof window` guard, default
  `false` = viditelný). Malý interní hook `useRailHidden()` (lazy `useState`
  init z localStorage + `useEffect` zápis) — buď inline v `MainLayout`, nebo
  vedle jako `useRailHidden.ts`.
- Rail (Divider + aside) renderuj jen když `railSlot && !railHidden`.

### 2. Toggle tlačítko v `TopBar`

- `TopBar` dostane nové volitelné props `railHidden?: boolean`,
  `onToggleRail?: () => void`. Když je `onToggleRail` předán, vyrenderuj ikonové
  `Button`/`IconButton` (DS) vpravo (u `LanguageSwitcher`/divideru).
  - Ikona: vyber existující `IconName` reprezentující panel (např. `"sidebar"`
    / `"panel"` / `"columns"` / `"layout"` — ověř proti unii `IconName` v
    `libs/design-system/.../Icon`, použij jen existující).
  - `aria-label` z i18n; `aria-pressed={!railHidden}` (nebo obdoba) pro stav.
  - Testid `TopBarTestId.RailToggle` (přidej enum, pokud TopBar nemá).
- `MainLayout` předá `railHidden` + `onToggleRail={() => setRailHidden(v =>
  !v)}` do `TopBar` — **jen když existuje `railSlot`** (bez pravého panelu se
  toggle nezobrazuje).

### 3. i18n

- Klíče `topbar.hideRail` / `topbar.showRail` (cs default + en) pro aria-label
  podle stavu.

### 4. Testy

- `MainLayout` test: s `railSlot` je rail vidět; klik na toggle ho skryje
  (rail zmizí z DOM); bez `railSlot` se toggle nerenderuje. Selektory
  `getByTestId`. Ověř localStorage init cestu (polyfill v test setupu už je).
- Pokud `TopBar` má vlastní test, doplň render toggle při předaném
  `onToggleRail`.

---

## Kroky

1. `useRailHidden` (localStorage, SSR-safe) + podmíněný render railu v
   `MainLayout`.
2. `TopBar`: props `railHidden` + `onToggleRail` + ikonové tlačítko + testid.
3. `MainLayout` propojí stav → TopBar (jen když `railSlot`).
4. i18n cs/en.
5. Testy (MainLayout, příp. TopBar).
6. `pnpm lint && pnpm typecheck && pnpm test` zelené.

## Mimo rozsah

- Skrývání levé navigace (TODO se týká jen pravého panelu).
- Animace/šířkové přechody (stačí prosté skrytí/zobrazení).

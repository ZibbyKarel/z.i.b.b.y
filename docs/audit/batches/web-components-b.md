BATCH: web-components-b

[SEVERITY: Critical] [FILE: apps/web/components/LoadingScreen/LoadingScreen.tsx, BrandMark.tsx, CircuitTraces.tsx, Corner.tsx, StatusLine.tsx, Wordmark.tsx, BootProgress.tsx] [CATEGORY: custom Tailwind on DOM]
Sedm souborů v apps/web přímo vypisuje desítky raw Tailwind utility tříd (`fixed inset-0 z-50 overflow-hidden bg-background font-mono...`) na holých `div`/`span`/`svg` uzlech místo skládání z DS primitiv — porušuje "apps/web nikdy nepíše vlastní Tailwind třídy". Souborová `eslint-disable react/forbid-dom-props` řeší jen `style`, className zůstává zcela mimo lint dohled.
Doporučení: přesunout boot-splash vizualizaci (nebo alespoň strukturální obálky) do libs/design-system jako dedikovanou komponentu s vlastním API.

[SEVERITY: High] [FILE: apps/web/components/layout/SkipLink/SkipLink.tsx:20-24] [CATEGORY: custom Tailwind na DOM]
Raw `<a>` s dlouhým literálem `className="sr-only focus:not-sr-only focus:fixed focus:top-3 ..."` — kompletně mimo DS.
Doporučení: povýšit do libs/design-system jako `SkipLink`/`VisuallyHidden` primitivu s tokenizovanými focus styly.

[SEVERITY: High] [FILE: apps/web/components/layout/GlobalSearch/useGlobalSearch.ts, GlobalSearch.tsx] [CATEGORY: chybějící testy]
155řádkový hook (debounce, agregace 5 zdrojů, ⌘K handling, navigace) i wrapper komponenta nemají žádný test soubor — nejrozsáhlejší netestovaná logika v tomto batchi.
Doporučení: doplnit unit testy na `useGlobalSearch` (debounce, sections, handleSelect) a integrační test na `GlobalSearch`.

[SEVERITY: Medium] [FILE: apps/web/components/layout/GlobalSearch/useGlobalSearch.ts:14-21] [CATEGORY: duplicitní vzor / drift]
Lokální `ROUTES` mapa duplikuje cesty už definované v `apps/web/state/config.ts` `NAV_ITEMS`. Dva nezávislé zdroje pravdy pro "kam vede entita X".
Doporučení: odvodit `ROUTES` z `NAV_ITEMS`/`state/config.ts`.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:100-171, apps/web/components/layout/LimitsRings/LimitsRings.tsx:38-84] [CATEGORY: duplicitní vzor]
Identický hover/focus popover vzor (onBlur/onFocus/onMouseEnter/onMouseLeave + absolutně umístěná Card, zIndex 60) doslovně zopakovaný ve dvou komponentách.
Doporučení: extrahovat sdílený `useHoverPopover()` hook nebo DS `Popover`/`HoverCard` primitivum.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:38-48, apps/web/components/layout/LimitsRings/LimitsRings.tsx:14-19] [CATEGORY: duplicitní vzor]
Obě komponenty ručně definují stejný "fallback shape, dokud query nedoběhne" vzor (FALLBACK_STATUS, CLAUDE_LIMITS).
Doporučení: sjednotit přes `placeholderData` v TanStack Query nebo sdílený util.

[SEVERITY: Medium] [FILE: apps/web/components/layout/MainLayout/MainLayout.tsx:66,71,110; apps/web/components/layout/Sidebar/Sidebar.tsx:24] [CATEGORY: chybějící DS prop / raw style]
Raw `style={{ width: 224/324, backgroundColor: "var(--color-background-deep)" }}` a `style={{ display:"flex", flexDirection:"column", minHeight:0 }}` opakovaně obchází sealed sizing API. DS má `minW0`, ale ne výškový ekvivalent.
Doporučení: přidat `minH0`/šířkové tokeny do `Stack`/`Container` v DS.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:1-173] [CATEGORY: business logika v komponentě]
Mutation handling, parsování chybové zprávy, retry-attempt state a toast emitování žijí přímo v komponentě spolu s renderem.
Doporučení: extrahovat do `useSelfUpdate()` hooku (features/self).

[SEVERITY: Low] [FILE: apps/web/components/layout/BootSplash/BootSplash.tsx] [CATEGORY: business logika v komponentě / chybějící testy]
Ruční RAF animační smyčka s ease-out křivkou a min-visible logikou je vnořená přímo v useEffect; žádný test časovací logiky.
Doporučení: extrahovat do `useBootProgress(minVisibleMs)` hooku a pokrýt testem s fake timers.

[SEVERITY: Low] [FILE: apps/web/components/LoadingScreen/constants.ts:3] [CATEGORY: netokenizované barvy]
`ACCENT = "rgba(91,141,239,1)"` a gradienty natvrdo mimo token systém (konvence je useTokens() pro SVG/canvas), spotřebované napříč šesti soubory.
Doporučení: přesunout přes theme token / useTokens().

[SEVERITY: Low] [FILE: apps/web/components/layout/TopBar/TopBar.tsx:35,44] [CATEGORY: raw style na DS komponentě]
`style={{ height: "100%" }}` na Stack a `style={{ flex: "0 1 360px", margin: "0 auto" }}` na Container — statické ad-hoc hodnoty, ne "genuinely dynamic".
Doporučení: zvážit DS prop pro "centered flexible column".

[SEVERITY: Low] [FILE: apps/web/components/Toaster/Toaster.tsx:24-31] [CATEGORY: chybějící cleanup]
Každý toast zakládá vlastní `setTimeout` bez uchování reference a bez clearnutí při unmountu — jen `unsubscribe` je uklizen. Riziko nízké (Toaster se neodmountuje), ale nekonzistentní s cleanup disciplínou.
Doporučení: sbírat timer handly a mazat je v cleanup funkci efektu.

STATS: 69 souborů, 3336 řádků celkem. Top 3 (bez test/stories): layout/TopBar/SelfFreshness.tsx (173), layout/GlobalSearch/useGlobalSearch.ts (155), LoadingScreen/LoadingScreen.tsx (142).

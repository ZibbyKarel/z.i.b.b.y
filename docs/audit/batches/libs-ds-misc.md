BATCH: libs-ds-misc

POZN. ORCHESTRÁTORA: agent (haiku) částečně vybočil ze scope (assets/themes/context/utils) a auditoval i komponenty — překryv s libs-ds-components-a/b batchi. Severity typových castů (High) jsou nadsazené — reálně Low/Medium. Nález "Dialog hardcoded px šířky" je pravděpodobně falešný: DialogWidth je záměrně sealed sizing API projektu (viz project_sealed_sizing). Při agregaci normalizovat a deduplikovat.

[SEVERITY: High] [FILE: libs/design-system/src/DesignSystemContext/DesignSystemProvider.tsx:51] [CATEGORY: Typování]
Type cast `...(cssVars as CSSProperties)` — `cssVars` je `Record<string, string>`. (Reálná severity: Low)
Zlepšit typování v `tokensToCssVars()`.

[SEVERITY: High] [FILE: libs/design-system/src/utils/refs.ts:8] [CATEGORY: Typování]
Type cast `(external as { current: T | null })` bez type guardu. (Reálná severity: Low)
Přidat type guard před přetypováním.

[SEVERITY: High] [FILE: libs/design-system/src/components/Kbd/Kbd.tsx:23] [CATEGORY: Typování]
Zbytečný cast `ref={ref as Ref<HTMLElement>}` — ref je v props již správně typován. (Reálná severity: Low)
Odstranit cast.

[SEVERITY: High] [FILE: libs/design-system/src/components/Dialog/Dialog.tsx:24-33] [CATEGORY: Hardcoded hodnoty]
Hardcodované px šířky dialogů. (POZN.: pravděpodobně falešný nález — DialogWidth je záměrné sealed sizing API; nanejvýš přesun do tokens.ts jako kosmetika.)
Zvážit přesun do tokens.ts.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/ProgressRing/ProgressRing.tsx:76, Progress/Progress.tsx:47, Button/Button.tsx:27, Chip/Chip.tsx:15] [CATEGORY: Hardcoded hodnoty]
Hardcodované RGBA barvy (track/hover/surface) v SVG stroke a arbitrary Tailwind třídách (`rgba(255,255,255,0.09)`, `bg-[rgba(255,255,255,0.07)]`, `hover:bg-[rgba(255,255,255,0.05)]`, `bg-[rgba(255,255,255,0.03)]`) místo theme tokenů — čtyři nezávislé "white-alpha" konstanty mimo token systém.
Zavést `colorBgTrack`/`colorBgHover` tokeny v @theme a nahradit.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Icon/Icon.tsx:28-41] [CATEGORY: Hardcoded hodnoty]
`iconSizePx` a `strokeWidthPx` Records přímo v komponentě místo v tokens.ts. (Pozn.: Icon=Size je sealed API, jde jen o umístění konstant.)
Přesunout do tokens.ts jako `iconSizes`/`iconStrokeWidths`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Icon/Icon.tsx:14-22, Chip/Chip.tsx:10-13, HoldButton/HoldButton.tsx:19-24, StatusDot/StatusDot.tsx:12-19, Typography/Typography.tsx:104-112, IconTile/IconTile.tsx:37-51] [CATEGORY: Duplicitní logika]
Šest `toneClass` Records opakuje stejný pattern mapování tónů na Tailwind třídy — potvrzuje nález "pět tone unions" z libs-ds-components-a.
Centralizovat tone→class mapy do sdíleného modulu (`utils/toneClass.ts`) nad kanonickým tone vokabulářem.

[SEVERITY: Low] [FILE: libs/design-system/src/components/LivingGlow/LivingGlow.tsx:59] [CATEGORY: Typování]
Cast `as CSSProperties` pro CSS custom property — standardní React idiom, kosmetika.
Ponechat, případně typovat přes `React.CSSProperties & Record<'--living-color', string>`.

STATS: ~10 souborů ve scope (context/themes/utils) + překryv s komponentami. Assets (49 ikon) bez nálezů.

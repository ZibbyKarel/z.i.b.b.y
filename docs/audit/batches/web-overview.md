BATCH: web-overview

[SEVERITY: Medium] [FILE: apps/web/features/overview/components/ActivityFeed/ActivityFeed.tsx:44] [CATEGORY: duplicitní logika]
`relativeTime` je lokální reimplementace formátování relativního času s jinou signaturou než sdílený `apps/web/utils/time.ts` (`relativeTime`/`compactAgo`), který už jiné feature soubory (`SubsystemDrawer/AktivitaTab.tsx`, `ArtefaktyTab.tsx`) korektně reužívají.
Doporučení: nahradit lokální funkci sdíleným `compactAgo`/`relativeTime` z `utils/time.ts` a smazat duplicitní implementaci.

[SEVERITY: Medium] [FILE: apps/web/features/overview/Screen.tsx:66] [CATEGORY: duplicitní logika]
Výpočet `isFresh` (workspace je prázdný, pokud skills/integrations/agents/pipelines mají délku 0) je identicky zkopírovaný i v `SummaryWidget.tsx:46` — obě místa musí zůstat ručně synchronní.
Doporučení: vytáhnout do sdíleného hooku/util (např. `useIsWorkspaceFresh(...)`) v `overview/` a použít na obou místech.

[SEVERITY: Low] [FILE: apps/web/features/overview/SummaryWidget.tsx:15] [CATEGORY: duplicitní logika]
Lokální `pad2` helper (`String(n).padStart(2, "0")`) je ad-hoc reimplementace stejného vzoru, který se opakuje minimálně v `features/tasks/task.ts`, `features/automations/schedule.ts`, `features/automations/useCronLabel.ts` a `features/chat/components/ChatScreen.tsx`.
Doporučení: sjednotit do jedné sdílené util funkce (např. `utils/format.ts:padDigits`).

[SEVERITY: Low] [FILE: apps/web/features/overview/components/QuickLaunchPanel/QuickLaunchPanel.tsx:68] [CATEGORY: chybějící typování]
`(agent.glyph as IconName | undefined) ?? "bot"` — `agent.glyph` je v kontraktu záměrně `z.string().optional()`, takže cast na `IconName` je nekontrolovaný a neplatná hodnota glyfu projde bez fallbacku, na rozdíl od `Record`-lookup vzorů použitých jinde v tomto batchi, které selžou bezpečně na default.
Doporučení: validovat proti známé množině `IconName` (lookup s fallbackem) místo přímého `as` castu.

[SEVERITY: Low] [FILE: apps/web/features/overview/SummaryWidget.tsx:1] [CATEGORY: chybějící pokrytí testy]
`SummaryWidget.tsx` (HUD hlavička se zdravím systému, statistikami a "isFresh" titulkem) nemá žádný test soubor, na rozdíl od ostatních komponent ve stejné složce.
Doporučení: přidat `SummaryWidget.test.tsx` pokrývající health tone/dot mapping a fresh/allRunning title větvení.

[SEVERITY: Low] [FILE: apps/web/features/overview/components/ApprovalsPanel.tsx:1] [CATEGORY: chybějící pokrytí testy]
`ApprovalsPanel.tsx` (empty-state, MAX_SHOWN=4 ořez, approve/reject mutace) nemá test soubor.
Doporučení: přidat `ApprovalsPanel.test.tsx` pokrývající empty state, ořez na 4 karty a approve/reject click handlery.

[SEVERITY: Low] [FILE: apps/web/features/overview/Screen.tsx:39] [CATEGORY: obecnost komponenty]
`Screen()` orchestruje 4 primární query stavy (pending/error/fresh) ručně přes pole `primaryQueries` + `.every()` — vzor honest-load-state, který existuje jen zde; při druhém výskytu to bude copy-paste.
Doporučení: při druhém konzumentovi extrahovat do sdíleného `useAllOrNothingLoadState(queries)` hooku; zatím akceptovatelné.

STATS: 18 souborů (zdrojové + testy), 1590 řádků celkem. Top 3: Screen.tsx (185), Screen.test.tsx (132), SummaryWidget.tsx (130). Žádný soubor nepřekračuje 300 řádků.

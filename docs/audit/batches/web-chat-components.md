BATCH: web-chat-components

[SEVERITY: High] [FILE: apps/web/features/chat/components/ChatScreen.tsx:148-748] [CATEGORY: Component size]
ChatScreen je 748 řádků a kombinuje top-bar, scanline/grid dekorace, scénu, tasks panel, task-detail column, composer, palette a detail dialog v jedné funkci s ~15 useState/useRef a ~10 odvozenými hodnotami.
Rozděl na podkomponenty (např. ChatScreenTopBar, ChatScreenComposer) a vytáhni orchestraci stavu do vlastního hooku (např. useChatScreenState), aby zůstal jen kompoziční shell.

[SEVERITY: High] [FILE: apps/web/features/chat/components/ChatScreen.tsx:460-479] [CATEGORY: Business logic in component]
Odvození `SceneMode` (dlouhý vnořený ternární řetězec kombinující error/waiting-approval/tool/streaming/thinking/speaking/listening stavy z pěti různých zdrojů) je čistá byznys logika napsaná přímo v render těle komponenty.
Vytáhni do samostatné čisté funkce/hooku (např. `deriveSceneMode` ve `scene/`), aby šla jednotkově testovat bez renderu celé obrazovky.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:353-378] [CATEGORY: Duplicate pattern — event listener]
Dva téměř identické `useEffect` bloky ručně registrují `window.addEventListener("keydown", ...)` (Escape pro paletu, ⌘K pro otevření palety) — ad-hoc listener pattern místo sdíleného hooku; v repu neexistuje `useKeyboardShortcut`/`useHotkey` hook.
Zaveď sdílený `useKeyboardShortcut`/`useHotkey` hook a nahraď oba efekty jedním voláním na komponentu.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:481-482] [CATEGORY: Duplicate/util miss]
`timeStr` je ručně sestaven přes `padStart` (`HH:MM`) místo použití existujícího, locale-aware `clockTime(iso, locale)` util z `apps/web/utils/time.ts`, který projekt už jednou opravoval kvůli přesně tomuto UTC/locale bugu (viz phase-9 rail timezone fix).
Nahraď ruční formátování voláním `clockTime`.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:598-602,ChatTaskDetailColumn.tsx:65-69] [CATEGORY: Duplicate pattern — layout]
Vzor „vnější `pointer-events-none absolute inset-y-0 ... lg:flex` wrapper + vnitřní `pointer-events-auto`" pro doky/panely je copy-pasted mezi ChatScreen (gutter panelu úkolů) a ChatTaskDetailColumn (a dle komentářů i SubsystemDrawer mimo batch) s ručně psanými Tailwind třídami přímo v `apps/web`, což je proti konvenci „apps/web nepíše vlastní Tailwind třídy".
Zobecni do sdílené DS/local primitivy (např. `DockedColumn`) parametrizované stranou/šířkou.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:536-556] [CATEGORY: Duplicate pattern — raw button]
Tlačítka "New chat" a "Close" jsou raw `<button>` prvky se stejným dlouhým řetězcem Tailwind tříd duplikovaným doslovně na obou místech, místo DS `Button`/`IconButton` kompozice.
Nahraď DS `Button` variantou (ghost/outline) se sdílenou konfigurací, ať se třídy nepíší ručně a neduplikují.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatPalette.tsx:82,90,101,111; TargetIdentity.tsx:13; ChatDetailDialog.tsx:56] [CATEGORY: Typing — repeated cast]
Vzor `(x.glyph as IconName | undefined) ?? "bot"` (resp. `"flow"/"wait"/"brain" as IconName`) se opakuje identicky na 6+ místech napříč třemi soubory — doménové typy (`Agent.glyph`, `TaskTarget.glyph`) nesou `glyph` jako obyčejný `string`, takže každé místo spotřeby musí přetypovávat ručně.
Zaveď jeden sdílený helper (např. `asIconName(glyph, fallback)`) nebo zpřísni typ `glyph` už v kontraktu, aby se cast nemusel opakovat.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatPalette.tsx:43-47] [CATEGORY: Duplicate pattern — filter logic]
`matchesQuery` je lokální case-insensitive substring filtr, jehož vlastní komentář říká, že „mirrors CommandLine's mention-picker filter" — tedy stejná logika už existuje jinde v `CommandLine` (mimo tento batch), ale je re-implementovaná zde.
Vytáhni sdílený `matchesQuery`/`fuzzyIncludes` util a importuj na obou místech místo dvou nezávislých kopií.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatScreen.tsx:663-685] [CATEGORY: Prop drilling]
`ChatTaskDetailColumn` dostává 11 jednotlivě rozbalených props (`run`, `glyph`, `avatar`, `now`, `onStop`, `stopping`, `onDelete`, `deleting`, `onResume`, `resuming`, `onClose`) místo předání již existujícího `runActions` objektu (z `useRunActions`) a `selectedRun` jako celků.
Zvaž seskupení do `runActions`/`run` objektových props, ať se rozhraní komponenty nerozpadá při každé další akci.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatButton.tsx, ChatTranscript.tsx] [CATEGORY: Test coverage]
Tyto dva soubory nemají vlastní `.test.tsx` (na rozdíl od všech ostatních komponent v adresáři) — `ChatTranscript` navíc obsahuje netriviální podmínku `hasLive` řídící přechod live bubliny na commitnutou zprávu.
Doplň testy zejména pro `ChatTranscript`'s live→commit přechod (riziko duplicitního/chybějícího bublinu).

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatRunCard.tsx:51-88] [CATEGORY: Business logic in component file]
`runProgress` a `runDetail` jsou needexportované čisté transformační funkce (progress caption, výběr detail komponenty) umístěné přímo v souboru komponenty místo v `runs`-doménovém util modulu, takže je nelze samostatně jednotkově testovat mimo render.
Přesuň do `features/runs/run.ts` (kde už žijí `runAvatar`/`runGlyph`/`runTitle`) a exportuj pro přímé testování.

STATS: 13 zdrojových souborů (bez testů), 1985 řádků zdrojového kódu (celkem včetně testů 3669 řádků napříč 24 soubory). Top 3 nejhorší podle počtu řádků: ChatScreen.tsx (748, zdroj), ChatScreen.test.tsx (647, test), ChatMessage.test.tsx (264, test) — mezi zdrojovými soubory po ChatScreen následují ChatMessage.tsx (195) a ChatRunCard.tsx (195).

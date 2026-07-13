BATCH: web-chat-core

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:1-331] [CATEGORY: Component/file splitting]
Soubor má 331 řádků a mísí tři odlišné odpovědnosti v jednom modulu: čisté chunkovací funkce (hardSplit, chunkForSpeech), stavový přehrávací kontrolér (SpeakSession, ensureSynth/finish/abandon/discard/stop/fail/playChunk) a samotný React hook.
Doporučení: Vytáhnout chunkForSpeech/hardSplit do samostatného pure-util modulu a SpeakSession kontrolér do vlastní továrny mimo hook, useAutoSpeak nechat jako tenký React wrapper.

[SEVERITY: High] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:196-201] [CATEGORY: Fetch logika mimo TanStack Query hook]
Hook volá `apiClient.speech.synthesize.mutate(...)` přímo, přestože v `mutations/useSynthesizeSpeechMutation.ts` už existuje dedikovaný mutation hook pro stejný endpoint — vzniká duplicitní fetch cesta mimo konvenci per-domain hooků a mimo centrální `MutationCache.onError` toast.
Doporučení: Volat mutaci přes `useSynthesizeSpeechMutation()` (např. `mutateAsync` uložené v ref pro stabilní identitu kontroléru) místo přímého `apiClient` volání.

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useChatStream.ts:132] [CATEGORY: Chybějící typování]
`JSON.parse(event.data) as ChatTurnEvent` přetypuje nedůvěryhodná SSE data bez runtime validace — poškozený nebo neúplný frame projde beze změny a přistupuje se k jeho polím (`parsed.turnId`, `parsed.tool`) jako by byla garantovaná.
Doporučení: Validovat parsovaný payload proti zod schématu (nebo alespoň type guardu) před přetypováním na ChatTurnEvent.

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:167-183; apps/web/features/chat/hooks/useSpeechRecognition.ts:71-78; apps/web/features/chat/hooks/useChatStream.ts:113-116] [CATEGORY: Duplicitní vzor napříč soubory]
Vzor "udržet poslední hodnotu v ref, aby se nerebuildoval stabilní callback" (tRef/voiceRef/onSettledRef, langRef/onFinalRef/onErrorRef, handlersRef) je ručně opakovaně implementován ve třech hoocích bez sdílené abstrakce.
Doporučení: Vytáhnout sdílený `useLatestRef<T>(value: T)` hook a použít ho na všech třech místech.

[SEVERITY: Medium] [FILE: apps/web/features/chat/ChatContext.tsx:29-33,89,98-105] [CATEGORY: Duplicitní vzor napříč soubory]
SSR-guarded čtení z localStorage + synchronizační effect je zde znovu napsán od nuly; stejný vzor je duplicitně (ad hoc) implementován i v `MainLayout.tsx` a `settings/Screen.tsx` jinde v appce.
Doporučení: Vytáhnout sdílený `usePersistedState(key)` hook a nahradit jím všechny tři výskyty.

[SEVERITY: Low] [FILE: apps/web/features/chat/ChatContext.tsx:135-147] [CATEGORY: Business logika v komponentě]
Globální ⌘/Ctrl+J keydown listener je zapojen přímo v provideru přes syrový `window.addEventListener` efekt namísto znovupoužitelného shortcut hooku.
Doporučení: Vytáhnout drobný `useGlobalShortcut(key, handler)` hook, aby modifier/key-matching logika nebyla inline v provideru.

[SEVERITY: Low] [FILE: apps/web/features/chat/Screen.tsx:43-49] [CATEGORY: Business logika v komponentě]
Hydratace transkriptu (ref-guarded one-shot seed conversationId/messages z query) je inline useEffect logika přímo v route-level komponentě místo pojmenovaného, samostatně testovatelného hooku.
Doporučení: Vytáhnout do `useHydrateChatTranscript(transcript, setConversationId, setMessages)`.

[SEVERITY: Low] [FILE: apps/web/features/chat/hooks/usePrefersReducedMotion.ts:1-23] [CATEGORY: Chybějící abstrakce/generalizace]
Obecný browser-capability hook bez jakékoli chat-specifické závislosti leží pod features/chat/hooks; aktuálně má jen jednoho konzumenta, ale nic ho k chatu neváže.
Doporučení: Až přibude druhý konzument (např. jiná WebGL/motion-sensitive komponenta), přesunout do sdíleného umístění (apps/web/hooks nebo libs/design-system) místo duplikace.

STATS: 22 souborů (root + hooks + mutations + queries, včetně testů), celkem 2646 řádků. Top 3 podle velikosti: hooks/useAutoSpeak.test.tsx (433), hooks/useAudioPlayback.test.ts (336), hooks/useAutoSpeak.ts (331).

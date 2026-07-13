BATCH: web-mcp-chains-hooks

[SEVERITY: High] [FILE: apps/web/features/chains/Screen.tsx:49-282] [CATEGORY: File size / component splitting]
Screen.tsx (331 řádků) dělá čtyři věci najednou: katalogový list, master-detail panel vybraného řetězce, seznam běhů (run rows) a delete-confirm flow; navíc obsahuje dvě lokální podkomponenty (ChainCard, StepFlow) v témže souboru.
Rozdělit na samostatné soubory v `chains/components/`: `ChainCard.tsx`, `ChainDetailPanel.tsx` (hlavička + StepFlow) a `ChainRunsList.tsx`, po vzoru `mcp`/`hooks/components/`.

[SEVERITY: Medium] [FILE: apps/web/features/chains/Screen.tsx vs apps/web/features/mcp/DetailScreen.tsx, apps/web/features/hooks/DetailScreen.tsx] [CATEGORY: Duplicitní vzor / nekonzistentní architektura]
Stejný katalog+detail vzor je implementován dvěma různými způsoby: `mcp` a `hooks` mají oddělený `Screen` (katalog) a `DetailScreen` (edit stránka, N4e grammar), zatímco `chains` drží list i detail sloučené v jednom `Screen` volaném jak z `/chains`, tak z `/chains/[id]` přes `selectedId` prop.
Sjednotit chains na stejný katalog/`DetailScreen` vzor jako mcp a hooks, nebo explicitně zdůvodnit odchylku (dnes to vypadá jako nedokončená migrace na N4e).

[SEVERITY: Medium] [FILE: apps/web/features/chains/mutations/useStartChainMutation.ts:6] [CATEGORY: Mrtvý kód]
`useStartChainMutation` je exportován z `mutations/index.ts`, ale nikde v `apps/web` není volán — spouštění řetězce jde jinou cestou přes `useNewTask().open(...)` v `chains/Screen.tsx`.
Odstranit nepoužitý hook, nebo ho zapojit, pokud je to zamýšlené API.

[SEVERITY: Medium] [FILE: apps/web/features/mcp/components/McpServerFormDialog.tsx a apps/web/features/hooks/components/HookFormDialog.tsx] [CATEGORY: Chybějící ošetření stavu / double-submit riziko]
Na rozdíl od `NewChainDialog`, které přijímá `isPending` a blokuje submit po dobu mutace, `McpServerFormDialog` a `HookFormDialog` žádný pending stav nepředávají do `DialogFormFooter` — tlačítko Submit zůstává aktivní po celou dobu in-flight mutace a rychlý dvojklik může vyvolat duplicitní POST.
Přidat `isPending`/`loading` prop do obou dialogů a do `DialogFormFooter`.

[SEVERITY: Medium] [FILE: apps/web/features/chains/components/NewChainDialog.tsx:49-64] [CATEGORY: Business logika v komponentě]
Na rozdíl od mcp (`useMcpFormState`) a hooks (`useHookFormState`), kde je form-state, validace i payload-building extrahován do hooku, `NewChainDialog` drží state, validaci (`canSubmit`) i stavbu payloadu (vč. `slug(name)`) přímo v komponentě.
Extrahovat do `useChainFormState` hooku pro sjednocení vzoru napříč všemi třemi features.

[SEVERITY: Low] [FILE: apps/web/features/mcp (chybí index.ts) a apps/web/features/hooks (chybí index.ts)] [CATEGORY: Nekonzistentní architektura]
`chains/index.ts` deklaruje explicitní "public surface" feature; `mcp` a `hooks` agregační index nemají — cizí feature by musela importovat přímo z internals.
Přidat stejný `index.ts` do `mcp` a `hooks` pro konzistenci.

[SEVERITY: Low] [FILE: apps/web/features/mcp/components/McpServerFormFields.tsx:189] [CATEGORY: Typování]
`onValueChange={(v) => form.setType(v as McpTransport)}` — cast není staticky ověřen; stejný vzor v `hooks/components/HookFormFields.tsx:164` (`v as HookEvent`).
Použít generickou variantu SelectField, nebo runtime guard sdílený oběma místy.

[SEVERITY: Low] [FILE: apps/web/features/mcp/components/McpServerCard.tsx a apps/web/features/hooks/components/HookCard.tsx] [CATEGORY: Duplicitní vzor / zobecnění]
Obě karty mají identickou strukturu (aside Tag+StatusDot, actions Stack s truncated mono textem + Configure Button nad HudCard) — liší se jen poli. `chains`' ChainCard naproti tomu HudCard vůbec nepoužívá — "jedna karta na katalogovou položku" je ve třech features realizována dvěma odlišnými vzory.
Zvážit sdílený `CatalogItemCard` primitive v DS a sjednotit i chains.

STATS: 44 souborů, 2448 řádků celkem. Top 3: chains/Screen.tsx (331), mcp/components/McpServerFormFields.tsx (268), hooks/components/HookFormFields.tsx (201).

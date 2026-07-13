BATCH: web-runs-core

[SEVERITY: Medium] [FILE: apps/web/features/runs/Screen.tsx:100-121] [CATEGORY: business-logic-in-component]
Odvozovací logika filtru (parsování `?filter=` do `FeedStatus[]`, `isBucket`, `activeBucketId`, `bucketCount`, `count`, `timeLabel`/`relative`) je napsaná přímo v komponentě, ne jako custom hook (`useRunsFeedFilter`) ani util modul — znesnadňuje unit test bez renderu celé stránky a soubor tím roste (295 řádků, těsně pod hranicí 300).
Doporučení: vytáhnout filter/bucket/time odvozovací logiku do samostatného hooku nebo `runsFeed.ts` util modulu, otestovat izolovaně.

[SEVERITY: Medium] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:86-127] [CATEGORY: duplicate-pattern]
`useRunGlyphMap`/`useRunAvatarMap` používají doslovné literály `["skills"]`, `["agents"]`, `["pipelines"]` jako query key místo importu kanonických `getSkillsQueryKey()` (existuje v `features/skills/queries`), `getAgentsQueryKey()` a `getPipelinesQueryKey()` (existují ve `features/agents`/`features/pipelines`) — riziko tichého rozjetí klíčů při refaktoru cizí domény.
Doporučení: importovat a použít kanonické `getXxxQueryKey()` z domén skills/agents/pipelines místo duplikace literálů.

[SEVERITY: Medium] [FILE: apps/web/features/runs/mutations/useAssignRunProjectMutation.ts:3] [CATEGORY: duplicate-pattern]
Všech 6 mutation souborů importuje `allTaskRunsKey` z `../queries/useRunsQuery` (re-export "pro existující importéry", viz komentář v `queries/keys.ts`) místo z kanonického, na Reactu nezávislého `../queries/keys` modulu, který byl explicitně vytvořen pro tento účel — nový kód by měl mířit na kanonickou cestu, ne na re-export.
Doporučení: přepnout import ve všech mutation souborech na `../queries/keys`.

[SEVERITY: Low] [FILE: apps/web/features/runs/mutations/useDeleteAgentRunMutation.ts:7-12] [CATEGORY: duplicate-pattern]
`useDeleteAgentRunMutation` a `useDeletePipelineRunMutation` jsou identická implementace (stejný `apiClient.taskRuns.deleteTaskRun.useMutation`, stejná invalidace) lišící se pouze jménem; totéž platí pro `useResumePipelineRunMutation` vs. `useResumeTaskRunMutation` (oba volají `resumeTaskRun.useMutation` beze změny).
Doporučení: zvážit sjednocení na jeden `useDeleteTaskRunMutation`/jeden resume hook (per-kind název zachovat jen v call-site, pokud je čitelnost důležitá) — nebo alespoň komentářem zdůvodnit, proč zůstávají oddělené.

[SEVERITY: Medium] [FILE: apps/web/features/runs/runEvents.tsx:93] [CATEGORY: missing-typing]
`JSON.parse(event.data) as RunStatusEvent` je nevalidovaný type cast — try/catch chytí jen syntaktickou chybu JSON, ne špatný tvar payloadu (chybějící/špatně typované `scope`/`runId`), takže SSE zpráva s neočekávaným tvarem projde beze varování a tiše rozbije `if (parsed.scope === …)` větvení.
Doporučení: validovat payload přes existující zod schéma (pokud kontrakt SSE eventů existuje) místo slepého `as`.

[SEVERITY: Medium] [FILE: apps/web/features/runs/useRunLogStream.ts:84] [CATEGORY: missing-typing]
Stejný vzor jako výše: `apply((await res.json()) as RunLogChunk)` a `apply(JSON.parse(event.data) as RunLogChunk)` (řádek 104) castují síťovou odpověď na `RunLogChunk` bez runtime validace.
Doporučení: sjednotit s runEvents.tsx nálezem — zavést sdílenou runtime validaci SSE/JSON payloadů (např. `RunLogChunkSchema.parse`) na jednom místě, ať se vzor neopakuje ve dvou souborech.

[SEVERITY: Low] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:49-54] [CATEGORY: convention-deviation]
`useRunsQuery` vrací `{ runs, isPending, isError, refetch }` místo přímého výsledku `useQuery`, což je explicitní odchylka od projektové konvence pro query hooky. Zdůvodněno v komentáři (mnoho call-sites destructuruje `runs`), ale je to trvalý precedent, který se v mutation-import vzoru dál replikuje.
Doporučení: ponechat jako vědomou výjimku, ale zvážit, zda nový kód v této feature má tuto výjimku dál následovat, nebo se řídit konvencí.

[SEVERITY: Low] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:98-100] [CATEGORY: missing-typing]
`s.glyph as IconName` / `a.glyph as IconName` castuje řetězcové pole z katalogu bez runtime kontroly, že jde o platný `IconName`.
Doporučení: buď typovat `glyph` v kontraktu jako `IconName` union přímo, nebo validovat/fallbackovat na výchozí glyph při neplatné hodnotě.

[SEVERITY: Low] [FILE: apps/web/features/runs/runEvents.tsx:1-192] [CATEGORY: coupling]
`RunEventsProvider` importuje query-key buildery z 9+ cizích domén (agents, approvals, chains, projects, overview×3, integrations, pipelines, tasks) do jednoho `onmessage` handleru s dlouhým if/else-if řetězcem přes `scope` — funkčně zdůvodněno jako centrální invalidation hub, ale zvyšuje "blast radius" jednoho souboru při každé změně cizí query-key struktury.
Doporučení: pokud řetězec dál poroste, zvážit rozpad na mapu `scope → handler[]` registrovanou z jednotlivých domén (inverze závislosti), místo že `runs` zná klíče všech ostatních.

[SEVERITY: Low] [FILE: apps/web/features/runs/Screen.tsx:256-281] [CATEGORY: prop-drilling]
`RunDetail` dostává 10 jednotlivých primitivních/derivovaných props (`avatar`, `deleting`, `glyph`, `now`, `onDelete`, `onResume`, `onStop`, `resuming`, `run`, `stopping`) místo menšího tvaru (např. `run` + `actions`-bag z `useRunActions`), což zvyšuje šanci na nekonzistenci při přidání další akce.
Doporučení: zvážit předání `RunActions` objektu (z `useRunActions`) přímo místo jeho rozbalení na jednotlivé props na volajícím místě.

STATS: 21 souborů, celkem 1483 řádků. Top 3 podle počtu řádků: Screen.tsx (295), run.ts (276), runEvents.tsx (192).

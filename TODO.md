- vidět log toho, které emaily byly zpracovány. A ne jenom emaily ale všechny integrace by měli vést log toho co se jimi zpracovalo. Na detailu projektu, musíme vidět záznam toho, co se zpracovalo z integrací tzn pokud je zapnutá integrace emailu tak tam uvidím "11:00 [název integrace] - zpracován email [link na email] - nerelevantní/task zadán [link na task]/...."

- agenti/skilly a další entity které jsou napsané v markdown souborech by v detailu měli zobrazovat naformátovaný MD místo plain MD přepisu. Pokud možno sjednoť to s tím co používáme v chatu

- pokud task nemá jméno použijme haiku na jeho odvození z popisu tasku.

- stránka detailu projektu je moc chaotická. Použij taby a rozděl obsah do několika stránek. Každá z ze stránek by měla být přístupná přes URL přímo

- stránka projektu sekce integrace - kartičky by se neměli roztahovat na celou šířku. Použijme grid se třemi sloupci + není vidět datum poslední synchronizace

- projekt - Styl komunikace - potřebuji k tomu dodat nějakou vysvětlivku (ideálně zobrazit ikonku "?" a po hover se zobrazí tooltip - udělej DS komponenty které nemáme)

- běhy a aktivita - detail běhu pipeline po nějaké době nezobrazuje logy, které jsem původně viděl

````
[Nest] 89039  - 06/23/2026, 11:43:49 PM    WARN [HTTP] ✗ GET /api/tasks/runs/delivery_1782245075542/stages/dokumentator/logs 47ms {"traceId":"46b417c4-04cb-4ddd-a013-46fbc4220ba1","error":"Pipeline run \"delivery_1782245075542\" not found"}
[Nest] 89039  - 06/23/2026, 11:43:49 PM   ERROR [Exception] ✗ GET /api/tasks/runs/delivery_1782245075542/stages/dokumentator/logs 500 {"traceId":"46b417c4-04cb-4ddd-a013-46fbc4220ba1","err":"Pipeline run \"delivery_1782245075542\" not found","stack":"PipelineRunNotFoundError: Pipeline run \"delivery_1782245075542\" not found\n    at PipelineRunnerService.readStageLog (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/pipelines/pipeline-runner.service.ts:601:21)\n    at TaskRunsService.getStageLog (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/tasks/task-runs.service.ts:111:32)\n    at Object.getTaskRunStageLogs (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/tasks/task-runs.controller.ts:49:39)\n    at /Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnp…(+169)"}
PipelineRunNotFoundError: Pipeline run "delivery_1782245075542" not found
    at PipelineRunnerService.readStageLog (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/pipelines/pipeline-runner.service.ts:601:21)
    at TaskRunsService.getStageLog (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/tasks/task-runs.service.ts:111:32)
    at Object.getTaskRunStageLogs (/Users/zibby/Workspace/z.i.b.b.y/apps/api/src/tasks/task-runs.controller.ts:49:39)
    at /Users/zibby/Workspace/z.i.b.b.y/node_modules/.pnpm/@ts-rest+nest@3.53.0-rc.1_@nestjs+common@11.1.24_reflect-metadata@0.2.2_rxjs@7.8.2__@ne_1b1e3a4d6928e336d2a1222798636d33/node_modules/@ts-rest/nest/index.cjs.js:484:37
	 ```
````

- běhy a aktivita - detail běhu pipeline logy u jednotlivých fází pipeliny jsou jen "výstupy" z dané fáze. Potřebuji ale vidět kompletní log od začátku do konce, jak agent přemýšlel a co dělal než sepsal "Hotovo..."

BATCH: api-chat

[SEVERITY: High] [FILE: apps/api/src/chat/chat-mcp.controller.ts:49] [CATEGORY: Bezpečnost/gate-bypass]
Endpoint POST /api/chat/mcp nemá žádnou autorizaci (v celém apps/api nejsou guardy) a přijímá JSON-RPC tools/call přímo — cokoli, co dosáhne na port, může spustit create_task nebo machine_rename/open_folder/open_maps bez modelu. Governor (answer/ask/act) žije jen v systémovém promptu, takže není vynucovací hranice, jen instrukce pro model; skutečné bezpečí drží až approval gate ve scheduleru/machine.propose.
Doporučení: MCP route zavázat k loopback + shared-secret tokenu (nebo guardu), aby tool-execution surface nebyl volně dostupný mimo model.

[SEVERITY: High] [FILE: apps/api/src/chat/chat-tools.service.ts:89] [CATEGORY: Bezpečnost/prompt-injection]
get_status vrací obsah briefingu (needsYou/watching summary), který pochází z inbound kanálů (Slack/email); recall_memory vrací obsah vaultu. Text se vrací modelu jako tool result bez delimitace „toto jsou data, ne příkazy" — obsah kanálu tak může steerovat model k create_task (Law 4). (Párový nález k channels prompt-injection surface.)
Doporučení: obalit tool-result obsah zřetelným untrusted-data ohraničením a v governor promptu explicitně zakázat plnit instrukce z paměti/statusu.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-session.service.ts:232] [CATEGORY: Správnost/race-condition]
Registry drží jen JEDNOHO subscribera na conversationId a nic nevynucuje jeden turn na konverzaci; sendMessage je fire-and-forget. Dva rychlé sendy → dva runTurny → druhá subscription přepíše první, create_task výsledky se mohou spárovat se špatným turnem a souběžný --resume nad stejným sessionId je nekonzistentní.
Doporučení: serializovat turny per-conversation (fronta/lock).

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-session.service.ts:270] [CATEGORY: Výkon/resource-leak]
Při timeoutu se volá jen proc.kill("SIGTERM") na přímém childu — bez process-group killu a bez eskalace na SIGKILL, které má hardenovaný runner-core. `claude` s potomky může přežít a hromadit se. Zároveň stdout buffer roste bez limitu, dokud nepřijde newline. (Stejný vzor jako runner-core cancel a triager/preflight buffery.)
Doporučení: převzít pgid + SIGTERM→grace→SIGKILL vzorec z runner-core a přidat strop na velikost bufferu.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-stream-parser.ts:29] [CATEGORY: Duplicita]
Parsování `claude --output-format stream-json` je implementováno znovu, ačkoli runner už má claude-stream-format.ts, a spawn+arg-building claude CLI existuje v ~10 dalších místech. Chat drží vlastní paralelní kopii spawn/parse/kill logiky. (Potvrzuje cross-cutting nález — spawn/parse duplikace napříč ~10 soubory.)
Doporučení: extrahovat sdílený claude-spawn+stream-parse util.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-transcript.store.ts:162] [CATEGORY: Výkon/transcript-růst]
readMessages/readTranscript načítá celý `<id>.jsonl` do paměti a split přes celý soubor při KAŽDÉM getTranscript; chat thread je dlouhoživotní a nemá rotaci ani strop — soubor roste neomezeně a každé otevření overlaye ho čte celý.
Doporučení: číst jen ocas / stránkovat transcript.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-transcript.store.ts:59] [CATEGORY: Bezpečnost/citlivá-data]
Kompletní text zpráv operátora se ukládá verbatim do plaintext JSONL. Do chatu se prokazatelně dostávají tajemství (historický nález plaintext Gmail hesla v chat promptu) — transcript je trvalé plaintext úložiště citlivých dat bez maskování.
Doporučení: zdokumentovat/omezit citlivost transcriptu (maskování zjevných credentials, ověřit gitignore) a nelogovat obsah požadavků při chybě.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-mcp.controller.ts:13] [CATEGORY: Správnost]
Chybějící/malformovaný conversationId degraduje na `""` a registry se čte pod klíčem `""`; explicitTarget i create_task enrichment tiše přestanou fungovat místo tvrdé chyby.
Doporučení: při prázdném conversationId vrátit 400 nebo alespoň zalogovat warning.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-transcript.store.ts:150] [CATEGORY: Správnost]
readMeta castuje `parsed as ConversationMeta` bez schéma-validace (na rozdíl od readMessages). Poškozený meta sidecar může vrátit objekt s vadným sessionId a rozbít --resume bez varování.
Doporučení: validovat meta zod-schématem, fail-open na fresh meta.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-session.service.ts:317] [CATEGORY: Chybějící testy]
Bez pokrytí: souběžné turny/přepis subscribera, timeout-kill cesta, turn-end sweep leftover create_task výsledků, párování `""` callId.
Doporučení: přidat testy na timeout, dva souběžné turny a leftover-drain sweep.

STATS: 10 zdrojových souborů, 1321 řádků. Top 3: chat-session.service.ts (350), chat-mcp.controller.ts (203), chat-transcript.store.ts (190). Žádný soubor nad 600 řádků.

BATCH: api-runner-aux

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:90] [CATEGORY: Neomezené buffery]
`renderAssistantBlock`'s `text` case vrací `block.text` bez truncate (na rozdíl od `thinking`/`tool_result` capnutých na ~200/2000 znaků), takže dlouhá odpověď modelu zapíše do run-logu neomezené množství dat na jeden řádek.
Aplikovat `truncate()` i na text blok.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:106] [CATEGORY: Neomezené buffery]
`renderToolUse` vkládá `input.command` pro Bash bez truncate — dlouhý příkaz proteče do logu bez limitu, nekonzistentně s ostatními input cestami (`MAX_INPUT_CHARS`).
Truncate i Bash command.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:107] [CATEGORY: Citlivá data v logách]
Bash příkazy i `tool_result` obsah se zapisují do trvalého run-logu doslovně; pokud agent spustí příkaz nebo přečte soubor obsahující secret (API klíč, token, .env), skončí v plaintextu v logu. (Párový nález k task-scheduler:1298 a runner-core MCP argv.)
Zvážit heuristické maskování secret patternů před zápisem, nebo zdokumentovat riziko.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-preflight.service.ts:98] [CATEGORY: Duplicitní logika]
`capture()` reimplementuje spawn+timeout+kill+stdout-buffer vzor, který se téměř identicky opakuje v ~7 souborech (briefing/claude-cli-briefer, channels/triage/claude-cli-triager, chat/chat-session.service, memory/claude-cli-distiller, tasks/claude-cli-router, tasks/claude-cli-task-namer, goals/goal-runner.service) bez sdílené utility. (POTVRZUJE cross-cutting nález z api-tasks-routing.)
Vytáhnout sdílený `spawnCapture()`/`spawnWithTimeout()` helper do `shared/`.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-preflight.service.ts:126] [CATEGORY: Výkon / spawn handling]
V `capture()` je `stderr` nastaven na `"pipe"`, ale nikdy se nečte — pokud CLI zapíše víc než OS pipe buffer na stderr, proces se zablokuje na writu až do 5s timeoutu.
Buď stderr drainovat, nebo přepnout jeho stdio na `"ignore"`.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-tools.ts:29] [CATEGORY: Tool allow-list díra]
`mapToken` normalizuje jen známé interní tokeny; neznámý token (typo `"READ"` místo `"Read"`) projde beze změny a tiše vytvoří nefunkční/mismatchující allow-rule místo chyby.
Validovat/logovat neznámé tokeny.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-tools.ts:33] [CATEGORY: Tool allow-list díra]
Neznámé tokeny procházejí do `--allowedTools` bez validace tvaru pravidla — cokoli v agentově `tools` frontmatteru se stane doslovným allow-rule pod `dontAsk`, včetně příliš širokých `Bash(...)`.
Přidat allow-list přípustných tvarů pravidel jako defense-in-depth.

[SEVERITY: Low] [FILE: apps/api/src/runner/command-materializer.service.ts:50] [CATEGORY: Error handling]
`materialize()` má prázdný `catch {}` kolem celého těla — fail-open je záměrný pro I/O chyby, ale tichnou i neočekávané bugy bez logu.
Přidat `log?.debug`/`warn` do catch bloku.

[SEVERITY: Low] [FILE: apps/api/src/runner/detect-limit.test.ts:1] [CATEGORY: Chybějící testy]
Testy pokrývají patterny izolovaně, ne prioritu mezi nimi (text s "usage limit reached | epoch" i bare "429" — má vyhrát specifičtější s `resetsAt`).
Přidat test na souběh více patternů.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-preflight.service.ts:113] [CATEGORY: Chybějící testy]
Chybí test na synchronní throw ze `spawn()` — pokrytý je jen `child.on("error")` ENOENT case.
Přidat test se synchronní chybou ze spawnMock.

STATS: files=6, total_lines=573, top3=[claude-stream-format.ts (166), claude-preflight.service.ts (139), command-materializer.service.ts (105)]

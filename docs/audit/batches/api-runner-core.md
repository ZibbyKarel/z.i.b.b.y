BATCH: api-runner-core

[SEVERITY: High] [FILE: apps/api/src/runner/runner-core.ts:551] [CATEGORY: Zombie procesy / kill process group]
`cancel()` na běžícím runu volá `handle.child.kill()` — pošle SIGTERM jen vedoucímu skupiny, NE celé detached procesní skupině. Protože child běží `detached:true`, jeho potomci (nástroje spuštěné claude, např. `npm test`, `git`) zůstanou po zabití leadera osiřelí a běží dál. Ostatní teardown cesty (`shutdown`, `delete`, `denyIntent`, Variant-B reject) správně používají `killGroup(pgid)` — jen primární uživatelské „stop" ne.
Doporučení: v cancel běžící větvi nahradit `handle.child.kill()` za `killGroup(handle.run.pgid ?? handle.run.pid)`.

[SEVERITY: High] [FILE: apps/api/src/runner/claude-run-command.service.ts:151] [CATEGORY: Bezpečnost / approval gate coverage]
`OPERATING_CONTRACT` i `EXECUTION_DIRECTIVE` instruují agenta „nikdy se neptej, jen to spusť — gate to zachytí", a kontrakt slibuje „covers delete, overwrite, move, and any other external effect". Hook (`isDestructive`/`classify`) ale gatuje jen rm-family, `find -delete`, `git clean`, push/PR/gh-api — NErozpozná overwrite/move: `mv`, `> file` (truncate/redirect), `cp` přepis, `dd`, `truncate`, `sed -i`, `tee`, `install`. Slibovaná bezpečnostní záruka není vynucená.
Doporučení: rozšířit denylist o move/overwrite idiomy, nebo sladit text kontraktu s reálným pokrytím.

[SEVERITY: High] [FILE: apps/api/src/runner/runner-core.ts:1176] [CATEGORY: Výkon / neomezený buffer]
`readLastProgress` čte CELÝ log do paměti přes `fs.readFile(logFile,"utf8")` kvůli poslednímu `PROGRESS` řádku — přesně ten neohraničený alloc, proti kterému `MAX_LOG_READ_BYTES` chrání. Volá se při restart-reconcile (`init`) a při smrti orphana (`monitorPgid`); několikasetMB log = OOM.
Doporučení: číst jen tail souboru (posledních ~64 KiB) a hledat PROGRESS v něm.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-approval-hook.mjs:67] [CATEGORY: Bezpečnost / denylist bypass]
`RM_FAMILY` vyžaduje před `rm` hranici `[\s;&|(\`]`, takže path-kvalifikovaný binár projde: `/bin/rm foo` se NErozpozná jako destruktivní. Podobně `command rm`, `\rm`, `busybox rm` nejsou pokryty.
Doporučení: přidat `/`-boundary do třídy znaků nebo tokenizovat a porovnávat basename.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-run-command.service.ts:466] [CATEGORY: Bezpečnost / citlivá data v argv]
`buildMcpConfig` vkládá tajemství (creds.env, `Authorization: Bearer <authToken>`, secret headers) do `--mcp-config` JSON předávaného jako inline argv řetězec. Argv je čitelné pro každého lokálního uživatele přes `ps`/`/proc/<pid>/cmdline` — tokeny leakují.
Doporučení: předávat MCP config souborem (jako u `--append-system-prompt-file`), ne inline argv.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:1092] [CATEGORY: Race condition / gate protokol]
Gate koordinace je jeden `intent-request.json` + jeden `intent-decision.json` na sandbox, klíčováno jen podle `cwd`. Dva souběžné gated tool-cally v jednom runu: druhý request přepíše první dřív, než ho 200ms poll přečte (ztracený request → hook blokuje do 24h deadline → fail-closed), a jedno decision může uvolnit nesprávný/oba hooky. Bez bypassu, ale nedeterministické.
Doporučení: korelovat request/decision přes unikátní id.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:943] [CATEGORY: Výkon / neomezený buffer]
`residual` akumuluje částečné řádky mezi chunky bez horní hranice — jednořádkový obří výstup (velký JSON event, binární data bez newline) roste neomezeně v RAM.
Doporučení: cap na délku residual, analogicky k `MAX_LOG_READ_BYTES`.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:246] [CATEGORY: Duplicitní logika]
Blok „readdir → filtr .json → readFile → parse → schema.safeParse" duplikovaný v `init()` a `listAll()`; trojnásobný vzor reconcile-to-interrupted + writeSidecar + warn v `init()`.
Doporučení: extrahovat `loadSidecars()` helper a sdílenou reconcile funkci.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:399] [CATEGORY: Duplicitní logika]
`start()` a `resume()` (respawn větev) duplikují celý spawn boilerplate: identické `spawn(...)`, createWriteStream, pid/pgid, `wire`, writeSidecar, emitStatus.
Doporučení: extrahovat privátní `spawnInto(handle, spec)`.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:1013] [CATEGORY: Správnost]
`onChunk` je připojen na stdout I stderr — PROGRESS/INTENT/result-cost se parsují i ze stderr; řádek `INTENT {…}` na stderr spustí gate flow, `result` event dvojité započtení ceny.
Doporučení: parsovat control eventy jen ze stdout.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:341] [CATEGORY: Cleanup při shutdownu]
`reapOnShutdown` odejde brzy při `!handle.child` — orphan znovupřipojený přes `monitorPgid` NENÍ při shutdownu zabit, přestože doc říká „kill any still-live children".
Doporučení: zdokumentovat záměr, nebo orphan-pgid také killGroupnout.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-run-command.service.ts:471] [CATEGORY: Bezpečnost / nesanitizované cesty]
`grantDirs` jdou do `--add-dir` verbatim bez kontroly (absolutní/existující). Sanitizace je odpovědnost callera — v tomto souboru žádná pojistka (defense-in-depth gap, párový nález k task-scheduler:919).
Doporučení: defensivní kontrola zde, nebo zdokumentovat invariant callera.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.test.ts:551] [CATEGORY: Díra v test pokrytí]
Bez testu: (1) cancel() zabije celou skupinu (test by dnešní chybu odhalil), (2) readLastProgress na velkém logu, (3) gate gap na mv/>/bin-rm, (4) souběžné gate requesty, (5) reapOnShutdown když child skončil.
Doporučení: doplnit; cancel-kills-group a overwrite/move gate jsou bezpečnostně nosné.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:144] [CATEGORY: Velikost souboru]
`runner-core.ts` má 1244 řádků — míchá persistenci, gate koordinaci, lifecycle spawn/wire a limit-pause logiku.
Doporučení: rozdělit na runner-persistence / runner-intent-gate / runner-limit-pause / process-utils, jádro jako orchestrátor.

STATS: 6 souborů, ~4041 řádků vč. testů. Top 3: runner-core.ts (1244), runner-core.test.ts (1098), claude-run-command.service.ts (615).

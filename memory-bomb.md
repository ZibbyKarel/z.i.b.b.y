Proč ti loop sežral pamět — RCA

TL;DR

Nešlo o jeden „nekonečný cyklus" ani o jeden přetékající buffer (oba jednoduché příběhy jsem adversariálně vyvrátil). Příčina je strukturálně neohraničená těžká zátěž bez jakéhokoliv resource governance: každá iterace loopy spustí vícenásobně celý monorepo vitest run + reálné claude -p agenty, nic z toho není timeoutované, capnuté, killnuté při shutdownu ani reapnuté — a reconstruct() ten běžící goal re-dispatchne na každém startu serveru. Puštěno proti samotnému ZIBBY monorepu na dev serveru (ts-node-dev) to kumulativní a překrývající se pamětí vyčerpalo RAM.

Co se reálně stalo (forenzně z disku)

Běh loop-1-mqcsht24_1781382266922 (run.json + verdict soubory):

- status: running, 3 iterace, projectPath: undefined → žádný projekt → žádný worktree. Verifier proto běžel s cwd = run.cwd = apps/api/data/goals/runs/<id> — uvnitř repa.
- iter 0 a 1: verifier.satisfied = false; iter 2: running ve chvíli pádu stroje.
- Iterace byly ~10–13 min od sebe → každá iterace = celý reálný maker pipeline + plný test suite.
- iteration-0.verdict.txt zachytil verifierův vitest run: 56 s, 633 passed / 8 failed / 33 errors, a v něm tenhle stack trace:
  Serialized Error: { id: 'delivery' } ← PipelineNotFoundError
  ❯ PipelineRunnerService.start pipeline-runner.service.ts:187
  ❯ GoalRunnerService.dispatchMaker goal-runner.service.ts:482
  ❯ GoalRunnerService.drive goal-runner.service.ts:232
  This error originated in "test/pipelines.e2e.test.ts"
- To je loop, který re-dispatchuje sám sebe zevnitř svého vlastního test runu. iteration-1.verdict.txt totéž o patro hloub (AgentNotFoundError "architekt" uvnitř observability.e2e.test.ts).

Řetězec (potvrzené defekty, seřazené dle dopadu)

1. Verifier = celý monorepo pnpm test, a ten bo pohání.
   Goal má verifier: { kind: checks } bez commands. To padá na DEFAULT_VERIFY_CHECKS = ["pnpm lint", "npx tsc --noEmit", "pnpm
   test"] (libs/contracts/src/pipelines/pipeline.sbin/sh -c (goal-runner.service.ts:390-397,runShell :420-433). pnpm test = vitest run přes všech 6 projektů → apps/api e2e suity bootují plný AppModule (každý = GB RSS,
   imapflow, démoni).

2. Dvojitá verifikace na iteraci. Maker je pipemá verify fázi (Tester) s loop.maxRetries: 3 zpět na kodéra → až 4× pnpm lint && tsc && pnpm test na jeden pipeline run (pipeline-runner.service.ts:1081-1088 +
   delivery.pipeline.md). A drive() pak bezpodmínení checks verifier (goal-runner.service.ts:248) → další pnpm test. Worst-case ≈ 12–30 plných test suitů na 6 iterací.

3. Reálný claude mód. AGENT_RUNNER_MODE=claude (apps/api/.env:4, žádný CLAUDE_BIN) → každá fáze pipeline
   (architekt/kodér/review/dokumentátor/pr-autor) session (claude-run-command.service.ts:251-253).

4. Nula resource governance. runShell spawnuje z AbortController, bez child.kill() a childreference nikam neukládá (goal-runner.service.ts:420-433). GoalRunnerService jako jediná z 8 background služeb nemá
   onModuleDestroy/shutdown (:71) — verifier childol osiří při killu/respawnu serveru. Žádnýdeadline na drive().

5. reconstruct() re-dispatch na každém bootu. Na onModuleInit přečte všechny run.json a každý running/paused-limit goal znovu
   nažene (goal-runner.service.ts:760-811). Protožirname, ne na cwd (shared/data-dir.ts:17), ačást e2e suit neizoluje GOAL_RUNS_DIR, booting appky během pnpm test čte reálný data dir a re-dispatchne živý goal → přesně
   ty stack traces z verdiktů.

Minor / latentní (tentokrát nevybuchlo, ale je

- Worktree se řeže do apps/api/data/goals/runs/<id>/worktree — uvnitř repa, uvnitř watchovaného/lintovaného/testovaného
  stromu (goal-runner.service.ts:151). Nevystřelit. Měl bys ho mít mimo repo (os.tmpdir()).
- runShell akumulátor outputu je necapnutý (real, ale verdikt měl jen 4,2 KB — nebyl to OOM driver).
- waitForMaker 40 ms poll bez backoffu (:527-55

Co příčinou NEBYLO (ať to nehoníš)

Adversariální pass vyvrátil: writeAggregate fd/eFile, ne atomic), log akumulace v paměti(streamuje se na disk), runs Map / EventEmitter / WriteStream leaky, „nested retry matrix" (retry je jedna sdílená mapa per
phase), a teorii že OOM způsobil necapnutý outp

⚠️ Urgentní — než pustíš server

Goal loop-1-mqcsht24_1781382266922 je na disku m api:dev ho reconstruct() znovu nažene a bombabouchne znovu. Před startem:

rm -rf apps/api/data/goals/runs/loop-1-mqcsht24_1781382266922 \
 apps/api/data/goals/runs/loop-1-mqcika59
(plus zvaž dočasně AGENT_RUNNER_MODE=demo v apps/api/.env, než budou opravy.)

Doporučené opravy (dle priority)

1. Verifier nesmí bootovat appku, co loop pohání. Defaultní pnpm test (= plný vitest run přes API e2e) je pro goal mířící na
   ZIBBY monorepo patologický. Buď scopovat checks lint/typecheck jen apps/web), nebo vyžadovatexplicitní commands/project checks místo těžkého fallbacku.
2. Resource governance v runShell: timeout (jakroller, detached + vlastní process group, childuložit a přidat OnApplicationShutdown na GoalRunnerService, který killne in-flight verifier i driver (zrcadlo
   runner-core.shutdown()).
3. Nedělat dvojitou verifikaci — pipeline delivery už Tester má; goal checks nahoře pouští celý suite ještě jednou.
4. Zabezpečit reconstruct() re-dispatch — nenahtomaticky na každém (re)startu, hlavně ne podts-node-dev --respawn.
5. Izolovat GOAL_RUNS_DIR/GOALS_DIR v e2e harnena onModuleInit re-dispatchne živé goaly zjakéhokoliv bootu appky, pokud dir není přebitý).
6. Worktree mimo repo (os.tmpdir()), plus auto-o checkouty).

Chceš, abych některou z těch oprav rovnou implelíčkem #1 + #2 + #3 (to zlomí bombu) nasamostatné větvi — řeknu si o které a pustím se do toho.

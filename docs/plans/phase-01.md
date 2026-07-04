# Plán: Restrukturalizace pipeline run adresářů

> Motivace: audit `code-audit_1783163824914` ukázal, že každá fáze si do vlastní
> složky kopíruje bajtově identický (jen kosmeticky přeformátovaný) obsah
> výstupu předchozí fáze — `quality/security.md`, `performance/quality.md`,
> `report/performance.md` jsou duplicity `security/security.md`,
> `quality/quality.md`, `performance/performance.md`. Je to zbytečné pálení
> místa a příležitost pro agenta soubor při čtení "přepsat" (drift od
> kanonického zdroje). Tento plán zavádí (1) sekvenční číslování složek fází
> podle pořadí volání, (2) předávání vstupu mezi fázemi odkazem místo kopie,
> (3) sdílenou `context/` složku pro vstupy celé pipeliny a (4) `output/`
> složku pro finální výstup běhu.

---

## Zjištění (současný stav)

Vše ověřeno přímo v kódu, `apps/api/src/pipelines/pipeline-runner.service.ts`
(dále jen `runner.ts`), soubor `libs/contracts/src/pipelines/{pipeline,pipeline-run}.schema.ts`:

- **Kořen běhu**: `start()` vytvoří `root = path.join(this.dir, pipelineRunId)`
  (runner.ts:242-244).
- **Složka fáze**: `stageCwd = path.join(run.cwd, phase.id)` (runner.ts:771) —
  jen `phase.id`, žádné číslo, žádné pořadí volání.
- **Handoff je kopie, ne odkaz**: `placeHandoff()` (runner.ts:1525-1539) dělá
  `fs.copyFile(source, dest)`, kde `source` je `path.join(stageCwd, phase.produces)`
  z předchozí fáze (runner.ts:859) a `dest` je cesta uvnitř nové fáze podle jejího
  vlastního `phase.consumes` (schema komentář: `consumes`/`produces` jsou
  "RELATIVE paths inside the stage's sandbox" — `pipeline.schema.ts:47-50`).
  `fs.copyFile` je bajtově věrná kopie — pozorované kosmetické rozdíly (zarovnání
  tabulek, `_x_` vs `*x*`) tedy nemůže způsobit samotné kopírování; musí je
  způsobit agent, který má do svého celého `stageCwd` (včetně zkopírovaného
  vstupu) zápisová práva a soubor si při čtení/psaní "omylem" přepíše.
- **Agent dostává i absolutní cestu**: `consumesAbs`/`producesAbs` (runner.ts:~1605-1607)
  se počítají a předávají do `buildStageTask` jako absolutní cesty — takže
  fyzická kopie do sandboxu fáze je dnes čistě redundantní vůči informaci, kterou
  agent už dostává v tasku.
- **`.zibby-system-prompt.md`** (`systemPromptDir: cwd`, runner.ts:~1629) skládá
  `OPERATING_CONTRACT + grounding (vault) + resumeContext + agent.instructions`
  — **neobsahuje** obsah předchozí fáze, jen cesty v task textu.
  (`claude-run-command.service.ts`, `withOperatingContract`.)
- **Žádná `context/`/`output/` složka dnes neexistuje.** Kořen běhu (`run.cwd`)
  slouží ad hoc pro `run.json`, `PROGRESS.md`, `input.md`, `<phaseId>.failure.txt`
  apod. Finální `file` výstup se zapisuje přímo do projektu/vaultu
  (`deliverFileOutput`, runner.ts:1025-1090), ne do samostatné složky běhu.
- **Opakování fáze ve smyčce** (`loop.to`): `run.stageRuns.push(...)` se volá na
  více místech (runner.ts:803, 824, 917) — **každé** spuštění fáze, včetně
  návratu smyčkou, přidává nový záznam do `stageRuns` (pole roste chronologicky
  v pořadí volání). `attempt` je samostatné číslo v rámci `StageRunSchema`
  (`pipeline-run.schema.ts`), počítající kolikátý je to běh dané `phaseId`
  (pro eskalační žebříček v `PhaseLoopSchema.escalation`) — **nekříží se** s tím,
  že složka je pořád jen `phase.id`: `stageCwd` se při opakování přepočítá na
  stejnou cestu (runner.ts:771), takže druhé spuštění `developer` fáze **přepíše**
  soubory z prvního spuštění ve stejné složce.
- Vedlejší závislosti na plochém `phase.id` jménu složky, které je třeba změnit
  spolu s hlavní změnou: `phaseDirs` dedup v artifact-lookupu (runner.ts:~698-702,
  `for (const s of run.stageRuns) phaseDirs.add(s.phaseId)`) a
  `resolveOutputSource()` (runner.ts:997-1005, `path.join(run.cwd, phase.id, fromName)`).
  Obě dnes najdou "tu jednu" složku fáze; po zavedení číslování musí najít
  **poslední** (nejnovější) běh dané `phaseId`.

---

## Cíl

1. Složky fází pojmenované podle **pořadí volání v běhu**, ne podle definice v
   pipeline — `01_architekt`, `02_developer`, `03_code-review`, `04_developer`,
   `05_code-review`, … Tolerantní ke smyčkám (stejná `phaseId` se objeví
   vícekrát s různým číslem).
2. Každá fázová složka obsahuje **jen svůj vlastní výstup**. Vstup z předchozí
   fáze se do další fáze předává **odkazem** (symlink), ne kopií obsahu.
3. Nová sdílená složka `context/` v kořeni běhu pro **vstupy celé pipeliny**
   (ne handoff mezi fázemi) — nalinkovaná odkazem do každé fázové složky.
4. Nová složka `output/` v kořeni běhu, kam se uloží **finální výstup pipeliny**,
   pokud je výstupem soubor (ne PR).

---

## Fáze 1 — Sekvenční číslování složek fází

- [x] Přidat pole `dir` (výsledné jméno složky, např. `"04_developer"`) do
      `StageRunSchema` (`pipeline-run.schema.ts`), zapsané v okamžiku dispatch.
- [x] V `runner.ts` počítat pořadové číslo jako `run.stageRuns.length + 1` v
      okamžiku, kdy se fáze **poprvé** spouští (ne při retry stejného pokusu —
      viz níže), zero-pad na 2 číslice (`01`, `02`, …).
- [x] Nahradit `stageCwd = path.join(run.cwd, phase.id)` (runner.ts:771) za
      `stageCwd = path.join(run.cwd, dirName)`, kde `dirName = \`${seq}_${phase.id}\``.
- [x] Rozlišit **nový dispatch fáze** (nová položka v `stageRuns`, dostane nové
      číslo) od **retry stejného pokusu** po chybě (stejná položka, stejná
      složka) — ověřit v `runner.ts` kolem `retries.get(phase.id)` (runner.ts:770)
      a míst, kde se `stageRuns.push` volá po chybě vs. po úspěchu/loop
      back-edge, aby retry nekonzumoval číslo navíc.
- [x] Upravit `phaseDirs` dedup (runner.ts:~698-702) a `resolveOutputSource()`
      (runner.ts:997-1005): obě dnes hledají složku podle `phase.id` — přepsat
      na hledání podle `stageRun.dir` **posledního** (nejnovějšího) záznamu dané
      `phaseId` v `run.stageRuns`.
- [x] Zpětná kompatibilita: staré/rozběhnuté runy na disku mají složky bez čísla
      (`security/`, `quality/`, …) a záznamy `StageRun` bez pole `dir`. Kód pro
      resume/lookup musí při chybějícím `dir` spadnout zpět na starý
      `phase.id`-only tvar cesty.

## Fáze 2 — Odkaz místo kopie mezi fázemi

- [ ] V `placeHandoff()` (runner.ts:1525-1539) nahradit `fs.copyFile(source, dest)`
      za `fs.symlink(source, dest)` (relativní symlink, aby přežil přesun celé
      run složky).
- [ ] Po dokončení fáze (jakmile je `produces` finální, fáze má terminální
      status) nastavit soubor `produces` na read-only (`fs.chmod(..., 0o444)`),
      aby ho následná fáze nemohla omylem přepsat přes symlink a poškodit tak
      kanonický zdroj zpětně.
- [ ] Ověřit, že sandbox/`--add-dir` grant (`grantDirs: [cwd]`, runner.ts okolo
      1615) pořád umožní čtení skrz symlink, když cíl leží mimo `stageCwd`
      (v předchozí fázi ve stejném `run.cwd`) — `run.cwd` už je v rozsahu, takže
      by to mělo fungovat bez dalšího grantu.
- [ ] `consumesAbs`/`producesAbs` (runner.ts:~1605-1607) zůstávají beze změny —
      agent i nadále vidí absolutní cestu v task textu; teď navíc ta cesta
      skutečně jen odkazuje na soubor, nekopíruje ho.
- [ ] Aktualizovat text v `build-stage-task.ts` (formulace "Vstup najdeš v
      ⟨path⟩"), aby explicitně říkal, že vstup je **read-only reference**,
      ne pracovní kopie.

## Fáze 3 — `context/` složka pro vstupy pipeline

- [ ] Zjistit/rozhodnout, zda pipeline schema dnes má nějaký koncept
      "pipeline-level input" odlišný od fáze-k-fázi `consumes`/`produces`
      (`input.md` v `run.cwd`, runner.ts:314, vypadá jako kandidát — ověřit před
      implementací, ať se nezavádí duplicitní mechanismus).
- [ ] Při `start()` (runner.ts:~242-244) vytvořit `context/` v kořeni běhu a
      zkopírovat do ní (skutečná kopie, ne symlink — zdroj může být mimo běh,
      např. dočasný upload) vstupní soubory pipeline.
- [ ] Při vytváření každé `stageCwd` (runner.ts:771) přidat symlink
      `stageCwd/context -> ../context` (relativní symlink na sdílenou složku),
      aby každá fáze měla vstupy pipeline dostupné bez duplikace.
- [ ] `context/` je read-only pro všechny fáze (chmod po zkopírování) — jsou to
      vstupy celého běhu, ne handoff mezi fázemi.

## Fáze 4 — `output/` složka pro finální výstup

- [ ] Vytvořit `output/` v kořeni běhu (lazy, při prvním `file` výstupu, nebo
      rovnou při `start()` pro konzistenci s `context/`).
- [ ] Rozhodnutí: `output/` je **zdroj pravdy** — poslední fáze, která produkuje
      finální artefakt, ho zapíše (symlinkem, stejně jako Fáze 2) do
      `output/<jméno>`, a `deliverFileOutput` (runner.ts:1025-1090) i
      `resolveOutputSource()` (runner.ts:997-1005) čtou **z `output/`**, ne
      napřímo ze složky poslední fáze. Zjednoduší to `resolveOutputSource` —
      místo hledání fáze podle `produces === fromName` stačí `output/<fromName>`.
  - Alternativa (zamítnuto): `output/` jako čistě archivní kopie vedle
    stávající logiky — zavrhnuto, protože by to znovu zavedlo duplicitní
    soubory přesně toho typu, který tento plán řeší.
- [ ] `deliverFileOutput` beze změny v logice doručení do vaultu/projektu, jen
      změna zdroje čtení.
- [ ] PR-based výstupy (`openPrOutput`) nejsou touto fází dotčené — nejde o
      soubor v `output/`.

## Fáze 5 — Zpětná kompatibilita a testy

- [ ] Existující doběhlé i rozběhnuté runy na disku zůstávají ve starém tvaru
      (`phase.id`-only složky, `run.json` bez `dir` polí) — runner je musí umět
      dál číst/resumovat beze změny chování (viz Fáze 1, poslední bod).
- [ ] Rozšířit `apps/api/src/pipelines/pipeline-runner.service.test.ts` a
      `pipeline-runner.outputs.test.ts` o:
  - pipeline se smyčkou (`developer → code-review → developer`) — ověřit
    číslování `01_developer, 02_code-review, 03_developer` a že obě `developer`
    složky existují nezávisle (nic se nepřepisuje).
  - handoff je symlink, ne kopie — `fs.lstat(dest).isSymbolicLink()`, a že
    `output/`/`context/` po zápisu skrz symlink čtou stejný obsah jako zdroj.
  - `context/` symlink je přítomný v každé fázi a ukazuje na sdílený soubor.
  - `output/` obsahuje finální artefakt po doběhnutí pipeline s `file` výstupem.
- [ ] Manuální smoke test: znovu spustit `code-audit` pipeline nad `kzphoto` a
      ručně zkontrolovat výslednou strukturu adresářů (žádné duplicitní
      `security.md`/`quality.md`/`performance.md` v cizích složkách).

---

## Otevřené otázky (rozhodnout před implementací)

- Šířka zero-padu čísla fáze — 2 číslice stačí pro běžné pipeliny, ale pipeline
  s mnoha smyčkami (>99 spuštění fází) by přetekla; buď pevně 3 číslice, nebo
  dynamicky podle odhadu horního limitu (`maxRetries` × počet fází v grafu).
- Jestli `input.md` (runner.ts:314) je totéž co plánovaná `context/` složka,
  nebo jde o jiný mechanismus, který je potřeba sladit/nahradit.
- Read-only chmod na symlinkovaný `produces` soubor (Fáze 2) — ověřit, že to
  nekoliduje s `checkpointPhase` (runner.ts, git checkpoint fáze na worktree
  branch), pokud ten po dokončení fáze na soubor ještě sahá.

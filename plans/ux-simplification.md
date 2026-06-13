# Plán — Zjednodušení UX: jeden vstup, libovolné provedení

> Status: návrh (proposal) · Branch: `claude/ux-simplification-qx6cky`
> Navazuje na: ROADMAP Phase 10 (loop engine), 3.1 (workspace manager), 7 (voice)

## Shrnutí (TL;DR)

Operátor **popíše úkol jednou větou** a ZIBBY sám rozhodne, _jak_ ho provede —
agent, pipeline, nebo smyčka (goal). To „jak" už uživatele nezajímá: je to
náhled za schvalovací bránou, ne formulář, který musí vyplnit. Detekované cesty
ve větě se stanou **prvotřídním udělením práv ke složce**, ne jen kontextovými
chipy. A protože vstup je jediné volné textové pole, je celý tok rovnou
**hlasově ovladatelný** — diktuji větu, ZIBBY přečte zpět, co udělá, a počká na
potvrzení u rizikových kroků.

Cíl není přidat funkce — je to **tenká vrstva nad už hotovým strojem**
(klasifikátor, goal engine, gate, projekty). Cokoliv, co zavání
reimplementací 10.x / 8.1 / 3.1, je chyba v návrhu.

---

## Proč to dnes drhne

Dnešní `NewTaskDialog` (`apps/web/features/tasks/components/NewTaskDialog.tsx`)
má **dvě záložky**:

- **Standard** — popis → (volitelně) titulek → kdy → jeden klik.
  `TaskClassifierService` na backendu už dělá přesně tu „magii", kterou chceme:
  claude‑p router + keyword fallback + terminální orchestrator pravidlo zvolí
  agenta/pipeline a `TaskSchedulerService.dispatch()` to spustí. **Tohle je
  správný tok.**
- **Loop** — `LoopComposer.tsx` je proti tomu plný ruční formulář: _objective,
  maker (agent/pipeline), verifier kind, commands/reviewer, max iterations,
  instructions_. Uživatel musí znát vnitřní pojmy systému („maker", „verifier",
  „reviewer") a ručně poskládat to, co u standardního tasku odvodí stroj.

Kořen problému je v klasifikátoru
(`apps/api/src/tasks/task-classifier.service.ts`): ten **goal/loop záměrně
nikdy nevybere** —

```ts
// isCoherent(): a goal (Phase 10) is explicit-only…
if (target.kind === "orchestrator" || target.kind === "goal") return false
```

— takže smyčka _musí_ být ruční tab. Druhá bolest: detekce cest
(`extractPaths`, `TASK_PATH_RE` v `task.ts`) běží jen ve Standard composeru a
končí jako **odebíratelný kontextový chip** — nikdy nevede k tomu, aby ZIBBY
dostal práva ke konkrétní složce. V Loop tabu se cesty neukážou vůbec.

---

## Cílový stav

1. **Jedno pole.** `NewTaskDialog` ztratí přepínač Standard/Loop. Zůstane:
   popis (autofocus, hlasem plnitelné) + plánování (Teď / Za 1 h / Po resetu
   limitů). Žádné „makery" a „verifiery" na první obrazovce.
2. **Režim je náhled, ne formulář.** Po klasifikaci ZIBBY ukáže kompaktní
   „Udělám tohle…": _režim_ (agent / pipeline / smyčka / orchestrator) + cíl +
   u smyčky stručně verifier a strop iterací. Pod tím nenápadné **„Upravit"**
   (disclosure), které teprve odhalí dnešní pokročilá pole — předvyplněná
   odvozenými defaulty. Power‑user kontrolu neztrácíme, jen ji přestáváme
   vnucovat.
3. **Cesty = scoped práva.** Každá detekovaná cesta se vyřeší proti známým
   projektům (`matchProject`). Patří‑li do projektu → odznak „scoped to
   <projekt>". Nepatří‑li → akce **„Udělit přístup"**, která složku zaregistruje
   jako workspace root (gateovatelné, Tier 3). Cesta tím přestává být jen
   keyword a stává se **pracovním adresářem běhu**.
4. **Hlas plní totéž pole.** `VoicePanel` přepíše řeč rovnou do composeru;
   ZIBBY přečte zpět odvozený plán a u rizikových akcí počká na potvrzení.

---

## Kroky (každý se svými testy)

### Krok 1 — Klasifikátor se naučí „tvar smyčky" (backend)

**Co.** Rozšířit klasifikační odpověď o `mode` a — pro smyčku — o `proposedGoal`
(editovatelné defaulty). Klasifikátor smí nově vrátit `kind: "goal"` se
**syntetizovanou definicí**:

- _maker_ = nejlépe odpovídající agent / pipeline, jinak orchestrator,
- _verifier_ = defaultně projektové checks (lint/tsc/test, per‑project override —
  znovupoužít 2.1 verify‑stage assembly),
- _maxIterations_ = rozumný default,
- _objective_ = popis.

Signál „tohle je smyčka" stojí na dvou nohách, aby fungoval i bez LLM:

- **Primárně** LLM router (rozšířit jeho prompt o čtvrtou možnost „goal").
- **Fallback** deterministické cue ve `KeywordScorer`: „dokud", „opakuj",
  „dokud neprojde", „until it passes", „keep trying", „retry until" → loop shape.

Snít defaulty na backendu (ne v UI) drží „files‑as‑truth" a dělá tok stejně
chytrým pro hlas i pro kanály (Slack/email triage to dostane zadarmo).

**Soubory.** `task-classifier.service.ts` (zrušit blanket‑exclude goalu,
přidat synthesizer), `task-router.ts` / `claude-cli-router.ts` (prompt + parse),
`keyword-scorer.ts` (loop cue), `libs/contracts/src/tasks/task.schema.ts`
(`mode`, `proposedGoal`).

**Testy.** „fix failing test until green" → `mode: loop`, checks verifier;
„rename the Button component" → `agent`; „ship the auth feature" → pipeline;
prázdný katalog → orchestrator. Round‑trip `proposedGoal` přes contract.
Injection‑tvar v popisu zůstane inertní (Law 4).

### Krok 2 — Jeden composer; režim jako náhled, ne formulář (web)

**Co.** Sloučit obě záložky `NewTaskDialog` do jediného toku. `LoopComposer`
se z výchozího povrchu změní na **tělo „Upravit" disclosure**, předvyplněné z
`proposedGoal`. Mezi popisem a odesláním se vykreslí kompaktní „ZIBBY udělá…"
náhled (režim + cíl + u smyčky verifier/iterace) — stejný komponent, který už
vykresluje schvalovací brána (`TaskRouting`), takže žádný nový povrch.

**Soubory.** `NewTaskDialog.tsx` (pryč `Tabs`/`TaskMode`), nový
`PlanPreview.tsx` (render `mode` + target + loop defaults), `LoopComposer.tsx`
(z defaultu → disclosure, řízený z `proposedGoal`), i18n katalogy
`apps/web/i18n/messages/{cs,en}.json`.

**Testy.** Dialog renderuje jediné pole; odeslání loop‑tvarového textu
dispatchne goal; „Upravit" disclosure round‑trip předvyplněných defaultů;
nízká confidence stále nabídne ruční výběr cíle.

### Krok 3 — Cesty se stanou scoped právy (web + tenký backend)

**Co.** Detekované cesty (ve **všech** režimech, i smyčce) vyřešit proti
projektům. Patří‑li do projektu → odznak „scoped to <projekt>". Nepatří‑li →
akce „Udělit přístup", která složku zaregistruje jako workspace/projekt root.
Udělení je gateovatelné (Tier 3 — uděluješ ZIBBY práva ke složce) a stane se
`cwd`/sandboxem běhu. Navazuje na 3.1 workspace manager.

**Soubory.** `PathChips.tsx` (stav scoped/neznámá + akce grant), `task.ts`
(rozlišení cesta→projekt přes `matchProject`/`searchProjects`),
`NewTaskDialog.tsx` (cesty pro oba režimy), případně tenký endpoint
„grant folder access" nad projektovým úložištěm.

**Testy.** Cesta uvnitř projektu → odznak projektu; mimo → akce grant; grant
vytvoří/rozšíří scope; běh dostane složku jako `cwd`. Žádné automatické
udělení bez brány (Law 1).

### Krok 4 — Hlas plní ten jeden vstup (web)

**Co.** Napojit `VoicePanel` transcript → unifikovaný composer / `createTask`.
ZIBBY přečte zpět odvozený plán („Spustím to jako smyčku, opakuji dokud testy
neprojdou — pustit?") a u rizikových kroků počká. Protože režim teď odvozuje
stroj, hlas už nemusí vyplňovat formulářová pole (dnes pro smyčku nemožné).

**Soubory.** `apps/web/features/voice/components/VoicePanel.tsx`,
`VoiceContext.tsx`, `TaskContext.tsx` (otevřít composer s předvyplněným textem),
napojení na `useCreateTaskMutation`.

**Testy.** Transcript → composer předvyplněn; potvrzení → dispatch;
loop‑tvarová promluva → goal; riziková akce stále prochází bránou.

---

## Invarianty (neměnné)

- **Brána zůstává.** Sjednocení mění _zadávání_, ne schvalování. Rizikové akce,
  spend‑past‑cap a Tier 3 procházejí gate beze změny (Law 1, Law 3).
- **Pokročilá kontrola se neztrácí**, jen přestává být výchozí — žije v „Upravit"
  disclosure předvyplněném odvozenými defaulty.
- **Files‑as‑truth.** Syntetizovaný goal je normální `<id>.goal.md`; udělení
  práv je záznam v projektovém úložišti. Nic jen v paměti UI.
- **Vstup je data, ne příkazy** (Law 4) — text/cesty nikdy nezvednou tier ani
  neobejdou bránu.

## Mimo rozsah

- Vlastní čas plánování (zůstává u tří presetů).
- Editor goal definic mimo „Upravit" disclosure (goal CRUD řeší Phase 10.4).
- Jakékoliv auto‑merge / auto‑push / auto‑grant — vždy za bránou.

## Závislosti a pořadí

```
Krok 1 (klasifikátor → loop shape)   — potřebuje Phase 10.1/10.2 (goal engine)
  └─→ Krok 2 (jeden composer)        — čistě web nad Krokem 1
Krok 3 (cesty → scoped práva)        — potřebuje 3.1 workspace manager
Krok 4 (hlas)                        — potřebuje Phase 7 (voice) + Krok 2
```

Kroky 1–2 dodávají hlavní zjednodušení a dají se odeslat samostatně. Krok 3 a 4
jsou nezávislá vylepšení nad stejným sjednoceným tokem.

## Exit kritérium

Operátor (psaním _i_ hlasem) zadá „oprav padající test v projektu X a opakuj,
dokud neprojde" do jediného pole; ZIBBY to klasifikuje jako smyčku, ukáže náhled
(maker + checks verifier + strop iterací), detekovanou cestu nabídne k udělení
práv, a po jednom potvrzení spustí goal — bez jediného ručně vyplněného
formulářového pole a bez čehokoliv, co obešlo bránu.

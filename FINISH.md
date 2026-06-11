# z.i.b.b.y — Detailní prompt pro dokončení do finálního stavu

> Tohle je zadání pro Claude Code. Můžeš ho dát celé, nebo po fázích.
>
> **Cílový stav:** Zadám úkol — klávesnicí nebo **hlasem** — a systém ho sám
> zatřídí, spustí reálného agenta (`claude -p`), ten si výsledek **otestuje**,
> a když narazí na rizikovou akci, **zastaví se na approval gate a počká na mé
> schválení** (které dám taky hlasem). Pak doběhne a nahlas mi oznámí výsledek.

---

## 0. Co už je hotové a REÁLNÉ (nepřepisovat, jen na to navázat)

Backend autonomní smyčka **není demo** — spouští opravdový `claude`:

| Krok | Kde | Stav |
|---|---|---|
| Příjem úkolu | `POST /api/tasks` → `TaskSchedulerService.createTask()` `apps/api/src/tasks/task-scheduler.service.ts:72` | ✅ |
| Klasifikace (kam úkol patří) | `TaskClassifierService` → `apps/api/src/tasks/claude-cli-router.ts:51` (reálný `claude -p`, timeout 8 s, fallback keyword scorer) | ✅ |
| Spuštění agenta | `AgentRunnerService.start()` `apps/api/src/agents/agent-runner.service.ts:100` → příkaz staví `claude-run-command.service.ts:154` | ✅ |
| Spawn + sandbox + log/sidecar | `apps/api/src/runner/runner-core.ts:276` | ✅ |
| Mid-run approval gate | `agent-runner.service.ts:151` (`onIntent`) → `gate-evaluator.service.ts:82` → `allow\|ask\|deny\|notify` | ✅ |
| Reálná pauza | dítě blokuje na `intent-decision.json`; RunnerCore ho zapíše až po rozhodnutí `runner-core.ts:425/436` | ✅ |
| Resume po schválení | `runner-core.ts:345`; approvals perzistují přes restart | ✅ (jen agent) |
| Scheduler | 30 s tick `task-scheduler.service.ts:93` (`TASK_TICK_MS`) | ✅ |

Frontend (taky reálný, napojený na výše uvedené):
- Vytvoření úkolu: `apps/web/features/tasks/` → `useCreateTaskMutation`
  (`POST /api/tasks`), dialog `NewTaskDialog.tsx`.
- Feed běhů: `apps/web/features/runs/` → `useRunsQuery` (merge agent+pipeline+scheduled,
  SSE z `runEvents` + 2 s polling fallback), log stream `useRunLogStream`.
- Approval karta: `RunDetail` + `RunApprovalGate`, `useApprovalsQuery`,
  `useApproveMutation`, `useRejectMutation`.

**Jediné, co je čisté demo, je HLAS** (viz Fáze A) — a backend má 4 dílčí mezery
(Fáze B).

### Přesné typy a hooky, na které budeš sahat

```ts
// libs/contracts/src/tasks/task.schema.ts
CreateTaskInput  = { title?: string; text: string; paths?: string[]; scheduledAt?: number | null }
CreateTaskResult =
  | { outcome: "dispatched"; runRef: string; target: TaskTarget }
  | { outcome: "scheduled";  task: ScheduledTask }
TaskTarget = { kind: "agent" | "pipeline"; id: string; name: string; glyph?: string; category?: string }

// apps/web/features/tasks/mutations/useCreateTaskMutation.ts
const m = useCreateTaskMutation();
m.mutate({ body: { text } }, { onSuccess: (res) => { /* res.body: CreateTaskResult */ } });

// apps/web/features/approvals/mutations/{useApproveMutation,useRejectMutation}.ts
useApproveMutation().mutate({ params: { id } });
useRejectMutation().mutate({ params: { id } });
// approval položka (useApprovalsQuery -> data): { id, runId, kind, skill, action, detail, risk, status }

// apps/web/features/runs/mutations/useStopAgentMutation.ts
useStopAgentMutation().mutate({ params: { runId } });

// apps/web/features/runs/queries/useRunsQuery.ts  ->  { runs: RunView[] }
// RunView má: runId, owner, status ("running"|"done"|"error"|"interrupted"|"awaiting-approval"|"parked"), pct, startedAt, kind
```

---

## Konvence (platí pro každou změnu)

Po každé úpravě kódu spusť v tomto pořadí (dle `CLAUDE.md`):
```bash
pnpm lint                                      # ESLint --fix (i formátování)
npx tsc -p apps/web/tsconfig.json --noEmit     # POZOR: `rtk pnpm typecheck` lže; volej tsc -p přímo
pnpm test                                       # vitest run (workspace)
pnpm exec vitest run --project web-components    # komponenty apps/web (jdsom projekt)
```
Pravidla repa: žádný `any`, žádný `forwardRef` (React 19 ref-as-prop), žádné inline
`style` na DOM v `apps/web` (jen DS primitiva / DS `style` passthrough / cílený
`// eslint-disable-next-line react/forbid-dom-props` na raw node — `VoiceScreen.tsx`
má file-level disable, protože je to bespoke HUD). Žádné natvrdo psané texty —
vše přes `next-intl` do `apps/web/messages/{cs,en}.json`. Po dokončení `graphify update .`.

---

## FÁZE A — Hlasové ovládání: nahradit demo reálným vstupem (největší hodnota)

**Dnešní stav** (`apps/web/features/voice/`): orb (`VoiceOrb`), rebindovatelná
zkratka `V` (`shortcut.ts` + `ShortcutCapture`) a overlay (`VoiceScreen`) jsou
reálné a hezké. Ale:
- `useVoiceDemoSequence.ts` je `setTimeout` skript (`idle→listening→thinking→speaking→idle`).
- Transkript ve `VoiceScreen.tsx:41-47` je natvrdo z `t("demo.*")`.
- **Není mikrofon, není rozpoznávání řeči, není převod řeči na akci.** Panely
  (`VoiceScreen.tsx:124-238`) jsou jen pro čtení.

Cíl fáze A: skutečně mluvit → vznikne reálný úkol/akce; zibby odpovídá hlasem;
schvaluju hlasem. **Klíč: nestavět nové NLU — finální přepis poslat do už hotového
klasifikátoru (`POST /api/tasks`), který rozběhne celou autonomní smyčku.**

### A1. Sjednotit session interface (rozšířit, ne rozbít)
Soubor: `apps/web/features/voice/hooks/useVoiceDemoSequence.ts` (interface
`VoiceSession`). Rozšiř interface tak, aby ho splnil i reálný hook:

```ts
export interface VoiceSession {
  state: VoiceState;                  // idle | listening | thinking | speaking  (už existuje)
  isActive: boolean;
  toggleMic: () => void;
  // nové:
  transcript: string;                 // průběžný (interim) přepis pro orb/HUD
  messages: VoiceMessage[];           // skutečná konverzace (nahradí demoMessages)
  error: string | null;              // "mic-denied" | "unsupported" | "network" | null
}
```
Demo hook necháš fungovat: doplň `transcript: ""`, `messages` ze skriptu, `error: null`.
`revealed` můžeš zrušit ve prospěch reálných `messages`.

### A2. Reálné rozpoznávání řeči
Nový soubor: `apps/web/features/voice/hooks/useSpeechRecognition.ts`.

- Detekuj `const SR = window.SpeechRecognition ?? (window as unknown as …).webkitSpeechRecognition`.
  Když chybí → `error: "unsupported"` a fallback (textový input, viz A5).
- Konfigurace: `lang` podle locale z cookie (`cs-CZ` / `en-US` — locale čti stejně
  jako `i18n/request.ts`), `interimResults = true`, `continuous = true`,
  `maxAlternatives = 1`.
- Mapování událostí na `VoiceState`:
  - `start()` → `listening`.
  - `onresult` interim → aktualizuj `transcript` (orb zůstává `listening`).
  - `onresult` final (`isFinal`) → ulož větu, přepni na `thinking`, zavolej
    `onUtterance(finalText)` (předáno z A5; spustí `dispatchUtterance`).
  - během přehrávání odpovědi → `speaking` (řídí A3), pak zpět `idle`/`listening`.
- Chyby `onerror`: `not-allowed`/`service-not-allowed` → `error:"mic-denied"`;
  `network` → `error:"network"`; jinak loguj a vrať se do `idle`.
- Úklid: na unmountu `recognition.abort()`, zruš listenery (vzor cleanup viz
  `useVoiceDemoSequence.ts:38`).
- Typy Web Speech API nejsou v `lib.dom` kompletní — přidej minimální deklarace
  do `apps/web/features/voice/speech.d.ts` (žádný `any`; pojmenuj
  `SpeechRecognitionLike` apod.).

### A3. Hlasová odezva (TTS)
Nový soubor: `apps/web/features/voice/hooks/useSpeech.ts` nad `window.speechSynthesis`.

```ts
export function useSpeech() {
  const speak = (text: string) => { /* SpeechSynthesisUtterance, lang dle locale,
    vyber hlas z getVoices() odpovídající locale; onstart→state speaking, onend→idle */ };
  const cancel = () => window.speechSynthesis.cancel();   // barge-in
  return { speak, cancel, supported: "speechSynthesis" in window };
}
```
Edge: `getVoices()` se v Chrome plní async → poslouchej `voiceschanged`.

### A4. Most řeč → akce (`dispatchUtterance`) — JÁDRO
Nový soubor: `apps/web/features/voice/lib/dispatchUtterance.ts`. **Čistá, testovatelná
funkce** (vstup `string` + injektované handlery → akce), bez závislosti na mikrofonu.

```ts
export interface VoiceActions {
  createTask: (text: string) => void;       // -> useCreateTaskMutation
  approveLatest: () => void;                  // -> useApproveMutation na nejstarší pending
  rejectLatest: () => void;
  stopActive: () => void;                     // -> useStopAgentMutation na běžícím
  navigate: (screen: VoiceScreenTarget) => void;
  closeOverlay: () => void;
  speak: (text: string) => void;             // potvrzení nahlas
}
export type VoiceIntent =
  | { kind: "command"; name: string }
  | { kind: "task"; text: string };

export function parseUtterance(text: string): VoiceIntent { /* grammar, viz tabulka */ }
export function dispatchUtterance(text: string, a: VoiceActions): void {
  const intent = parseUtterance(text);
  /* command → zavolej příslušný handler + a.speak(potvrzení);
     task    → a.createTask(text) + a.speak("Spouštím…") */
}
```

**Command grammar (dvojjazyčně cs/en, case-insensitive, trim, diakritiku
normalizuj):** první shoda vyhrává, jinak `task`.

| Příkaz (vzory) | Akce |
|---|---|
| `schval`, `potvrď`, `souhlasím`, `approve`, `yes`, `ok` | `approveLatest` |
| `zamítni`, `zruš to`, `reject`, `no`, `deny` | `rejectLatest` |
| `zastav`, `stop`, `cancel`, `přeruš` | `stopActive` |
| `otevři X`, `přejdi na X`, `go to X`, `open X` (X ∈ overview/agents/pipelines/runs/approvals/tasks/settings; mapuj cs i en názvy) | `navigate(X)` |
| `zavři`, `konec`, `exit`, `close` | `closeOverlay` |
| cokoli jiného | `createTask(text)` |

> Pozn.: víc čekajících approvalů → `approveLatest` ber jako „nejstarší pending"
> (sortuj podle `requestedAt`); jako rozšíření můžeš později přidat „schval <skill>".

### A5. Zapojení do overlaye (živé vs demo, plumbing)
1. **`VoiceContext.tsx`** — přidej do `VoiceStore` přepínač režimu:
   ```ts
   mode: "live" | "demo";            // default "live"; persist do localStorage jako shortcut
   setMode: (m) => void;
   ```
2. **`VoiceScreen.tsx`** — dnes natvrdo `useVoiceDemoSequence()` (řádek 36) a
   `demoMessages` (41). Změň na:
   ```ts
   const { mode } = useVoice();
   const session = mode === "live" ? useRealVoiceSession(onActions) : useVoiceDemoSequence();
   // POZOR na pravidlo hooků: neměň počet volaných hooků dle podmínky —
   // udělej JEDEN wrapper hook useVoiceSession(mode) uvnitř něj nevolej oba podmíněně,
   // ale složený hook, který interně drží oba a vrací aktivní (nebo zvol jeden a
   // render-přepínej přes dvě komponenty VoiceScreenLive/VoiceScreenDemo).
   ```
   Doporučení: rozděl na `VoiceScreenLive` / `VoiceScreenDemo` (sdílí presentational
   část — orb, panely, top/bottom bar — vytaž do `VoiceScreenShell`), `VoiceScreen`
   jen vybere podle `mode`. Tím se vyhneš podmíněnému volání hooků.
3. Nový hook `useRealVoiceSession(actions)` slepí A2+A3+A4: poslech → final →
   `dispatchUtterance(text, actions)`; po akci `speak()` → po `onend` znovu poslech.
4. Handlery (`VoiceActions`) sestav v overlay komponentě z reálných mutací/queries:
   `useCreateTaskMutation`, `useApproveMutation`, `useRejectMutation`,
   `useStopAgentMutation`, `useApprovalsQuery`, `useRunsQuery`, `useRouter`
   (next/navigation), `useVoice().close`. Po `createTask` `onSuccess` přečti
   `res.body` (`CreateTaskResult`): pokud `dispatched`, `speak("Spouštím " + target.name)`
   a volitelně `router.push("/runs?run=" + runRef)`.
5. **Fallback bez mikrofonu**: když `session.error === "unsupported"` nebo
   `"mic-denied"`, zobraz v overlay textový input (DS primitivum) → odeslání volá
   `dispatchUtterance` stejnou cestou. Tím je hlasová vize použitelná i v Safari/FF.
6. Mic tlačítko (`VoiceScreen.tsx:286`) napoj na `session.toggleMic`; popisky chyb
   přes i18n.

### A6. Hands-free + barge-in + wake-word (volitelné rozšíření)
- Po `speak()` `onend` automaticky znovu spusť poslech (smyčka), dokud uživatel
  nezavře overlay.
- Barge-in: když uživatel začne mluvit během `speaking`, `useSpeech().cancel()`.
- Wake-word „zibby": v `continuous` poslechu mimo overlay (přidej volitelný globální
  posluchač v `VoiceProvider`) — prefix-match na transkriptu „zibby …" → `open()` +
  zbytek věty rovnou do `dispatchUtterance`. Default vypnuto, přepínač v Settings.

### A7. i18n
Do `apps/web/messages/{cs,en}.json` přidej klíče (žádný hardcode): `voice.micDenied`,
`voice.unsupported`, `voice.networkError`, `voice.listening`, `voice.dispatched`
(`"Spouštím {name}"`), `voice.approvalPrompt` (`"Potřebuji schválení: {action},
riziko {risk}. Schválit?"`), `voice.approved`, `voice.rejected`, `voice.stopped`,
`voice.navigated`, `voice.modeLive`, `voice.modeDemo`, `voice.typeInstead`.
Demo klíče (`voice.demo.*`) ponech jen pro `mode === "demo"`.

### A8. Testy (bez mikrofonu)
- `dispatchUtterance.test.ts` (vitest, web-components projekt): pro každý řádek
  grammar tabulky ověř správný handler (mock `VoiceActions`), a že neznámý vstup →
  `createTask(text)`. Test cs i en variant a normalizaci diakritiky/velkých písmen.
- `useRealVoiceSession` / overlay: lehký test, že po „final" události s textem
  „schval" se zavolá `approveLatest` (mockni Speech API objektem).

### ✅ Akceptační kritéria fáze A
- Řeknu „připrav mi standup na dnešek" → vznikne reálný běh, objeví se v `/runs`,
  zibby řekne „Spouštím …".
- Řeknu „přejdi na approvals" → naviguje na `/approvals`.
- Když běh čeká na schválení, zibby to přečte; řeknu „schval" → běh pokračuje
  (`useApproveMutation` → backend resume).
- V prohlížeči bez Web Speech API se objeví textový vstup a funguje stejná cesta.
- `dispatchUtterance` má zelené unit testy; demo režim stále funguje za přepínačem.

---

## FÁZE B — Uzavřít autonomní smyčku na backendu

### B1. Pipeline resume (dnes pipeline umí jen „parked", neumí pokračovat)
- `apps/api/src/pipelines/pipeline-runner.service.ts` nevolá
  `ApprovalsService.requestApproval()` a nemá `resume()`. Proto je
  `approvals.service.ts:95` (`runners.get(kind).resume`) pro `kind:"pipeline-stage"`
  no-op a pipeline po „parked" nepokračuje.
- Doplň mid-run gate do stage driveru (vzor `agent-runner.service.ts:151`) a
  `resume()` (vzor `runner-core.ts:345`). Po schválení musí pokračovat aktuální fáze.
- E2e: pipeline se zastaví na approvalu a po schválení doběhne (rozšiř existující
  pipeline e2e; pozn.: 2 flaky pipeline e2e testy jsou pre-existing — neřeš je,
  ověř na čistém stromu).

### B2. Zpětná vazba úkol → běh → výsledek
- Dnes `CreateTaskResult` vrátí `runRef`, ale **run nemá zpětný odkaz na task** a
  task nesleduje finální outcome (success/fail).
- Přidej `taskId` do run sidecaru / `agent-run.schema.ts` (a pipeline-run schema).
- Po doběhnutí běhu ulož do scheduled-task / task záznamu finální stav
  (`done`/`error`). Vystav v kontraktu, ať to frontend i hlas přečtou.
- Frontend: v `/runs` (a hlasem) umět říct „úkol X hotov / selhal".

### B3. Preflight reálného Claude
- `claude-run-command.service.ts:184` spoléhá, že `claude` je v PATH a přihlášený.
  Když není, běh tiše selže.
- Rozšiř `apps/api/src/health` / `GET /api/health` o kontrolu: existuje `claude`
  binárka (`CLAUDE_BIN ?? "claude"`) + je autentizovaná? Vrať strukturovaný stav.
- Frontend ukáže jasné „Claude není nakonfigurován" (a hlas to oznámí) místo
  záhadného selhání.

### B4. Explicitní „test" krok před approvalem (součást vize „otestuje se")
- „otestuje se" dnes závisí jen na instrukcích agenta (`apps/api/data/agents/*.md`).
- Udělej z toho deterministické: standardní fáze v pipeline, která po implementaci
  spustí `pnpm lint && tsc && pnpm test` v cílovém sandboxu a **jen při úspěchu**
  postoupí k riskantnímu kroku (gate). Definuj jako sdílenou pipeline phase, ne jen
  prompt. Při selhání testů → běh `error` / vrátí se k opravě (dle návrhu pipeline).

### ✅ Akceptační kritéria fáze B
- Pipeline běh se zastaví na approvalu a po schválení dopokračuje (e2e zelené).
- U úkolu v `/runs` vidím jeho výsledek; hlas ho umí přečíst.
- Bez nakonfigurovaného Claude se zobrazí čitelný stav, ne pád běhu.
- „Test" fáze je explicitní a blokuje postup při selhání.

---

## FÁZE C — UX / Settings / a11y

- **Interaktivní panely**: Approvals/Active v overlay (`VoiceScreen.tsx:124-238`)
  jsou read-only. Přidej akce (schválit/zamítnout/otevřít běh) — sdílej handlery
  s `VoiceActions`, ať myš i hlas dělají totéž.
- **Settings → Voice** (`apps/web/features/settings/Screen.tsx`, vedle stávajícího
  `ShortcutCapture`): přepínač Live/Demo, jazyk rozpoznávání, výběr TTS hlasu,
  wake-word on/off.
- **a11y overlay**: focus trap, `aria-live="polite"` pro transkript/odpovědi,
  viditelný stav mikrofonu (běží/chyba), Esc zavírá (už je).
- **i18n úklid**: žádné natvrdo psané texty; demo transkript jen za `mode==="demo"`.

---

## Doporučené pořadí
1. **A1–A5 + A7–A8** → reálné hlasové zadání úkolu + schválení (největší hodnota,
   stojí na hotovém backendu; nic dalšího nepotřebuje).
2. **B2 + B3** → viditelnost výsledku a robustnost (hlas pak umí „hotovo/chyba").
3. **B1** → pipeline resume (autonomie i pro vícefázové pipeline).
4. **A6 + B4 + C** → hands-free, deterministický test krok, doladění a interaktivní panely.

## Globální Definition of Done
- `pnpm lint` (0 errors), `tsc -p apps/web/tsconfig.json` (0 errors),
  `pnpm test` + `vitest --project web-components` zelené.
- E2E happy-path: **hlasem zadám úkol → běh → (případně) approval → hlasem schválím
  → běh dokončen → hlasové oznámení výsledku.**
- Bez mikrofonu/Web Speech API existuje funkční textový fallback.
- Žádné `any`, žádný `forwardRef`, žádné inline `style` na DOM v `apps/web` mimo
  sanctioned escape hatch.
- `graphify update .` na závěr.
```

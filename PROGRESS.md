# Loop progress

> Stav autonomního fázového vývoje (LOOP.md). Jedna iterace = jedna fáze.

## Poslední dokončená fáze

**N5b — machine chat tools + maps lookup + čitelná brána** — 2026-07-02,
commit `feat(machine): N5b …` — **obě referenční úlohy N5 doručeny → delta
fáze N1–N5 KOMPLETNÍ.**

- Chat tools `machine_rename` + `open_maps` (chat smí jen NAVRHOVAT — propose
  nikdy nevykonává; guard error → zpráva, ne crash). Akce `open-maps`
  (`open "maps://?q=…"`) — jen otevře okno, risk low, ale pořád za bránou;
  opener injektovatelný. Brána renderuje víceřádkový preview přes CodeBlock
  (gotcha: CodeBlock nepropouští data-testid — selektuj CodeBlockTestId.Root).
  MachineService refaktor na per-kind plan()/execute(). Suita 2072/0.
  Detail: `docs/plans/phase-n5b-machine-chat-maps.md` + `docs/api/machine.md`.

**N5a — Controlling the Machine: file ops za bránou** — 2026-07-02,
commit `feat(machine): N5a …`

- N4i ověřilo: Chat-UI je KOMPLETNÍ včetně persona pickeru (ChatSection
  v settings existuje) → **celé N4 hotové**, N5 legitimně na řadě.
- Referenční úloha „přejmenuj soubory ve jmenované složce", Tier-3 by
  construction: POST /api/machine/actions spočítá dry-run preview + zaparkuje
  HIGH-risk approval `kind: machine`; approve vykoná preview přesně jednou
  (re-verify každý rename, fail-closed → `failed`); reject nechá disk netknutý.
  Vzor jira-issue ResumableRunner, ale pending stav DURABLE (MachineActionStore;
  preview = auditní mapa starý→nový). Žádný execute endpoint — jediná cesta je
  brána. Guardy: absolutní existující adresář, žádné oddělovače cest, kolize →
  422. Suita 2065/0. Detail: `docs/plans/phase-n5a-machine-fileops.md` +
  `docs/api/machine.md`.

**N4h — Integrations na gramatiku (UZAVÍRÁ řadu N4c–N4h)** — 2026-07-02,
commit `feat(web): N4h integrations …`

- Poslední porušitel: Konfigurovat na kartě naviguje na nested
  `/projects/[id]/integrations/[integrationId]` (GitLab precedens — integrace
  patří projektu). Stránka = editační plocha (kind+id zamčené), Uložit / Test
  spojení (Alert) / Smazat (confirm; z karty odstraněno — mazala bez potvrzení)
  vpravo nahoře. Dialog create-only → naviguje na detail; kind-switching
  formulář extrahován do `useIntegrationFormState`/`IntegrationFormFields`;
  write-only secret dál out-of-band (email→password, jinak token).
- Gotcha: typed routes neodvodí template s query stringem uložený do const —
  explicitní `as Route`. **Gramatická řada KOMPLETNÍ**: agents, skills,
  commands, hooks, mcp, automations, memory, integrations konformní.
- Suita 2056/0, ESLint 0. Detail: `docs/plans/phase-n4h-integrations-grammar.md`.

**N4g — Memory note editing in place** — 2026-07-02, commit `feat(web): N4g memory …`

- Editace velkého markdown těla už neotvírá dialog: `NoteView` je view⇄edit
  plocha (Editovat vpravo nahoře v hlavičce panelu; edit mode = title input +
  MarkdownEditor, Uložit/Zrušit v hlavičce; id/tier neměnné). `NoteEditorDialog`
  create-only (slug id z titulu + tier picker zůstávají); Screen keyuje NoteView
  podle note id (přepnutí poznámky zahodí rozdělanou editaci).
- NC: smazán nepoužívaný `dailyNodes` memo — poslední lint warning v repu pryč
  (ESLint: 0 issues). Suita 2052/0. Detail: `docs/plans/phase-n4g-memory-grammar.md`.

**N4f — Automations na gramatiku** — 2026-07-02, commit `feat(web): N4f automations …`

- Poslední velký edit dialog: Edit na kartě naviguje na `/automations/[id]`;
  stránka = editační plocha (sdílené `useAutomationFormState` +
  `AutomationFormFields`), akce vpravo nahoře Uložit / Spustit teď / Smazat
  (confirm). System zámek přesunut na detail beze změny sémantiky (patch JEN
  {trigger}, žádný Delete — server 409). Dialog create-only → naviguje na
  detail. NOVĚ zapojen `deleteAutomation` kontrakt — web neměl žádnou delete
  plochu (settability díra zavřena).
- Suita 2049/0. Detail: `docs/plans/phase-n4f-automations-grammar.md`.

**N4e — Hooks + MCP na gramatiku** — 2026-07-02, commit `feat(web): N4e hooks + MCP …`

- Třetí dávka na šabloně N4c: „Konfigurovat" na kartě naviguje na `/hooks/[id]`
  a `/mcp/[id]` detail stránky (dřív create+edit dialogy); Save/Delete vpravo
  nahoře, id/transport zamčené, mazání za confirm dialogem (dřív bez
  potvrzení). Dialogy create-only; controlled form state + pole extrahovány do
  `useHookFormState`/`HookFormFields` a `useMcpFormState`/`McpServerFormFields`.
  MCP auth token dál jede out-of-band přes credentials mutaci na obou plochách.
- Typing gotcha: `UpdateXInput` je partial — sdílený builder polí nechat
  INFEROVANÝ (neanotovat partial typem), jinak create body ztratí required
  fields. Suita 2045/0. Detail: `docs/plans/phase-n4e-hooks-mcp-grammar.md`.

**N4d — Skills + Commands na gramatiku** — 2026-07-02, commit `feat(web): N4d skills + commands …`

- Druhá dávka na šabloně N4c: tiles navigují na `/skills/[id]` a
  `/commands/[id]` detail stránky (dřív create+edit dialogy); Save/Delete
  vpravo nahoře, mazání za confirm dialogem (dřív bez potvrzení). Dialogy
  create-only; formulářová těla extrahována do `SkillFormFields` /
  `CommandFormFields` (dialog i detail renderují totéž); create naviguje na
  nový detail. Stale edit-mode test modalu srovnán na create-only kontrakt.
- Suita 2037/0 (jednorázový under-load flake v rtk-filtrovaném běhu se na
  čistém běhu nereprodukoval). Detail: `docs/plans/phase-n4d-skills-commands-grammar.md`.

**N4c — Agents na interakční gramatiku** — 2026-07-02, commit `feat(web): N4c agents …`

- Plný audit sekcí proti gramatice (tabulka v `docs/plans/phase-n4c-agents-grammar.md`);
  nejhorší porušitel zmigrován: karta agenta NAVIGUJE na novou `/agents/[id]`
  detail stránku (dřív view/edit dialog), stránka = editační plocha (jeden
  formulář nad panely Základy + Pravidla), akce vpravo nahoře — Uložit / Spustit
  (první skutečné zapojení mrtvé Run afordance; NewTask pre-fill = explicitní
  cíl) / Smazat (confirm). Dialog jen create (`NewAgentDialog`);
  `AgentDetailModal` + `AgentViewDetails` smazány. Zbylí porušitelé: skills,
  commands, automations, hooks, mcp, integrations, memory (dialogy create+edit).
- Gotcha: `npx next typegen` musí běžet s cwd=apps/web (z rootu spadne).
  Suita 2028/0.

**N4b — CI health povrch** — 2026-07-02, commit `feat(monitors): N4b CI health surface …`

- CI zdraví jako STAV (ne událost): `GithubCiMonitor` počítá červená/zelená z celé
  stažené stránky (`sinceAt` = začátek série), watcher přepisuje atribuovaný
  sidecar `status/<integrace>--<adapter>.json`, read-only
  `GET /api/monitors/status`. Briefing: needs-you kind `ci-red` jen dokud je
  červeno (anti alert-fatigue — linka zmizí sama, nikdy re-alert). Web: chip na
  project detailu — tři indikátory (tone + glyph + „CI červené od HH:MM"),
  invalidace na `monitor-alert` SSE + pomalý stavový poll (zotavení do zelena
  nemá event). Suita 2022/0. Detail: `docs/plans/phase-n4b-ci-health.md`.

**N4a — Chains UI** — 2026-07-02, commit `feat(web): chains section …`

- Sekce `/chains` (nav za pipelines): karty → detail route, Run/Delete vpravo
  nahoře, dialog jen create (NewChainDialog: název→slug id, brief, kroky
  v pořadí). Runs panel: status tag, per-krok stav, parkedReason.
- Data layer dle konvencí; chain-runs invalidace na `pipeline-runs` SSE scope
  (poll jen při výpadku). Gotcha: `rtk npx next typegen` tiše nic nevygeneruje —
  nutno `rtk proxy npx next typegen`. NC deflake: rejected-PR test přes
  vi.waitFor. Suita 2010/0. Detail: `docs/plans/phase-n4a-chains-ui.md`.


**N3 — CI/CD monitoring + MonitorAdapter seam** — 2026-07-02, commit `feat(monitors): …`

- `MonitorAdapter` seam (alerty, ne zprávy; `wants()` opt-in; druhý adapter = jen
  `registry.register()` — Sentry-ready, prokázáno testem). GitHub Actions monitor:
  jede na existující github integraci (`streams: ["ci"]`), dedup
  `ci-<repo>-<runId>-<attempt>`, kurzor per (integrace × adapter).
- Červený run → event → activity `monitor-alert` → dispatch vyšetřovacího tasku
  běžným schedulerem (trustedProjectId, guardy, PR brána). Selhaný dispatch →
  event `new`, další tick retry. Heartbeat `monitorTickMs` (+ /settings pole).
- NC vedlejší: chain transitions serializované na frontě + `settle()` (odstraněn
  under-load flake). Suita 2002/0. Detail: `docs/plans/phase-n3-monitor-seam.md`.

**N2b — chain primitivum (uzavírá N2)** — 2026-07-02, commit `feat(chains): …`

- Contract-first `chainsContract` + `chainRunsContract`; `ChainRunnerService` —
  completion-driven advance: done krok → jeho N2a artifact record → obsah (vault
  body / project file) → vstupní handoff dalšího kroku
  (`PipelineRunnerService.start(..., input)` → `<run>/input.md` → `consumes`).
- Park na rozbitý handoff (chybějící/nečitelný/pr-only artefakt); failed krok →
  chain failed; parked krok → chain parked, pozdější done resumuje. Boot
  rekonciliace z registru artefaktů (ztracený run bez artefaktu → park, nehádá).
- Referenční chain `nightly-research → build-feature` prokázán e2e (demo mode).
  Activity kinds chain-*. Suita 1983/0. Detail: `docs/plans/phase-n2b-chain-primitive.md`.

**N2a — durable artifact registry** — 2026-07-01, commit `feat(artifacts): …`

- Contract-first `artifactsContract` (read-only GET /api/artifacts + /:id) +
  `ArtifactRecordSchema` (kind `vault-note`/`project-file`/`pr`, locator, from,
  producedBy, createdAt). `ArtifactsStorageService` — jeden plain-JSON záznam na
  soubor v `ARTIFACTS_DIR`; stabilní id `<runRef>_<kind>_<slug(from)>` (idempotentní
  re-delivery nahrazuje). Delivery sinks runneru zapisují provenance při delivery;
  best-effort (nikdy neshodí delivery), selhaná delivery nezapisuje nic.
- Suita: 1964 passed / 0 failed. Detail: `docs/plans/phase-n2a-artifact-registry.md`.

**N1b — e2e realignment (21 → 0 failures)** — 2026-07-01, commit `test(e2e): …`

- Žádná změna chování; stale testy srovnány na shipped kontrakt: background-first
  `createTask` (201 `pending`, guardy limit/budget/capacity zůstávají synchronní,
  classify+spawn na pozadí → testy pollují task record), integrations si sídlují
  vlastní projekty (projectId FK), delivery seed bez `n-9` (+ `pr-autor`).
- `task-created` (HTTP trace) a `task-dispatched` (vlastní background trace) korelují
  přes `refs.taskId` — traceId se záměrně liší.
- Celá suita zelená: 1949 passed / 0 failed. Detail: `docs/plans/phase-n1b-e2e-realign.md`.

**N1 — DNA alignment (SSE + explicit-target override)** — 2026-07-01 —
`docs/plans/phase-n1.md` (stage-log SSE tail, SSE-gated polls, classifier-bypass test).

## Zaparkováno / známé dluhy

- (nic)

## Další fáze (návrh)

**NC — entity ID refactor, GROUND & rozhodnutí**: delta fáze N1–N5 jsou
kompletní; zbývá standing NC track. Nejstarší PLÁNOVANÝ architektonický dluh:
`docs/plans/entity-id-refactor.md` (opaque ULID+prefix id vs human slug;
slug=filename). Research potvrzuje best practice „obojí — stabilní id interně,
slug externě". PŘÍŠTÍ iterace: ground na plánu, poctivě posoudit rozsah proti
zákazu big-bang refaktorů — buď nakrájet na malé fáze (per-entita?), nebo
zdůvodněně descopovat a vybrat jiný NC cíl (duplicity/dead code sweep).

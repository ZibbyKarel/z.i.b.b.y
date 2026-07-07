// ZIBBY velín — Task data model + mock data
// Task = primary delegation unit: user describes → ZIBBY classifies → executor runs
// lifecycle: queued → classifying → classified → running → done | failed | parked

const TASK_STATE = {
  queued:      { label: 've frontě',    c: '#5d6b7a', pulse: false, glyph: 'clock'  },
  classifying: { label: 'klasifikuji…', c: '#5b8def', pulse: true,  glyph: 'brain'  },
  classified:  { label: 'ke schválení', c: '#f0b429', pulse: true,  glyph: 'bolt'   },
  running:     { label: 'běží',         c: '#5b8def', pulse: true,  glyph: 'run'    },
  done:        { label: 'hotovo',       c: '#39d98a', pulse: false, glyph: 'ok'     },
  failed:      { label: 'selhalo',      c: '#ff6b6b', pulse: false, glyph: 'warn'   },
  parked:      { label: 'ke review',    c: '#f0b429', pulse: false, glyph: 'pause'  },
};

const TASKS_DATA = [
  // ── 1. Pipeline – parked (Tester retry loop exhausted) ──────────────────
  {
    id: 'task-001',
    description: 'Implementuj search filtry podle spec.md a projdi testy',
    createdAt: 'dnes 03:00',
    status: 'parked',
    classification: {
      executorKind: 'pipeline', executorId: 'build-feature', executorName: 'Build Feature',
      confidence: 0.91, confirmedAt: 'dnes 03:01',
      alternatives: [
        { executorKind: 'agent', executorId: 'coder', executorName: 'Kodér (agent)', confidence: 0.62 },
      ],
    },
    agentRun: null,
    pipelineRun: {
      pipelineName: 'Build Feature', budget: 25, totalCost: 11.20,
      startedAt: 'dnes 03:01', elapsed: '38 m',
      stages: [
        {
          idx: 0, agentName: 'Architekt', agentGlyph: 'compass', status: 'done',
          cost: 2.10, elapsed: '2m 10s', output: 'design.md',
          log: mkLog([
            ['00:00','sys', 'fáze 1/4 · Architekt spuštěn · model opus'],
            ['00:40','info','čtu spec.md a kontext projektu'],
            ['02:00','ok',  'design.md hotov · 3 sekce, 12 bodů implementace'],
            ['02:10','sys', 'předáno Kodérovi'],
          ]),
          retryLoop: null,
        },
        {
          idx: 1, agentName: 'Kodér', agentGlyph: 'code', status: 'done',
          cost: 7.20, elapsed: '12m 20s', output: 'feat/search-filters',
          log: mkLog([
            ['00:00','sys', 'fáze 2/4 · Kodér spuštěn · větev feat/search-filters'],
            ['02:30','info','implementace FilterBar komponenty'],
            ['08:10','info','integrace s API /tasks/search'],
            ['12:10','ok',  'branch feat/search-filters committed (+347/−12)'],
            ['12:20','sys', 'předáno Testerovi'],
          ]),
          retryLoop: null,
        },
        {
          idx: 2, agentName: 'Tester', agentGlyph: 'flask', status: 'parked',
          cost: 1.90, elapsed: '7m', output: null,
          log: mkLog([
            ['00:00','sys',  'fáze 3/4 · Tester spuštěn · model sonnet'],
            ['01:20','info', 'spouštím test suite (47 testů)'],
            ['02:10','err',  'FAIL checkout-flow.test.ts · flaky timing issue'],
            ['02:20','sys',  'pokus 1/3 selhal → vracím Kodérovi'],
            ['04:00','err',  'FAIL checkout-flow.test.ts · flaky timing issue (pokus 2)'],
            ['04:10','sys',  'pokus 2/3 selhal → vracím Kodérovi'],
            ['06:30','err',  'FAIL checkout-flow.test.ts · flaky timing issue (pokus 3)'],
            ['06:45','warn', 'vyčerpány 3 pokusy · escalace na review'],
            ['07:00','warn', 'zaparkováno k ranní review'],
          ]),
          retryLoop: {
            loopTo: 'Kodér', maxRetries: 3, escalated: true,
            attempts: [
              { num: 1, result: 'fail', note: 'FAIL checkout-flow.test.ts · flaky timing' },
              { num: 2, result: 'fail', note: 'FAIL checkout-flow.test.ts · flaky timing (pokus 2)' },
              { num: 3, result: 'fail', note: 'FAIL checkout-flow.test.ts · escalace' },
            ],
          },
        },
        {
          idx: 3, agentName: 'Dokumentátor', agentGlyph: 'doc', status: 'waiting',
          cost: 0, elapsed: null, output: null, log: null, retryLoop: null,
        },
      ],
    },
  },

  // ── 2. Classified – awaiting user confirmation ──────────────────────────
  {
    id: 'task-002',
    description: 'Přidej rate-limiting do auth-svc podle security spec — max 100 req/min per IP',
    createdAt: 'dnes 09:15',
    status: 'classified',
    classification: {
      executorKind: 'pipeline', executorId: 'build-feature', executorName: 'Build Feature',
      confidence: 0.87, confirmedAt: null,
      alternatives: [
        { executorKind: 'agent',    executorId: 'coder',     executorName: 'Kodér (agent)', confidence: 0.48 },
        { executorKind: 'pipeline', executorId: 'pr-guard',  executorName: 'PR Guard',      confidence: 0.31 },
      ],
    },
    agentRun: null, pipelineRun: null,
  },

  // ── 3. Running agent ─────────────────────────────────────────────────────
  {
    id: 'task-003',
    description: 'Srovnej /media/downloads/seriály podle TMDB a přejmenuj podle standardu',
    createdAt: 'dnes 09:22',
    status: 'running',
    classification: {
      executorKind: 'agent', executorId: 'curator', executorName: 'Kurátor',
      confidence: 0.94, confirmedAt: 'dnes 09:22', alternatives: [],
    },
    agentRun: {
      agentName: 'Kurátor', agentGlyph: 'film', pct: 72, state: 'running',
      log: mkLog([
        ['00:00','sys',  'Kurátor spuštěn · model sonnet · projekt media-vault'],
        ['00:02','info', 'načteno 25 souborů z /media/downloads/seriály'],
        ['00:09','info', 'dotaz TMDB: "Severance S02" → tt11280740'],
        ['00:31','ok',   'přejmenováno 12/25 souborů · Severance/S02/'],
        ['01:48','info', 'dotaz TMDB: "The Bear S03" → tt14452776'],
        ['02:55','ok',   'přejmenováno 18/25 souborů · The.Bear/S03/'],
        ['03:11','info', 'zpracovávám zbývajících 7 souborů…'],
      ]),
    },
    pipelineRun: null,
  },

  // ── 4. Done pipeline (Nightly Research) ──────────────────────────────────
  {
    id: 'task-004',
    description: 'Posbírej zdroje k local-first sync a syntetizuj poznatky do knowledge vaultu',
    createdAt: 'dnes 02:40',
    status: 'done',
    classification: {
      executorKind: 'pipeline', executorId: 'nightly-research', executorName: 'Nightly Research',
      confidence: 0.96, confirmedAt: 'automaticky', alternatives: [],
    },
    agentRun: null,
    pipelineRun: {
      pipelineName: 'Nightly Research', budget: 15, totalCost: 2.10,
      startedAt: 'dnes 02:40', elapsed: '19 m',
      stages: [
        {
          idx: 0, agentName: 'Researcher', agentGlyph: 'search', status: 'done',
          cost: 0.80, elapsed: '6m 20s', output: 'sources.md (11 zdrojů)',
          log: mkLog([
            ['00:00','sys', 'Researcher spuštěn · model sonnet'],
            ['04:10','info','procházím akademické a tech zdroje'],
            ['06:20','ok',  'sources.md zapsán · 11 relevantních zdrojů'],
          ]),
          retryLoop: null,
        },
        {
          idx: 1, agentName: 'Architekt', agentGlyph: 'compass', status: 'done',
          cost: 1.30, elapsed: '12m 40s', output: 'knowledge/local-first-sync.md',
          log: mkLog([
            ['00:00','sys', 'Architekt spuštěn · model opus · thinking high'],
            ['08:20','info','syntetizuji 11 zdrojů do koherentní poznámky'],
            ['12:40','ok',  'knowledge/local-first-sync.md zapsán · 1 240 slov'],
          ]),
          retryLoop: null,
        },
      ],
    },
  },

  // ── 5. Failed agent ───────────────────────────────────────────────────────
  {
    id: 'task-005',
    description: 'Vyber nejlepší fotky z víkendového focení v /Volumes/Photos/2026-06',
    createdAt: 'před 1 h',
    status: 'failed',
    classification: {
      executorKind: 'agent', executorId: 'curator', executorName: 'Kurátor',
      confidence: 0.88, confirmedAt: 'před 1 h', alternatives: [],
    },
    agentRun: {
      agentName: 'Kurátor', agentGlyph: 'film', pct: 12, state: 'error',
      log: mkLog([
        ['00:00','sys',  'Kurátor spuštěn · model sonnet · projekt home-ops'],
        ['00:20','info', 'hledám snímky ve /Volumes/Photos/2026-06'],
        ['00:50','err',  'ENOENT: /Volumes/Photos není připojen'],
        ['00:50','sys',  'běh ukončen s chybou · žádná data nezměněna'],
      ]),
    },
    pipelineRun: null,
  },

  // ── 6. Queued ────────────────────────────────────────────────────────────
  {
    id: 'task-006',
    description: 'Zálohuj Obsidian vault na Holly a ověř integritu posledního snapshotu',
    createdAt: 'právě teď',
    status: 'queued',
    classification: null, agentRun: null, pipelineRun: null,
  },

  // ── 7. Classifying ───────────────────────────────────────────────────────
  {
    id: 'task-007',
    description: 'Srovnej stav všech zálohovacích úloh na Holly a pošli report',
    createdAt: 'před 8s',
    status: 'classifying',
    classification: null, agentRun: null, pipelineRun: null,
  },

  // ── 8. Running pipeline (PR Guard, single stage) ──────────────────────────
  {
    id: 'task-008',
    description: 'Pre-review PR feat/api-rate-limit před odesláním kolegům',
    createdAt: 'před 9 m',
    status: 'running',
    classification: {
      executorKind: 'pipeline', executorId: 'pr-guard', executorName: 'PR Guard',
      confidence: 0.93, confirmedAt: 'před 9 m', alternatives: [],
    },
    agentRun: null,
    pipelineRun: {
      pipelineName: 'PR Guard', budget: 8, totalCost: 1.40,
      startedAt: 'před 9 m', elapsed: '9 m',
      stages: [
        {
          idx: 0, agentName: 'Reviewer', agentGlyph: 'check', status: 'running',
          cost: 1.40, elapsed: '9m', output: null,
          log: mkLog([
            ['00:00','sys',  'fáze 1/1 · Reviewer spuštěn · model opus · thinking high'],
            ['02:10','info', 'načten diff feat/api-rate-limit · 6 souborů (+128/−34)'],
            ['05:30','info', 'procházím src/api/rate-limit.ts'],
            ['09:00','info', 'kontroluji edge cases a boundary conditions…'],
          ]),
          retryLoop: null,
        },
      ],
    },
  },
];

Object.assign(window, { TASKS_DATA, TASK_STATE });

// ZIBBY Velín-C — data pro mapu subsystémů (organismus).
// ZIBBY uprostřed orchestruje ~8 subsystémů. Každý má vlastní identitu (barva,
// glyf), aktuální stav (barva haló + pohyb) a posádku (agenti z data.jsx).
// Barva jádra orbu = identita subsystému · barva haló + pohyb = STAV.

// ── Stavy subsystému ──────────────────────────────────────────────────────
// idle · working · report (hotové hlášení čeká) · await (čeká na rozhodnutí) · incident
const VC_STATE = {
  idle:     { c: ZT.ink3, label: 'v klidu',            live: false },
  working:  { c: ZT.run,  label: 'pracuje',            live: true  },
  report:   { c: ZT.ok,   label: 'hlášení čeká',        live: true  },
  await:    { c: ZT.wait, label: 'čeká na rozhodnutí',  live: true  },
  incident: { c: ZT.bad,  label: 'incident',           live: true  },
};

// ── 8 subsystémů — pořadí = pozice na kruhu (od 12 h po směru) ─────────────
// hue = identita (stálá) · state = aktuální stav · active = počet právě
// zpracovávaných úloh (= počet obíhajících světel na orbitě)
const VC_SUBSYSTEMS = [
  {
    id: 'forge', name: 'Forge', hue: '#5b8def', glyph: 'code',
    mandate: 'Orchestrace delivery pipeline',
    tagline: 'Architekt → Kodér ⇄ Review → Tester → Dokumentátor',
    state: 'working', active: 2, featured: true,
    crew: ['Architekt', 'Kodér', 'Reviewer', 'Tester', 'Dokumentátor'],
    pipelines: [
      { id: 'build-feature', name: 'Build Feature', routing: 'bugfix, feature, refactor → Build Feature',
        phases: [{ agent: 'Architekt' }, { agent: 'Kodér' }, { agent: 'Tester', loop: { to: 'Kodér', maxRetries: 2 } }, { agent: 'Dokumentátor' }] },
      { id: 'release-train', name: 'Release Train', routing: 'štítek „release" / milestone hotový → Release Train',
        phases: [{ agent: 'Dokumentátor' }, { agent: 'Tester' }, { agent: 'Kodér' }] },
    ],
    ruleIds: ['gr-git-main', 'gr-merge'],
  },
  {
    id: 'herald', name: 'Herald', hue: '#56c4d6', glyph: 'link',
    mandate: 'Mluví za ZIBBY navenek',
    tagline: 'Reaktivní odpovědi i proaktivní dotazování',
    state: 'idle', active: 0,
    crew: [{ name: 'Vyslanec', glyph: 'link', role: 'formuluje odpovědi a dotazy jménem ZIBBY' }],
    pipelines: [{ id: 'outbound-reply', name: 'Outbound reply', routing: 'zmínka / DM / e-mail vyžadující odpověď → Outbound reply', phases: [{ agent: 'Vyslanec' }] }],
    ruleIds: ['gr-email'],
  },
  {
    id: 'sentinel', name: 'Sentinel', hue: '#34c9bd', glyph: 'shield',
    mandate: 'Bezpečnost vůči externímu prostředí',
    tagline: 'CVE závislostí · úniky tajemství',
    state: 'working', active: 1,
    crew: [{ name: 'Strážce', glyph: 'shield', role: 'skenuje závislosti a tajemství' }],
    pipelines: [{ id: 'dependency-scan', name: 'Dependency scan', routing: 'nová závislost / CVE upozornění → Dependency scan', phases: [{ agent: 'Strážce' }] }],
    ruleIds: ['gr-delete'],
  },
  {
    id: 'scout', name: 'Scout', hue: '#46cf8b', glyph: 'compass',
    mandate: 'Výzkumné pipeline',
    tagline: 'Sbírá zdroje, předává hotový artefakt dál',
    state: 'working', active: 1,
    crew: ['Researcher', 'Architekt'],
    pipelines: [{ id: 'nightly-research', name: 'Nightly Research', routing: 'výzkumný dotaz / „zjisti" → Nightly Research', phases: [{ agent: 'Researcher' }, { agent: 'Architekt' }] }],
    ruleIds: [],
  },
  {
    id: 'maestro', name: 'Maestro', hue: '#e0a83c', glyph: 'checkpoint',
    mandate: 'Releasy',
    tagline: 'Příprava · přehled · operátorem schválené sloučení',
    state: 'await', active: 0,
    crew: ['Dokumentátor', 'Tester', 'Kodér'],
    pipelines: [{ id: 'release-train-m', name: 'Release Train', routing: 'milestone dokončen → Release Train', phases: [{ agent: 'Dokumentátor' }, { agent: 'Tester' }, { agent: 'Kodér' }] }],
    ruleIds: ['gr-merge', 'gr-deploy'],
  },
  {
    id: 'beacon', name: 'Beacon', hue: '#f4785c', glyph: 'warn',
    mandate: 'Eskalace incidentů',
    tagline: 'Vlastní podoba Tier-3 kontraktu surface-and-wait',
    state: 'incident', active: 0,
    crew: [{ name: 'Hlídka', glyph: 'warn', role: 'povyšuje incidenty k tobě a čeká' }],
    pipelines: [{ id: 'escalation', name: 'Escalation', routing: 'incident Tier-3 / bez automatického řešení → Escalation', phases: [{ agent: 'Hlídka' }] }],
    ruleIds: [],
  },
  {
    id: 'puls', name: 'Puls', hue: '#f2749e', glyph: 'pulse',
    mandate: 'Srdeční tep systému',
    tagline: 'Sleduje kanály, kalendář a CI/CD',
    state: 'working', active: 1,
    crew: [{ name: 'Snímač', glyph: 'pulse', role: 'nepřetržitě čte kanály a CI' }],
    pipelines: [{ id: 'heartbeat', name: 'Heartbeat', routing: 'nepřetržitá — bez routování, běží stále', phases: [{ agent: 'Snímač' }] }],
    ruleIds: [],
  },
  {
    id: 'loom', name: 'Loom', hue: '#b07cff', glyph: 'search',
    mandate: 'Analýza kvality a architektury',
    tagline: 'Nálezy proaktivně předává Forge',
    state: 'report', active: 0,
    crew: ['Reviewer', 'Architekt'],
    pipelines: [{ id: 'codebase-watch', name: 'Codebase watch', routing: 'pravidelný scan architektury → Codebase watch', phases: [{ agent: 'Reviewer' }, { agent: 'Architekt' }] }],
    ruleIds: [],
  },
];
const vcSys = (id) => VC_SUBSYSTEMS.find((s) => s.id === id);

// ── Běžící úlohy napříč subsystémy (levitují vlevo) ───────────────────────
// Pořadí od nejčerstvější. Forge má nejbohatší detail; ostatní lehčí.
const VC_TASKS = [
  {
    id: 'tk-forge-search', sys: 'forge', title: 'feat/search-filters',
    kind: 'Build Feature', agent: 'Tester', pct: 74, phase: 'Tester', started: '42 min',
    proj: 'auth-svc', risk: null,
    phases: [
      { name: 'Architekt', produces: 'design.md', state: 'ok', time: '6 min', cost: 0.18, log: [
        { t: '06:07', lvl: 'info', text: 'Architekt → čtu task.md a stávající schéma users' },
        { t: '06:13', lvl: 'ok', text: 'design.md hotov (opus, high) — 3 nové query parametry' },
      ] },
      { name: 'Kodér', produces: 'branch feat/*', state: 'ok', time: '14 min', cost: 0.54, log: [
        { t: '06:13', lvl: 'info', text: 'Kodér → větev feat/search-filters založena' },
        { t: '06:21', lvl: 'ok', text: 'Implementace hotová · +214 −38 · 7 souborů' },
      ] },
      { name: 'Tester', produces: 'test-report.md', state: 'run', time: '9 min', cost: 0.31, log: [
        { t: '06:38', lvl: 'run',  text: 'Tester → spouštím suite (51 testů)' },
        { t: '06:41', lvl: 'warn', text: 'checkout-flow.spec — flaky (2/3), zkouším znovu' },
      ] },
      { name: 'Dokumentátor', produces: 'README.md', state: 'idle', time: null, cost: 0, log: [] },
    ],
    input: { prompt: 'Přidej filtrování a fulltextové vyhledávání do seznamu uživatelů podle specifikace v design.md. Filtry by měly podporovat kombinaci role, stavu účtu a data registrace, fulltext ať běží nad jménem a e-mailem s debounce 250 ms. Zachovej stávající paginaci a export do CSV, jen napoj nové query parametry na backend. Až budou testy zelené, aktualizuj README s příklady použití API a přidej krátkou sekci do CHANGELOG.', files: ['task.md', 'design.md'] },
    output: { kind: 'pr', pr: {
      number: 142, title: 'feat: search filters + fulltext', branch: 'feat/search-filters', base: 'main',
      diff: '+214 −38 · 7 souborů', ci: 'run', ciNote: '38/51 testů zelených',
      desc: 'Přidává filtrování (role, stav účtu, datum registrace) a fulltextové vyhledávání do seznamu uživatelů. Zachována stávající paginace a CSV export.',
    } },
  },
  {
    id: 'tk-forge-rate', sys: 'forge', title: 'feat/api-rate-limit',
    kind: 'Build Feature', agent: 'Kodér', pct: 41, phase: 'Kodér', started: '19 min',
    proj: 'auth-svc', risk: null,
    phases: [
      { name: 'Architekt', produces: 'design.md', state: 'ok', time: '4 min', cost: 0.12, log: [
        { t: '06:36', lvl: 'info', text: 'Architekt → design.md hotov — token-bucket, 100 req/min' },
      ] },
      { name: 'Kodér', produces: 'branch feat/*', state: 'run', time: '15 min', cost: 0.47, log: [
        { t: '06:40', lvl: 'run',  text: 'Kodér → implementuji middleware/rate-limit.ts' },
        { t: '06:52', lvl: 'info', text: 'Redis backend napojen, píšu jednotkové testy' },
      ] },
      { name: 'Tester', produces: 'test-report.md', state: 'idle', time: null, cost: 0, log: [] },
      { name: 'Dokumentátor', produces: 'README.md', state: 'idle', time: null, cost: 0, log: [] },
    ],
    input: { prompt: 'Implementuj token-bucket rate-limiter na /api dle design.md.', files: ['task.md', 'design.md'] },
    output: { kind: 'md', file: 'implementation-notes.md', note: 'rozpracováno · Kodér', content:
      '# Implementation notes — rate limiter\n\nToken-bucket, limit 100 req/min na IP + API klíč, sdílený stav v Redis.\n\n## Rozhodnutí\n- Bucket refill po 600 ms, burst do 20 tokenů.\n- 429 s `Retry-After` v headeru.\n- Middleware před routerem, ať se nedotýká business logiky.\n\n## Zbývá\n- Jednotkové testy pro edge-case souběžných požadavků.\n- Ověřit chování při výpadku Redis (fail-open vs fail-closed).' },
  },
  {
    id: 'tk-scout-agentsdk', sys: 'scout', title: 'Agent SDK cost controls',
    kind: 'Nightly Research', agent: 'Researcher', pct: 58, phase: 'Researcher', started: '2 h 10 min',
    proj: 'zibby-core', risk: null,
    phases: [
      { name: 'Researcher', produces: 'sources.md', state: 'run', time: '1 h 12 min', cost: 0.86, log: [
        { t: '04:41', lvl: 'run', text: 'Researcher → sbírám zdroje (web)' },
        { t: '05:58', lvl: 'info', text: '12 zdrojů uloženo, začínám syntézu' },
      ] },
      { name: 'Architekt', produces: 'knowledge/*.md', state: 'idle', time: null, cost: 0, log: [] },
    ],
    input: { prompt: 'Prozkoumej strategie řízení nákladů Agent SDK a shrň do vaultu.', files: ['topic.md'] },
    output: { kind: 'md', file: 'sources.md', note: '12 zdrojů · syntéza běží', content:
      '# Zdroje — cost controls Agent SDK\n\n1. Prompt caching snižuje náklady na opakované kontexty až o 60 %.\n2. Model routing (haiku pro klasifikaci, opus jen na rozhodnutí) šetří rozpočet bez ztráty kvality.\n3. Budget capy per-pipeline s tvrdým stopem zabraňují uzavřeným smyčkám.\n4. Batch API vhodné pro nekritické, dávkové úlohy (research, sumarizace).\n\n> Syntéza do knowledge/*.md běží — další update po dokončení.' },
  },
  {
    id: 'tk-sentinel-scan', sys: 'sentinel', title: 'Dependency scan · auth-svc',
    kind: 'Dependency scan', agent: 'Strážce', pct: 88, phase: 'Sken', started: '6 min',
    proj: 'auth-svc', risk: null,
    phases: [
      { name: 'Sken závislostí', produces: 'cve-report.md', state: 'run', time: '5 min', cost: 0.09, log: [
        { t: '06:49', lvl: 'run',  text: 'Strážce → 214 balíčků proti advisory DB' },
        { t: '06:53', lvl: 'warn', text: 'CVE-2026-0142 · lib xml-parse < 3.2 (moderate)' },
      ] },
      { name: 'Sken tajemství', produces: 'secrets-report.md', state: 'idle', time: null, cost: 0, log: [] },
    ],
    input: { prompt: 'Projeď lockfile proti CVE databázi a prohledej diff na úniky tajemství.', files: ['package-lock.json'] },
    output: { kind: 'md', file: 'cve-report.md', note: '1 nález — moderate', content:
      '# CVE report — auth-svc\n\n## Nálezy\n- **CVE-2026-0142** · `xml-parse < 3.2` · moderate\n  - Zneužitelné jen s nedůvěryhodným XML vstupem, který tato služba nepřijímá přímo od uživatele.\n  - Doporučení: povýšit na `3.2.1` při nejbližším sprintu.\n\n## Rozsah\n214 balíčků prověřeno proti advisory databázi, sken tajemství v diffu zatím nezahájen.' },
  },
  {
    id: 'tk-puls-heartbeat', sys: 'puls', title: 'Srdeční tep · kanály + CI',
    kind: 'Heartbeat', agent: 'Snímač', pct: null, phase: 'Nepřetržitě', started: 'od 04:00',
    proj: 'home-ops', risk: null, continuous: true,
    phases: [
      { name: 'Slack / #dev, #bugs', produces: 'stream', state: 'run', time: 'od 04:00', cost: 0.02, log: [
        { t: '06:54', lvl: 'info', text: '#bugs → 1 nový report zařazen (Tier 1)' },
      ] },
      { name: 'Kalendář', produces: 'stream', state: 'run', time: 'od 04:00', cost: 0.01, log: [
        { t: '05:30', lvl: 'info', text: 'Žádné kolize v dnešním kalendáři' },
      ] },
      { name: 'CI/CD webhooky', produces: 'stream', state: 'run', time: 'od 04:00', cost: 0.01, log: [
        { t: '06:52', lvl: 'info', text: 'CI zelené · auth-svc#build 1204' },
      ] },
    ],
    input: { prompt: 'Nepřetržitě čti kanály, kalendář a CI a povyšuj signály dál.', files: [] },
    output: { kind: 'none' },
  },
];
const vcTasksFor = (sysId) => VC_TASKS.filter((t) => t.sys === sysId);

// ── Dokončené úlohy — archiv, přístupný z doku napravo ────────────────────
const VC_TASKS_DONE = [
  {
    id: 'tk-forge-onboarding', sys: 'forge', title: 'feat/onboarding-v2', done: true, finishedAt: 'včera 18:42',
    kind: 'Build Feature', agent: 'Dokumentátor', pct: 100, phase: 'Hotovo', started: 'včera 16:10',
    proj: 'auth-svc', risk: null,
    phases: [
      { name: 'Architekt', produces: 'design.md', state: 'ok', time: '5 min', cost: 0.15, log: [{ t: '16:10', lvl: 'ok', text: 'design.md hotov' }] },
      { name: 'Kodér', produces: 'branch feat/*', state: 'ok', time: '22 min', cost: 0.61, log: [{ t: '16:32', lvl: 'ok', text: 'Implementace hotová · +340 −52' }] },
      { name: 'Tester', produces: 'test-report.md', state: 'ok', time: '11 min', cost: 0.28, log: [{ t: '16:43', lvl: 'ok', text: '64/64 testů zelených' }] },
      { name: 'Dokumentátor', produces: 'README.md', state: 'ok', time: '4 min', cost: 0.09, log: [{ t: '16:47', lvl: 'ok', text: 'README aktualizováno, CHANGELOG doplněn' }] },
    ],
    input: { prompt: 'Přeprac onboarding flow — sjednotit kroky, přidat progress indikátor.', files: ['task.md'] },
    output: { kind: 'pr', pr: {
      number: 138, title: 'feat: onboarding v2', branch: 'feat/onboarding-v2', base: 'main',
      diff: '+340 −52 · 9 souborů', ci: 'ok', ciNote: '64/64 testů zelených',
      desc: 'Sjednocený onboarding flow s progress indikátorem, sloučeno do main.',
    } },
  },
  {
    id: 'tk-sentinel-secrets', sys: 'sentinel', title: 'Sken tajemství · home-ops', done: true, finishedAt: 'včera 09:15',
    kind: 'Dependency scan', agent: 'Strážce', pct: 100, phase: 'Hotovo', started: 'včera 09:02',
    proj: 'home-ops', risk: null,
    phases: [
      { name: 'Sken závislostí', produces: 'cve-report.md', state: 'ok', time: '4 min', cost: 0.07, log: [{ t: '09:06', lvl: 'ok', text: '0 nálezů' }] },
      { name: 'Sken tajemství', produces: 'secrets-report.md', state: 'ok', time: '5 min', cost: 0.06, log: [{ t: '09:11', lvl: 'ok', text: 'Žádný únik nenalezen' }] },
    ],
    input: { prompt: 'Pravidelný sken závislostí a tajemství.', files: [] },
    output: { kind: 'md', file: 'secrets-report.md', note: 'čisté · 0 nálezů', content:
      '# Secrets report — home-ops\n\nPrověřeno 46 souborů v diffu za posledních 24 h. Žádný únik tajemství nenalezen.' },
  },
  {
    id: 'tk-maestro-r2026-5', sys: 'maestro', title: 'Release r2026.5', done: true, finishedAt: 'předevčírem 20:03',
    kind: 'Release Train', agent: 'Dokumentátor', pct: 100, phase: 'Hotovo', started: 'předevčírem 18:00',
    proj: 'auth-svc', risk: null,
    phases: [
      { name: 'Příprava', produces: 'changelog.md', state: 'ok', time: '9 min', cost: 0.11, log: [{ t: '18:09', lvl: 'ok', text: 'Changelog sestaven' }] },
      { name: 'Přehled', produces: 'release-notes.md', state: 'ok', time: '6 min', cost: 0.08, log: [{ t: '18:15', lvl: 'ok', text: 'Release notes hotové' }] },
      { name: 'Sloučení', produces: 'main', state: 'ok', time: '2 min', cost: 0.02, log: [{ t: '20:03', lvl: 'ok', text: 'Schváleno operátorem, sloučeno do main' }] },
    ],
    input: { prompt: 'Připrav a vydej Release Train r2026.5.', files: [] },
    output: { kind: 'pr', pr: {
      number: 137, title: 'release: r2026.5', branch: 'release/r2026.5', base: 'main',
      diff: '+520 −88 · 12 souborů', ci: 'ok', ciNote: 'smoke zelené',
      desc: 'Release r2026.5 — schváleno operátorem a sloučeno.',
    } },
  },
];
const vcTaskDoneRow = (t) => ({ label: t.title, sub: `${vcSys(t.sys).name} · ${t.finishedAt}`, glyph: 'ok', hue: vcSys(t.sys).hue, taskObj: t });

// ── Hlášení / položky čekající v subsystémech (report / await / incident) ─
const VC_SIGNALS = {
  loom: {
    kind: 'report',
    title: 'Architektonický nález předán Forge',
    body: 'auth-svc/session — cyklická závislost mezi modulem token a store. Navrhuju rozdělení do rozhraní; připravil jsem task pro Forge.',
    at: '05:12', evidence: 'severity: medium · 3 dotčené soubory',
  },
  sentinel: {
    kind: 'report',
    title: 'CVE-2026-0142 · xml-parse < 3.2',
    body: 'Moderate. Přítomno tranzitivně přes fast-feed. Fix: bump na 3.2.1 — kompatibilní dle changelogu.',
    at: '06:53', evidence: 'auth-svc · 1 balíček',
  },
  maestro: {
    kind: 'await', risk: 'push',
    title: 'Release r2026.6 čeká na sloučení',
    body: 'Release Train připraven: changelog, smoke zelené, tag r2026.6. Chybí jen tvoje schválené sloučení do main.',
    at: '06:30', impact: '4 PR · +812 −140', impactNote: 'CI zelené · review čisté',
  },
  forge: {
    kind: 'await', risk: 'push',
    title: 'feat/rate-limiter připraven ke sloučení',
    body: 'Kodér i Review hotovi, Tester zelený. Čeká jen na tvé schválení merge do main.',
    at: '05:48', impact: '1 PR · +266 −41', impactNote: 'CI zelené · review čisté',
  },
  herald: {
    kind: 'await', risk: 'send',
    title: 'Odpověď klientovi čeká na schválení',
    body: 'Připravil jsem návrh odpovědi na dotaz ohledně SLA — než ho odešlu navenek, potřebuju tvé OK.',
    at: '07:02', impact: '1 e-mail', impactNote: 'tón: formální · odchozí',
  },
  scout: {
    kind: 'await', risk: 'buy',
    title: 'Nákup datasetu — rozpočet nad limit',
    body: 'Výzkum vyžaduje placený dataset (~40 €), který přesahuje autonomní limit. Potřebuju tvé potvrzení nákupu.',
    at: '04:20', impact: '~40 €', impactNote: 'jednorázový nákup',
  },
  beacon: {
    kind: 'incident', risk: null,
    title: 'Tier-3 eskalace · auth-svc deploy blokován',
    body: 'Puls zachytil červené CI na main po hotfixi. Beacon to povýšil k tobě — surface-and-wait, nic sám neprovádí.',
    at: '06:47', impact: 'main · deploy stop', impactNote: 'build 1203 selhal · potřebuje rozhodnutí',
  },
};

// ── ZIBBY (střed) — celkový přehled napříč subsystémy ─────────────────────
const VC_CORE = {
  status: 'Nominal',
  summary: { working: 4, report: 2, await: 5, idle: 1 },
  overnight: 'Přes noc jsem 9 věcí vyřídil sám, 2 ti reportuju a 3 čekají na tvé slovo.',
  running: VC_TASKS.length,
};

// ── Periodicita pro lehké zakládání úlohy ─────────────────────────────────
const VC_CADENCE = [
  { id: 'once', label: 'Jednorázově', icon: 'arrow' },
  { id: 'daily', label: 'Každý den', icon: 'clock' },
  { id: 'weekly', label: 'Každý týden', icon: 'clock' },
  { id: 'event', label: 'Na událost', icon: 'pulse' },
];

Object.assign(window, {
  VC_STATE, VC_SUBSYSTEMS, vcSys, VC_TASKS, vcTasksFor, VC_TASKS_DONE, vcTaskDoneRow, VC_SIGNALS, VC_CORE, VC_CADENCE,
});

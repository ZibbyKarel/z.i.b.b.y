// ZIBBY velín — mock data pro nově navržené obrazovky
// (Schválení, Běhy/Aktivita, Integrace, Automatizace, Paměť)
// Drží stejný princip: každá karta = reálný soubor / běh / akce na disku.

// ---- RISK / STAVY --------------------------------------------------------
// Sémantické typy rizikových akcí (approval gate) jsou KANONICKÉ. Barvy z
// existující palety velínu. `sev` = sekundární závažnost odvozená z typu
// (nepřepisuje sémantiku, jen ji odstupňuje pro barvu meteru).
const RISK = {
  platba:   { label: 'platba',   glyph: 'cart',   c: '#f0b429', sev: 'high' },  // amber · peníze odejdou
  mazani:   { label: 'mazání',   glyph: 'trash',  c: '#ff6b6b', sev: 'high' },  // red · nevratná ztráta dat
  push:     { label: 'push',     glyph: 'branch', c: '#b07cff', sev: 'med'  },  // violet · revertovatelné
  odeslani: { label: 'odeslání', glyph: 'arrow',  c: '#56c4d6', sev: 'low'  },  // cyan · nižší materiální dopad
};

// Sekundární stupeň závažnosti — odvozený z typu, ne náhrada za něj.
// Barvy ze statusové palety (zelená/amber/červená).
const SEVERITY = {
  low:  { label: 'nízká',   c: Z.ok,   n: 1 },
  med:  { label: 'střední', c: Z.warn, n: 2 },
  high: { label: 'vysoká',  c: Z.bad,  n: 3 },
};
const sevOf = (riskType) => SEVERITY[(RISK[riskType] || {}).sev] || SEVERITY.med;

// Jmenný nástroj integrace → sémantický typ rizika (pro gate panel skillu).
const INT_TOOL_RISK = {
  'rohlik.order': 'platba',
  'holly.delete': 'mazani',
  'git.push':     'push',
  'slack.post':   'odeslani',
};
// typ rizika pro jakýkoli nástroj — jmenný (integrace) i abstraktní (schopnost)
const riskTypeOfTool = (tool) => INT_TOOL_RISK[tool] || (typeof TOOL_RISK !== 'undefined' ? TOOL_RISK[tool] : undefined) || null;

// Stavy běhu — první třída napříč velínem (vč. awaiting-approval).
// `canon` = kontraktový název z backendu; `label` = český štítek pro UI.
const RUN_STATE = {
  running:   { canon: 'running',           label: 'běží',         c: '#7aa5f8', glyph: 'run',   pulse: true },
  await:     { canon: 'awaiting-approval',  label: 'čeká na tebe', c: '#f0b429', glyph: 'wait',  pulse: true },
  done:      { canon: 'done',               label: 'hotovo',       c: '#3fcf8e', glyph: 'ok',    pulse: false },
  error:     { canon: 'error',              label: 'chyba',        c: '#ff6b6b', glyph: 'warn',  pulse: false },
  interrupt: { canon: 'interrupted',        label: 'přerušeno',    c: '#9aa7b4', glyph: 'stop',  pulse: false },
};

// ---- APPROVAL QUEUE ------------------------------------------------------
// Fronta čekajících schválení. Každá položka odkazuje na běh, který je
// zaparkovaný ve stavu awaiting-approval, a nese náhled konkrétní akce.
const APPROVAL_QUEUE = [
  {
    id: 'apq1', runId: 'r-rohlik-2207', actor: 'rohlik', actorKind: 'skill', glyph: 'cart',
    risk: 'platba', action: 'Objednat a zaplatit košík',
    summary: '14 položek · 1 248 Kč · doručení zítra 18–20h',
    requested: 'před 2 m', via: 'Nedělní nákup (automatizace)',
    consequence: 'Objednávka se odešle do Rohlíku a stáhne se z karty. Vratné jen do 23:00.',
    preview: {
      kind: 'cart', total: '1 248 Kč', meta: 'doručení zítra 18–20h · Rohlik.cz',
      items: [
        ['Mléko Olma 1,5% · 6×', '209 Kč'],
        ['Chléb kváskový 800g', '49 Kč'],
        ['Rajčata keříková 1kg', '79 Kč'],
        ['Kuřecí prsa 1kg', '189 Kč'],
        ['Banány 1kg', '36 Kč'],
        ['Káva Lavazza 1kg', '399 Kč'],
        ['Vejce M 10ks', '79 Kč'],
        ['+ 7 dalších položek', '208 Kč'],
      ],
    },
  },
  {
    id: 'apq2', runId: 'r-prguard-118', actor: 'PR Guard', actorKind: 'pipeline', glyph: 'flow',
    risk: 'push', action: 'git push origin feat/api-rate-limit',
    summary: 'Reviewer schválil · 3 commity · 6 souborů (+128 / −34)',
    requested: 'před 9 m', via: 'PR Guard → fáze Reviewer',
    consequence: 'Branch se vypushuje na origin a otevře se PR. Push lze revertnout, historie zůstane.',
    preview: {
      kind: 'diff', file: 'src/api/rate-limit.ts', meta: 'feat/api-rate-limit · 6 souborů',
      hunks: [
        { h: '@@ -12,6 +12,9 @@ export class RateLimiter {', lines: [
          ['ctx', '  private window = 60_000;'],
          ['add', '  private max = 100;'],
          ['add', '  private store = new Map<string, number[]>();'],
          ['ctx', ''],
          ['del', '  allow(key: string) { return true; }'],
          ['add', '  allow(key: string) {'],
          ['add', '    const now = Date.now();'],
          ['add', '    const hits = (this.store.get(key) ?? []).filter(t => now - t < this.window);'],
          ['add', '    if (hits.length >= this.max) return false;'],
          ['add', '    hits.push(now); this.store.set(key, hits); return true;'],
          ['add', '  }'],
        ] },
      ],
    },
  },
  {
    id: 'apq3', runId: 'r-holly-552', actor: 'holly', actorKind: 'skill', glyph: 'server',
    risk: 'mazani', action: 'Smazat 312 GB starých snapshotů na Holly',
    summary: 'NAS Holly · /volume1/snapshots · 14 snapshotů starších 90 dní',
    requested: 'před 21 m', via: 'ad-hoc běh',
    consequence: 'Snapshoty se nevratně smažou z NASu. Uvolní se 312 GB. Aktuální záloha zůstává.',
    preview: {
      kind: 'command', shell: 'holly',
      cmd: 'ssh holly "btrfs subvolume delete \\\n  /volume1/snapshots/2026-0{1,2}-*"',
      note: '14 cílů · ověřeno proti retenční politice 90 dní',
      targets: [
        '2026-01-04T03:00  · 22.4 GB',
        '2026-01-11T03:00  · 23.1 GB',
        '2026-01-18T03:00  · 21.8 GB',
        '… +11 dalších snapshotů',
      ],
    },
  },
  {
    id: 'apq4', runId: 'r-standup-901', actor: 'standup-gen', actorKind: 'skill', glyph: 'spark',
    risk: 'odeslani', action: 'Odeslat standup do #team-eng (Slack)',
    summary: 'Vygenerováno z 7 commitů · 3 odrážky · adresát #team-eng',
    requested: 'před 35 m', via: 'Ranní standup (automatizace)',
    consequence: 'Zpráva se odešle do veřejného kanálu #team-eng. Po odeslání ji nelze stáhnout.',
    preview: {
      kind: 'message', to: '#team-eng · Slack', subject: 'Standup · út 3. čer',
      body: 'Včera: dotáhl rate-limiter (feat/api-rate-limit), čeká na review.\nDnes: merge rate-limiteru, začínám na cache vrstvě.\nBlokace: žádné — CI je zelené.',
    },
  },
];

// ---- BĚHY / AKTIVITA -----------------------------------------------------
// Plný feed běhů agentů a pipeline. log = streamované řádky (level: info/ok/warn/err/sys).
const mkLog = (rows) => rows.map(([t, level, text], i) => ({ id: i, t, level, text }));

const RUNS = [
  {
    id: 'r-tmdb-3041', kind: 'skill', name: 'tmdb-renamer', glyph: 'film',
    target: 'media-vault', prompt: 'Srovnej /media/downloads/seriály podle TMDB',
    state: 'running', pct: 72, started: 'před 3 m', elapsed: '3 m 11 s', cost: '$0.42',
    agent: 'Kurátor',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill tmdb-renamer · model sonnet · projekt media-vault'],
      ['00:02', 'info', 'načteno 25 souborů z /media/downloads/seriály'],
      ['00:09', 'info', 'dotaz TMDB: "Severance S02" → tt11280740'],
      ['00:31', 'ok', 'přejmenováno 12 / 25 · Severance/S02/'],
      ['01:48', 'info', 'dotaz TMDB: "The Bear S03" → tt14452776'],
      ['02:55', 'ok', 'přejmenováno 18 / 25 · The.Bear/S03/'],
      ['03:11', 'info', 'zpracovávám zbývajících 7 souborů…'],
    ]),
  },
  {
    id: 'r-webshare-2298', kind: 'skill', name: 'webshare-downloader', glyph: 'film',
    target: 'media-vault', prompt: 'Stáhni S02E04–E08',
    state: 'running', pct: 41, started: 'před 8 m', elapsed: '8 m 02 s', cost: '$0.18',
    agent: 'Kurátor',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill webshare-downloader · projekt media-vault'],
      ['00:04', 'info', 'rozlišeno 5 epizod · Webshare API'],
      ['01:10', 'ok', 'E04 staženo · 1.4 GB'],
      ['03:40', 'ok', 'E05 staženo · 1.5 GB'],
      ['08:00', 'info', 'E06 — 41 % · 620 MB / 1.5 GB'],
    ]),
  },
  {
    id: 'r-rohlik-2207', kind: 'skill', name: 'rohlik', glyph: 'cart',
    target: 'rohlik-list', prompt: 'Naplň košík podle seznamu na tento týden',
    state: 'await', pct: 100, started: 'před 2 m', elapsed: '1 m 50 s', cost: '$0.09',
    agent: 'Hospodář', approvalId: 'apq1',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill rohlik · projekt rohlik-list'],
      ['00:05', 'info', 'načten nákupní seznam · 14 položek'],
      ['01:30', 'ok', 'košík sestaven · 14 / 14 položek nalezeno'],
      ['01:50', 'warn', 'akce „platba" vyžaduje tvé schválení — zastaveno'],
    ]),
  },
  {
    id: 'r-build-1190', kind: 'pipeline', name: 'Build Feature', glyph: 'flow',
    target: 'zibby-core', prompt: 'Implementuj search filtry podle task.md',
    state: 'await', pct: 76, started: 'před 41 m', elapsed: '38 m', cost: '$11.20',
    phase: 'Tester → park', approvalId: null,
    log: mkLog([
      ['00:00', 'sys', 'pipeline Build Feature · 4 fáze · strop $25'],
      ['02:10', 'ok', 'Architekt → design.md hotov'],
      ['14:30', 'ok', 'Kodér → branch feat/search-filters'],
      ['31:00', 'warn', 'Tester → flaky test v checkout-flow (pokus 3/3)'],
      ['38:00', 'warn', 'eskalace vyčerpána → zaparkováno k ranní review'],
    ]),
  },
  {
    id: 'r-cidoctor-880', kind: 'skill', name: 'ci-doctor', glyph: 'shield',
    target: 'auth-svc', prompt: 'Proč padá pipeline na main?',
    state: 'done', pct: 100, started: 'před 14 m', elapsed: '2 m 40 s', cost: '$0.31',
    agent: 'Tester',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill ci-doctor · projekt auth-svc'],
      ['00:40', 'info', 'staženy logy posledního běhu CI'],
      ['01:30', 'info', 'nalezen flaky test: auth.spec.ts „refresh token"'],
      ['02:30', 'ok', 'navržen fix · seed náhodného času → fixed clock'],
      ['02:40', 'ok', 'hotovo · report v test-report.md'],
    ]),
  },
  {
    id: 'r-research-771', kind: 'pipeline', name: 'Nightly Research', glyph: 'flow',
    target: 'zibby-core', prompt: 'Posbírej zdroje k local-first sync',
    state: 'done', pct: 100, started: 'dnes 02:40', elapsed: '19 m', cost: '$2.10',
    phase: 'hotovo · 2/2',
    log: mkLog([
      ['00:00', 'sys', 'pipeline Nightly Research · 2 fáze'],
      ['06:20', 'ok', 'Researcher → sources.md (11 zdrojů)'],
      ['19:00', 'ok', 'Architekt → knowledge/local-first-sync.md'],
    ]),
  },
  {
    id: 'r-photo-560', kind: 'skill', name: 'photo-cull', glyph: 'film',
    target: 'home-ops', prompt: 'Vyber nejlepší z víkendového focení',
    state: 'error', pct: 38, started: 'před 1 h', elapsed: '0 m 50 s', cost: '$0.04',
    agent: 'Kurátor',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill photo-cull · projekt home-ops'],
      ['00:20', 'info', 'nalezeno 412 snímků'],
      ['00:50', 'err', 'chyba: /Volumes/Photos není připojen (ENOENT)'],
      ['00:50', 'sys', 'běh ukončen s chybou · žádná data nezměněna'],
    ]),
  },
  {
    id: 'r-changelog-410', kind: 'skill', name: 'changelog-gen', glyph: 'doc',
    target: 'zibby-core', prompt: 'Changelog od v0.4.0',
    state: 'interrupt', pct: 22, started: 'včera 18:02', elapsed: '0 m 30 s', cost: '$0.02',
    agent: 'Dokumentátor',
    log: mkLog([
      ['00:00', 'sys', 'spuštěn skill changelog-gen'],
      ['00:30', 'sys', 'přerušeno uživatelem (Zastavit běh)'],
    ]),
  },
];

// ---- INTEGRACE -----------------------------------------------------------
// Karta = připojený nástrojový zdroj. Dva druhy: `mcp` (MCP server) a `cli`
// (lokální nástroj příkazové řádky). Přes ně dostávají skilly/agenti nástroje.
// risky[] + usedBy[] zůstávají — krmí gating (risk je vlastnost nástroje).
const INTEGRATIONS = [
  {
    id: 'rohlik', name: 'Rohlik', glyph: 'cart', kind: 'mcp', enabled: true,
    desc: 'MCP server nad Rohlík API — vyhledávání, košík, objednávka.',
    transport: 'npx @zibby/rohlik-mcp', lastUsed: 'před 2 m',
    tools: ['rohlik.search', 'rohlik.cart', 'rohlik.order'],
    risky: ['rohlik.order'], usedBy: ['rohlik', 'meal-planner'],
  },
  {
    id: 'tmdb', name: 'TMDB', glyph: 'film', kind: 'mcp', enabled: true,
    desc: 'MCP server nad The Movie Database — metadata pro pojmenování médií.',
    transport: 'npx @zibby/tmdb-mcp', lastUsed: 'před 3 m',
    tools: ['tmdb.search', 'tmdb.meta'],
    risky: [], usedBy: ['tmdb-renamer'],
  },
  {
    id: 'webshare', name: 'Webshare', glyph: 'film', kind: 'mcp', enabled: true,
    desc: 'MCP server nad Webshare.cz API — hledání a stahování.',
    transport: 'npx @zibby/webshare-mcp', lastUsed: 'před 8 m',
    tools: ['webshare.search', 'webshare.download'],
    risky: [], usedBy: ['webshare-downloader'],
  },
  {
    id: 'slack', name: 'Slack', glyph: 'spark', kind: 'mcp', enabled: true,
    desc: 'MCP server pro odesílání zpráv a standupů do kanálů.',
    transport: 'npx @zibby/slack-mcp', lastUsed: 'před 35 m',
    tools: ['slack.post', 'slack.read'],
    risky: ['slack.post'], usedBy: ['standup-gen'],
  },
  {
    id: 'holly', name: 'Holly NAS', glyph: 'server', kind: 'cli', enabled: true,
    desc: 'CLI přes ssh — snapshoty, služby, místo na disku, média.',
    transport: 'ssh holly.local', lastUsed: 'před 31 m',
    tools: ['holly.exec', 'holly.snapshot', 'holly.df', 'holly.delete'],
    risky: ['holly.delete'], usedBy: ['holly', 'nas-backup'],
  },
  {
    id: 'git', name: 'Git / GitHub', glyph: 'branch', kind: 'cli', enabled: true,
    desc: 'CLI git + gh — diff, branch, commit, push, PR.',
    transport: 'git · gh', lastUsed: 'před 9 m',
    tools: ['git.read', 'git.branch', 'git.commit', 'git.push'],
    risky: ['git.push'], usedBy: ['spec→skeleton', 'pr-prereview', 'ci-doctor'],
  },
  {
    id: 'jdownloader', name: 'JDownloader', glyph: 'plug', kind: 'cli', enabled: true,
    desc: 'CLI most do My.JDownloader fronty stahování na Holly.',
    transport: 'jdownloader-cli', lastUsed: 'před 31 m',
    tools: ['jd.add', 'jd.status', 'jd.start'],
    risky: [], usedBy: ['webshare-downloader'],
  },
];
const INTEGRATION_CATALOG = [
  { id: 'gcal', name: 'Google Calendar', glyph: 'clock', kind: 'mcp', desc: 'MCP · události a připomínky.' },
  { id: 'notion', name: 'Notion', glyph: 'doc', kind: 'mcp', desc: 'MCP · databáze a poznámky.' },
  { id: 'home-assistant', name: 'Home Assistant', glyph: 'bot', kind: 'mcp', desc: 'MCP · chytrá domácnost.' },
  { id: 'ffmpeg', name: 'ffmpeg', glyph: 'film', kind: 'cli', desc: 'CLI · převod a střih médií.' },
  { id: 'rclone', name: 'rclone', glyph: 'server', kind: 'cli', desc: 'CLI · sync cloud úložišť.' },
  { id: 'yt-dlp', name: 'yt-dlp', glyph: 'film', kind: 'cli', desc: 'CLI · stahování videí.' },
];

// ---- AUTOMATIZACE --------------------------------------------------------
// Trigger (cron / event) → spustí skill, agenta nebo pipeline. Tady vzniká autonomie.
// Rizikové akce výsledku ale stejně projdou approval frontou.
const AUTOMATIONS = [
  {
    id: 'au-standup', name: 'Ranní standup', enabled: true,
    trigger: { type: 'cron', spec: 'Po–Pá · 08:00', human: 'každý všední den v 8:00' },
    target: { kind: 'briefing', name: 'briefing', glyph: 'spark' },
    lastRun: 'dnes 08:00', lastState: 'await', nextRun: 'zítra 08:00',
    requiresApproval: true, gate: 'odeslání do Slacku', actionSafeAfter: 'po 09:00',
    desc: 'Vygeneruje standup z gitu a připraví ho k odeslání do #team-eng.',
    file: '~/zibby/automations/standup.cron.md',
  },
  {
    id: 'au-research', name: 'Noční research', enabled: true,
    trigger: { type: 'cron', spec: 'denně · 02:40', human: 'každou noc ve 2:40' },
    target: { kind: 'pipeline', name: 'Nightly Research', glyph: 'flow' },
    lastRun: 'dnes 02:40', lastState: 'done', nextRun: 'zítra 02:40',
    requiresApproval: false, gate: null,
    desc: 'Researcher nasbírá zdroje k tématu z fronty, Architekt je zsyntetizuje do vaultu.',
    file: '~/zibby/automations/nightly-research.cron.md',
  },
  {
    id: 'au-media', name: 'Po stažení srovnej média', enabled: true,
    trigger: { type: 'event', spec: 'soubor přibyl v /media/downloads', human: 'při novém souboru ve složce stahování' },
    target: { kind: 'agent', name: 'Kurátor', glyph: 'film' },
    lastRun: 'před 3 m', lastState: 'running', nextRun: '— (na událost)',
    requiresApproval: false, gate: null,
    desc: 'Jakmile dorazí nová epizoda, automaticky ji pojmenuje podle TMDB a zařadí do knihovny.',
    file: '~/zibby/automations/media-tidy.event.md',
  },
  {
    id: 'au-nakup', name: 'Nedělní nákup', enabled: true,
    trigger: { type: 'cron', spec: 'Ne · 18:00', human: 'každou neděli v 18:00' },
    target: { kind: 'agent', name: 'Hospodář', glyph: 'cart' },
    lastRun: 'před 2 m', lastState: 'await', nextRun: 'Ne 18:00',
    requiresApproval: true, gate: 'platba košíku', actionSafeAfter: 'po potvrzení jídelníčku',
    desc: 'Sestaví týdenní košík z jídelníčku a připraví ho k objednání — platba čeká na tebe.',
    file: '~/zibby/automations/sunday-shop.cron.md',
  },
  {
    id: 'au-backup', name: 'Záloha vaultu', enabled: true,
    trigger: { type: 'cron', spec: 'denně · 04:00', human: 'každou noc ve 4:00' },
    target: { kind: 'briefing', name: 'briefing', glyph: 'server' },
    lastRun: 'dnes 04:00', lastState: 'done', nextRun: 'zítra 04:00',
    requiresApproval: false, gate: null,
    desc: 'Snapshot Obsidian vaultu na Holly a ověření integrity poslední zálohy.',
    file: '~/zibby/automations/backup.cron.md',
  },
  {
    id: 'au-pr', name: 'Hlídač PR', enabled: false,
    trigger: { type: 'event', spec: 'otevřen PR na GitHubu', human: 'při otevření pull requestu' },
    target: { kind: 'pipeline', name: 'PR Guard', glyph: 'flow' },
    lastRun: 'včera 18:02', lastState: 'interrupt', nextRun: '— (pozastaveno)',
    requiresApproval: true, gate: 'git push',
    desc: 'Reviewer projde diff nového PR a připraví push k tvému schválení.',
    file: '~/zibby/automations/pr-guard.event.md',
  },
];

// ---- PAMĚŤ (Obsidian vault) ---------------------------------------------
// Vrstvy: index (MOC/vstupní body) · long (MEMORY.md) · knowledge (tematické) · daily (epizodické).
// Navigace index-first (ne vektorový RAG): vstupní MOC soubory odkazují dál.
const MEM_LAYER = {
  index:     { label: 'index · MOC',  c: '#5b8def' },
  long:      { label: 'MEMORY.md',    c: '#f0b429' },
  knowledge: { label: 'knowledge/',   c: '#56c4d6' },
  daily:     { label: 'daily/',       c: '#7fd98a' },
};

const VAULT_NODES = [
  { id: 'index',  label: 'index.md',                 layer: 'index', anchor: true,
    body: '# index · MOC\n\nVstupní bod vaultu. Odsud vede cesta ke všemu — ZIBBY čte odtud, ne přes vektory.\n\n## Oblasti\n- [[MEMORY]] — dlouhodobá fakta o mně\n- [[projekty]] — co se zrovna staví\n- [[knowledge]] — tematické střípky\n\n## Poslední dny\n- [[2026-05-30]]\n- [[2026-05-29]]' },
  { id: 'projekty', label: 'MOC/projekty.md',        layer: 'index',
    body: '# projekty · MOC\n\nRozcestník aktivních projektů.\n\n- [[zibby-architektura]]\n- [[media-pipeline]]\n- [[git-workflow]]' },
  { id: 'memory', label: 'MEMORY.md',                layer: 'long', anchor: true,
    body: '# MEMORY\n\nDlouhodobá, stabilní fakta. Re-anchor sem vrací kontext po kompakci.\n\n## O mně\n- Honza, vývojář, Praha. Mac M5 jako host.\n- NAS „Holly" na holly.local.\n\n## Preference\n- Češtinu má radši než angličtinu.\n- Nikdy neplatit ani nemazat bez ptaní.\n\n## Vztahy\n- [[zibby-architektura]] řídí celý velín.' },
  { id: 'k-zibby', label: 'knowledge/zibby-architektura.md', layer: 'knowledge',
    body: '# ZIBBY architektura\n\nSoubory jsou jediný zdroj pravdy. Démon běží jako služba na hostu, agenty pouští jako child procesy.\n\n- Skilly: `~/zibby/skills/<id>/SKILL.md`\n- Agenti: `~/zibby/agents/<id>.agent.md`\n- Approval gate je hard-enforcement vrstva.\n\nViz [[claude-sdk]], [[git-workflow]].' },
  { id: 'k-rohlik', label: 'knowledge/rohlik.md',    layer: 'knowledge',
    body: '# Rohlik\n\nSkill `rohlik` plní košík přes API. Objednávka = riziková akce → vždy schválení.\n\n- Doručovací okna 18–20h preferovaná.\n- Viz daily [[2026-05-30]].' },
  { id: 'k-holly', label: 'knowledge/holly-nas.md',  layer: 'knowledge',
    body: '# Holly (NAS)\n\nHolly NENÍ host démona — je to NAS ovládaný skillem `holly`.\n\n- Snapshoty: btrfs, retence 90 dní.\n- Mazání snapshotů = riziková akce.' },
  { id: 'k-sdk', label: 'knowledge/claude-sdk.md',   layer: 'knowledge',
    body: '# Claude Agent SDK\n\nBěhy agentů čerpají z odděleného $ měšce (priorita). Interaktivní limity jsou jinde.\n\nViz [[zibby-architektura]].' },
  { id: 'k-git', label: 'knowledge/git-workflow.md', layer: 'knowledge',
    body: '# Git workflow\n\nAgenti pracují v izolovaných branchích. Push origin = riziková akce → approval.\n\nPipeline [[zibby-architektura]] parkuje PR k ranní review.' },
  { id: 'k-media', label: 'knowledge/media-pipeline.md', layer: 'knowledge',
    body: '# Media pipeline\n\nWebshare → JDownloader → Holly → tmdb-renamer. Pojmenování dle TMDB.\n\nViz [[rohlik]] (jiný kontext domácnosti), daily [[2026-05-28]].' },
  { id: 'd-30', label: 'daily/2026-05-30.md',        layer: 'daily',
    body: '# 2026-05-30\n\n- standup-gen aktualizoval [[MEMORY]].\n- rohlik sestavil košík → čekalo na schválení. Viz [[rohlik]].\n- ci-doctor opravil flaky test.' },
  { id: 'd-29', label: 'daily/2026-05-29.md',        layer: 'daily',
    body: '# 2026-05-29\n\n- Build Feature dotáhl search filtry.\n- Diskuze o [[git-workflow]] a push gate.' },
  { id: 'd-28', label: 'daily/2026-05-28.md',        layer: 'daily',
    body: '# 2026-05-28\n\n- Stažena S02 přes [[media-pipeline]].\n- Holly měl málo místa → [[holly-nas]].' },
  { id: 'd-27', label: 'daily/2026-05-27.md',        layer: 'daily',
    body: '# 2026-05-27\n\n- Nightly Research → poznámka o local-first sync.\n- Viz [[claude-sdk]].' },
];

// hrany (wiki-linky) — neorientované páry id↔id
const VAULT_LINKS = [
  ['index', 'memory'], ['index', 'projekty'], ['index', 'd-30'], ['index', 'd-29'],
  ['projekty', 'k-zibby'], ['projekty', 'k-media'], ['projekty', 'k-git'],
  ['memory', 'k-zibby'],
  ['k-zibby', 'k-sdk'], ['k-zibby', 'k-git'],
  ['k-media', 'k-rohlik'], ['k-media', 'k-holly'],
  ['d-30', 'memory'], ['d-30', 'k-rohlik'],
  ['d-29', 'k-git'],
  ['d-28', 'k-media'], ['d-28', 'k-holly'],
  ['d-27', 'k-sdk'],
];

// ---- File-level gating: skill → rizikové nástroje integrací --------------
// Risk je vlastnost nástroje integrace (it.risky). Skill je „gated", pokud
// sahá na integraci s rizikovým nástrojem. Tady to odvodíme a promítneme do
// SKILL.md frontmatteru — princip „karta = soubor" platí i pro approval policy.
const riskyToolsForSkill = (skill) => {
  const keys = [skill.name, skill.id].filter(Boolean);
  const out = [];
  INTEGRATIONS.forEach((it) => {
    if ((it.usedBy || []).some((u) => keys.includes(u))) {
      (it.risky || []).forEach((t) => { if (!out.includes(t)) out.push(t); });
    }
  });
  return out;
};

// Doplň gating do kanonického katalogu SKILLS a přegeneruj body s frontmatterem.
// (mutace na místě — App čte stejnou referenci, takže se to projeví ve stavu.)
if (typeof SKILLS !== 'undefined') {
  SKILLS.forEach((s) => {
    s.riskyTools = riskyToolsForSkill(s);
    if (typeof mkSkillBody !== 'undefined') s.body = mkSkillBody(s);
  });
}

Object.assign(window, {
  RISK, SEVERITY, sevOf, INT_TOOL_RISK, riskTypeOfTool, riskyToolsForSkill,
  RUN_STATE, APPROVAL_QUEUE, RUNS, mkLog,
  INTEGRATIONS, INTEGRATION_CATALOG, AUTOMATIONS,
  MEM_LAYER, VAULT_NODES, VAULT_LINKS,
});

// ZIBBY velín — shared tokens, mock data, icons
// Files are source of truth — every card maps to a real file on disk.

// FOUNDATION (redesign) — sjednoceno s ZT (viz zibby/zt.jsx).
// Barva = stav · 3 úrovně povrchů · jediný akcent (interakce/brand, ne „běží")
// · radius 6 ovládací / 10 panely. Klíče zachovány kvůli ~22 navazujícím obrazovkám.
const Z = {
  // scéna + povrchy — 3 úrovně (konec ad-hoc rgba)
  bg0: '#090c11',      // nejtmavší — sidebar / rail
  bg1: '#0b0e13',      // scéna
  bg2: '#10151c',      // surface
  panel: '#10151c',    // surface
  panelHi: '#151c25',  // surface-hi
  line: 'rgba(255,255,255,0.08)',
  lineHi: 'rgba(255,255,255,0.14)',
  ink: '#e6edf3',
  inkDim: '#9aa7b4',
  inkFaint: '#66737f',
  // akcent (interakce, výběr, brand — UŽ NE stav „běží")
  home: '#f0b429',     // amber (kontext zrušen; ponecháno pro kompatibilitu)
  homeDim: 'rgba(240,180,41,0.14)',
  work: '#5b8def',     // jediný akcent
  workDim: 'rgba(91,141,239,0.14)',
  // stavy — jediné barvy, které smí svítit
  ok: '#3fcf8e',
  warn: '#f0b429',
  bad: '#ff6b6b',
  run: '#7aa5f8',      // stav „běží" — odlišený od akcentu
  // tvar
  rCtl: 6,             // ovládací prvky, chipy
  rPanel: 10,          // panely, modaly
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
};

// Jednotný akcent — kontext home/work byl odstraněn. Argumenty se ignorují,
// aby zůstala kompatibilita s dřívějšími voláními accentOf(ctx).
const accentOf = () => Z.work;
const accentDimOf = () => Z.workDim;

// ---- Mock domain data ----------------------------------------------------

// A) Interaktivní limity (Claude Code / Claude web) — chat + interaktivní práce
const CLAUDE_LIMITS = {
  rolling: { label: '5h rolling', short: '5h',    usedPct: 64, resetIn: '2h 11m', tokens: '128k / 200k' },
  weekly:  { label: 'Týdenní',    short: 'týden', usedPct: 38, resetIn: 'Po 09:00', tokens: '1.9M / 5M' },
};

// B) Agent SDK kredit — oddělený měšec, ze kterého čerpají běhy agentů (priorita)
const AGENT_SDK = {
  label: 'Agent SDK kredit',
  total: 200, used: 72, remaining: 128, usedPct: 36, renew: '1. čer',
  byAgent: [['Kodér','work',31],['Architekt','work',16],['Tester','work',11],['Researcher','work',8],['tmdb-renamer','home',6]],
  byPipeline: [['Build Feature','work',38],['Nightly Research','work',19],['Media tidy','home',8],['Ad-hoc běhy','work',7]],
  byContext: [['work', 57],['home', 15]],
  trend: [4,6,9,7,12,8,14,11,9,13,16,12,10,15], // posledních 14 dní ($)
};

// favorite skills for quick-launch (home context)
const FAV_SKILLS = [
  { id: 'rohlik', name: 'rohlik', glyph: 'cart', desc: 'Naplní košík podle seznamu', ctx: 'home', file: '~/zibby/skills/rohlik/SKILL.md' },
  { id: 'tmdb-renamer', name: 'tmdb-renamer', glyph: 'film', desc: 'Přejmenuje média podle TMDB', ctx: 'home', file: '~/zibby/skills/tmdb-renamer/SKILL.md' },
  { id: 'holly', name: 'holly', glyph: 'server', desc: 'Ovládá NAS démona Holly', ctx: 'home', file: '~/zibby/skills/holly/SKILL.md' },
  { id: 'task-spec-writer', name: 'task-spec-writer', glyph: 'doc', desc: 'Sepíše spec z volného zadání', ctx: 'home', file: '~/zibby/skills/task-spec-writer/SKILL.md' },
];

const FAV_SKILLS_WORK = [
  { id: 'spec-skeleton', name: 'spec→skeleton', glyph: 'doc', desc: 'Spec → kostra PR', ctx: 'work', file: '~/zibby/skills/spec-skeleton/SKILL.md' },
  { id: 'pr-prereview', name: 'pr-prereview', glyph: 'check', desc: 'Pre-review otevřeného PR', ctx: 'work', file: '~/zibby/skills/pr-prereview/SKILL.md' },
  { id: 'ci-doctor', name: 'ci-doctor', glyph: 'shield', desc: 'Diagnostikuje padající CI', ctx: 'work', file: '~/zibby/skills/ci-doctor/SKILL.md' },
  { id: 'standup-gen', name: 'standup-gen', glyph: 'spark', desc: 'Vygeneruje standup z gitu', ctx: 'work', file: '~/zibby/skills/standup-gen/SKILL.md' },
];

const favsFor = (ctx) => (ctx === 'work' ? FAV_SKILLS_WORK : FAV_SKILLS);

// ---- Skilly (úplný katalog, definiční soubory) ---------------------------
// Každý skill = soubor ~/zibby/skills/<id>/SKILL.md. category = funkční oblast (uvnitř kontextu).
// Plochý výchozí seznam kategorií (dynamicky se spravuje ve stavu aplikace).
const SKILL_CATEGORIES = ['Média', 'Nákupy & domácnost', 'Systém & NAS', 'Psaní & dokumenty', 'Vývoj', 'Review & CI', 'Dokumentace'];

const CATEGORY_GLYPH = {
  'Média': 'film', 'Nákupy & domácnost': 'cart', 'Systém & NAS': 'server', 'Psaní & dokumenty': 'doc',
  'Vývoj': 'code', 'Review & CI': 'shield', 'Dokumentace': 'spark',
};

// glyphy nabízené v editoru
const SKILL_GLYPHS = ['spark','cart','film','server','doc','code','shield','check','search','flask','plug','clock','brain','bot','dollar','link'];

// ---- Riziko = vlastnost nástroje ----------------------------------------
// Risk je primárně vlastnost nástroje (viz Integrace: risky[]). Abstraktní
// schopnostní nástroje, které samy o sobě umí rizikovou akci, mapujeme na
// sémantický typ rizika. Tohle používají agenti (nemají vlastní integrace) a
// zviditelňuje to gate i na úrovni souboru .agent.md / SKILL.md.
const TOOL_RISK = { bash: 'mazani', git: 'push' };
const TOOL_RISK_LABEL = { platba: 'platba', mazani: 'mazání', push: 'push', odeslani: 'odeslání' };
// vrátí rizikové (gated) nástroje z abstraktního seznamu schopností
const riskyToolsOf = (tools = []) => tools.filter((t) => TOOL_RISK[t]);

// generátor výchozího SKILL.md (editovatelný).
// Frontmatter nese gating na úrovni souboru: requires_approval + risky_tools.
// risky_tools = jmenné nástroje integrací (rohlik.order, …), které skill volá a
// které jsou rizikové — odvozeno z Integrací (s.riskyTools, doplní se po načtení).
const mkSkillBody = (s) => {
  const rt = s.riskyTools || [];
  const fm = [
    `name: ${s.id}`,
    `context: ${s.ctx}`,
    `category: ${s.category}`,
    `tools: [${s.tools.join(', ')}]`,
    `model: ${s.model || 'sonnet'}`,
  ];
  if (rt.length) {
    fm.push('requires_approval: true');
    fm.push(`risky_tools: [${rt.join(', ')}]`);
  }
  if (s.safeAfter) fm.push(`action_safe_after: ${s.safeAfter}`);
  return `---
${fm.join('\n')}
---

# ${s.name}

${s.desc}.

## Kdy použít
${s.when || 'Když chceš tuhle práci delegovat na agenta místo ruční práce.'}

## Postup
1. Načti vstup a ověř, že dává smysl.
2. Proveď hlavní práci skillu (${s.desc.toLowerCase()}).
3. Vrať shrnutí výsledku${s.tools.includes('write') ? ' a zapiš výstup na disk' : ''}.

## Nástroje
${s.tools.map((t) => '- ' + t).join('\n')}
`;
};

const SKILLS_BASE = [
  // HOME
  { id:'rohlik', name:'rohlik', glyph:'cart', ctx:'home', category:'Nákupy & domácnost', desc:'Naplní košík podle seznamu', tools:['web','read'], model:'sonnet', pinned:true, state:'wait', runs:42, lastRun:'včera 18:20', when:'Před nákupem — když máš seznam a chceš hotový košík ke schválení.' },
  { id:'tmdb-renamer', name:'tmdb-renamer', glyph:'film', ctx:'home', category:'Média', desc:'Přejmenuje média podle TMDB', tools:['read','write','web'], model:'sonnet', pinned:true, state:'running', runs:128, lastRun:'teď', when:'Po stažení dávky souborů, které mají rozházené názvy.' },
  { id:'holly', name:'holly', glyph:'server', ctx:'home', category:'Systém & NAS', desc:'Ovládá NAS démona Holly', tools:['bash','read'], model:'sonnet', pinned:true, state:'idle', runs:67, lastRun:'31m', when:'Když potřebuješ spravovat NAS — snapshoty, služby, místo na disku.' },
  { id:'task-spec-writer', name:'task-spec-writer', glyph:'doc', ctx:'home', category:'Psaní & dokumenty', desc:'Sepíše spec z volného zadání', tools:['read','write'], model:'opus', pinned:true, state:'idle', runs:23, lastRun:'2 dny', when:'Když máš nápad v hlavě a chceš z něj čitelné zadání.' },
  { id:'webshare-downloader', name:'webshare-downloader', glyph:'film', ctx:'home', category:'Média', desc:'Stáhne epizody z Webshare', tools:['web','bash'], model:'sonnet', pinned:false, state:'running', runs:54, lastRun:'8m', when:'Když chceš stáhnout konkrétní epizody nebo sezónu.' },
  { id:'meal-planner', name:'meal-planner', glyph:'cart', ctx:'home', category:'Nákupy & domácnost', desc:'Sestaví jídelníček na týden', tools:['web','write'], model:'sonnet', pinned:false, state:'idle', runs:9, lastRun:'3 dny', when:'V neděli večer, než plánuješ nákup na týden.' },
  { id:'photo-cull', name:'photo-cull', glyph:'film', ctx:'home', category:'Média', desc:'Vybere nejlepší fotky z dávky', tools:['read','write'], model:'sonnet', pinned:false, state:'idle', runs:16, lastRun:'týden', when:'Po focení — když máš stovky snímků a chceš výběr.' },
  { id:'nas-backup', name:'nas-backup', glyph:'server', ctx:'home', category:'Systém & NAS', desc:'Naplánuje a ověří zálohy vaultu', tools:['bash','read'], model:'sonnet', pinned:false, state:'idle', runs:88, lastRun:'dnes 04:00', when:'Pravidelně — nebo když chceš ověřit, že zálohy sedí.' },
  { id:'journal-digest', name:'journal-digest', glyph:'doc', ctx:'home', category:'Psaní & dokumenty', desc:'Shrne týden z poznámek do digestu', tools:['read','write'], model:'sonnet', pinned:false, state:'idle', runs:12, lastRun:'po', when:'V pátek — když chceš ohlédnutí za týdnem.' },
  // WORK
  { id:'spec-skeleton', name:'spec→skeleton', glyph:'doc', ctx:'work', category:'Vývoj', desc:'Spec → kostra PR', tools:['read','write','git'], model:'opus', pinned:true, state:'idle', runs:31, lastRun:'dnes 03:12', when:'Když máš hotový design.md a chceš rozjet implementaci.' },
  { id:'pr-prereview', name:'pr-prereview', glyph:'check', ctx:'work', category:'Review & CI', desc:'Pre-review otevřeného PR', tools:['read','git'], model:'opus', pinned:true, state:'idle', runs:46, lastRun:'14m', when:'Před tím, než pošleš PR kolegům na review.' },
  { id:'ci-doctor', name:'ci-doctor', glyph:'shield', ctx:'work', category:'Review & CI', desc:'Diagnostikuje padající CI', tools:['read','bash','git'], model:'sonnet', pinned:true, state:'idle', runs:73, lastRun:'14m', when:'Když spadne pipeline a nevíš proč.' },
  { id:'standup-gen', name:'standup-gen', glyph:'spark', ctx:'work', category:'Dokumentace', desc:'Vygeneruje standup z gitu', tools:['read','git'], model:'sonnet', pinned:true, state:'idle', runs:58, lastRun:'1h', when:'Ráno před standupem.', safeAfter:'po 09:00' },
  { id:'changelog-gen', name:'changelog-gen', glyph:'doc', ctx:'work', category:'Dokumentace', desc:'Sestaví changelog z merge commitů', tools:['read','git','write'], model:'sonnet', pinned:false, state:'idle', runs:19, lastRun:'včera', when:'Před releasem — z merge commitů od poslední verze.' },
];

// riskyTools se doplní v data-extra.jsx z Integrací (usedBy×risky) a body se
// pak přegeneruje, aby frontmatter nesl gating. Tady jen výchozí prázdné pole.
const SKILL_GATE_IDS = { rohlik: ['gr-purchase'], 'spec-skeleton': ['gr-git-main'], 'standup-gen': ['gr-email'], 'changelog-gen': ['gr-git-main'], 'ci-doctor': ['gr-delete'] };
const SKILLS = SKILLS_BASE.map((s) => ({ ...s, file: `~/zibby/skills/${s.id}/SKILL.md`, riskyTools: [], body: mkSkillBody({ ...s, riskyTools: [] }), gateRuleIds: SKILL_GATE_IDS[s.id] || [] }));

const skillsFor = (ctx) => SKILLS.filter((s) => s.ctx === ctx);

const RUNNING_AGENTS = [
  { id: 'a1', skill: 'tmdb-renamer', ctx: 'home', prompt: 'Srovnej /media/downloads/seriály', state: 'running', pct: 72, started: '3m', project: 'media-vault' },
  { id: 'a2', skill: 'webshare-downloader', ctx: 'home', prompt: 'Stáhni S02E04–E08', state: 'running', pct: 41, started: '8m', project: 'media-vault' },
];

const APPROVALS = [
  { id: 'ap1', skill: 'rohlik', ctx: 'home', action: 'Objednat košík', detail: '14 položek · 1 248 Kč · doručení zítra 18–20h', risk: 'platba' },
];

const ACTIVITY = [
  { id: 'e1', t: 'teď', icon: 'run', ctx: 'home', text: 'tmdb-renamer běží', sub: 'přejmenováno 18 / 25 souborů' },
  { id: 'e2', t: '2m', icon: 'wait', ctx: 'home', text: 'rohlik čeká na schválení', sub: 'košík připraven k objednání' },
  { id: 'e3', t: '14m', icon: 'ok', ctx: 'work', text: 'ci-doctor dokončen', sub: 'opravil flaky test v auth-svc' },
  { id: 'e4', t: '31m', icon: 'ok', ctx: 'home', text: 'holly zálohoval vault', sub: 'snapshot home/ · 2.3 GB' },
  { id: 'e5', t: '1h', icon: 'edit', ctx: 'work', text: 'standup-gen aktualizoval MEMORY.md', sub: 'work/daily/2026-05-30.md' },
];

const SYSTEM = {
  daemon: 'ZIBBY daemon',
  host: 'Mac M5',
  uptime: '14 h',
  awake: true,        // Mac je vzhůru
  caffeinate: true,   // drží ho caffeinate (noční běhy)
  skills: 9,
  integrations: 7,
  automations: 5,
  agents: 6,
  pipelines: 4,
};

// ---- Agenti (definiční soubory) ------------------------------------------
// Každý agent = soubor ~/zibby/agents/<id>.agent.md. Sdílený pool — pipeline si je „najímají".
// Plochý výchozí seznam kategorií agentů (dynamicky se spravuje ve stavu aplikace).
const AGENT_CATEGORIES = ['Vývoj', 'Kvalita', 'Výzkum', 'Dokumentace', 'Média', 'Domácnost', 'Psaní'];

const AGENT_CATEGORY_GLYPH = {
  'Média': 'film', 'Domácnost': 'cart', 'Psaní': 'doc',
  'Vývoj': 'code', 'Kvalita': 'shield', 'Výzkum': 'search', 'Dokumentace': 'spark',
};

const AGENT_GLYPHS = ['compass','code','flask','doc','check','search','bot','brain','shield','spark','film','cart','server','flow','gear'];

// výchozí avatar pro orchestraci (pipeline) — dokud si uživatel nenahraje vlastní
const PIPELINE_DEFAULT_AVATAR = 'zibby/avatars/orchestrator.png';

const mkAgentBody = (a) => {
  const rt = riskyToolsOf(a.tools);
  const fm = [
    `name: ${a.id}`,
    `context: ${a.ctx}`,
    `category: ${a.category}`,
    `model: ${a.model}`,
    `thinking: ${a.thinking}`,
    `tools: [${a.tools.join(', ')}]`,
  ];
  if (rt.length) {
    fm.push('requires_approval: true');
    fm.push(`risky_tools: [${rt.join(', ')}]`);
  }
  return `---
${fm.join('\n')}
---

# ${a.name}

${a.role}.

## Systémový prompt
Jsi **${a.name}**. ${a.role}. Pracuj samostatně, drž se zadání a vracej stručné shrnutí výsledku.

## Pravidla
- Používej výhradně povolené nástroje: ${a.tools.join(', ')}.
- Přemýšlej na úrovni „${a.thinking}", model ${a.model}.
- Po dokončení předej výstup další fázi nebo k mé revizi.
`;
};

const AGENTS_BASE = [
  // WORK
  { id:'architect', name:'Architekt', glyph:'compass', avatar:'zibby/avatars/architect.png', role:'Navrhne řešení a rozepíše plán do design.md', model:'opus', thinking:'high', tools:['read','web','write'], ctx:'work', category:'Vývoj', state:'idle', enabled:true, runs:64, file:'~/zibby/agents/architect.agent.md' },
  { id:'coder', name:'Kodér', glyph:'code', avatar:'zibby/avatars/coder.png', role:'Implementuje podle design.md v izolované branchi', model:'sonnet', thinking:'medium', tools:['read','write','bash','git'], ctx:'work', category:'Vývoj', state:'pipeline', enabled:true, runs:212, file:'~/zibby/agents/coder.agent.md' },
  { id:'tester', name:'Tester', glyph:'flask', avatar:'zibby/avatars/tester.png', role:'Spustí testy, vrací report a vrací práci zpět', model:'sonnet', thinking:'medium', tools:['read','bash','git'], ctx:'work', category:'Kvalita', state:'pipeline', enabled:true, runs:198, file:'~/zibby/agents/tester.agent.md' },
  { id:'reviewer', name:'Reviewer', glyph:'check', avatar:'zibby/avatars/reviewer.png', role:'Pre-review diffu před návrhem na push', model:'opus', thinking:'high', tools:['read','git'], ctx:'work', category:'Kvalita', state:'idle', enabled:true, runs:47, file:'~/zibby/agents/reviewer.agent.md' },
  { id:'researcher', name:'Researcher', glyph:'search', role:'Sbírá zdroje a syntetizuje poznámky do vaultu', model:'sonnet', thinking:'medium', tools:['read','web','write'], ctx:'work', category:'Výzkum', state:'idle', enabled:true, runs:38, file:'~/zibby/agents/researcher.agent.md' },
  { id:'doc', name:'Dokumentátor', glyph:'doc', avatar:'zibby/avatars/documentator.png', role:'Sepíše README a changelog z výsledné branche', model:'sonnet', thinking:'low', tools:['read','write'], ctx:'work', category:'Dokumentace', state:'idle', enabled:true, runs:29, file:'~/zibby/agents/doc.agent.md' },
  // HOME
  { id:'curator', name:'Kurátor', glyph:'film', role:'Třídí a popisuje média v knihovně', model:'sonnet', thinking:'low', tools:['read','write','web'], ctx:'home', category:'Média', state:'idle', enabled:true, runs:53, file:'~/zibby/agents/curator.agent.md' },
  { id:'steward', name:'Hospodář', glyph:'cart', role:'Plánuje nákupy a hlídá domácí zásoby', model:'sonnet', thinking:'medium', tools:['read','write','web'], ctx:'home', category:'Domácnost', state:'idle', enabled:true, runs:18, file:'~/zibby/agents/steward.agent.md' },
  { id:'chronicler', name:'Kronikář', glyph:'doc', role:'Vede deník a sumarizuje týden z poznámek', model:'sonnet', thinking:'low', tools:['read','write'], ctx:'home', category:'Psaní', state:'idle', enabled:true, runs:11, file:'~/zibby/agents/chronicler.agent.md' },
];

const AGENT_GATE_IDS = { coder: ['gr-git-main', 'gr-merge'], tester: ['gr-delete'], steward: ['gr-purchase'], researcher: ['gr-email'] };
const AGENTS = AGENTS_BASE.map((a) => ({ ...a, body: mkAgentBody(a), gateRuleIds: AGENT_GATE_IDS[a.id] || [] }));
const agentByName = (n) => AGENTS.find((a) => a.name === n) || { glyph:'bot', model:'sonnet', thinking:'medium' };
const agentsFor = (ctx) => AGENTS.filter((a) => a.ctx === ctx);
// které pipeline daného agenta používají
const pipelinesUsingAgent = (name) => (typeof PIPELINES !== 'undefined' ? PIPELINES : []).filter((p) => p.phases.some((ph) => ph.agent === name));

// ---- Pipelines (orchestrace, definiční soubory) --------------------------
const PIPELINES = [
  {
    id:'release-train', name:'Release Train', ctx:'work', budget:60, lastRun:'dnes 01:05', lastState:'done', avatar: PIPELINE_DEFAULT_AVATAR,
    desc:'Plný release: research → návrh → implementace → testy → review → docs → changelog → build → smoke.',
    file:'~/zibby/pipelines/release-train.pipeline.md',
    phases:[
      { agent:'Researcher', consumes:'epic.md', produces:'research.md', model:'sonnet', thinking:'medium' },
      { agent:'Architekt', consumes:'research.md', produces:'design.md', model:'opus', thinking:'high' },
      { agent:'Kodér', consumes:'design.md', produces:'branch feat/*', model:'sonnet', thinking:'medium' },
      { agent:'Tester', consumes:'branch', produces:'test-report.md', model:'sonnet', thinking:'medium',
        loop:{ to:'Kodér', maxRetries:3, escalate:true, then:'park_for_review' } },
      { agent:'Reviewer', consumes:'branch', produces:'review.md', model:'opus', thinking:'high' },
      { agent:'Dokumentátor', consumes:'branch', produces:'README.md', model:'sonnet', thinking:'low' },
      { agent:'Architekt', consumes:'review.md', produces:'changelog.md', model:'opus', thinking:'medium' },
      { agent:'Kodér', consumes:'changelog.md', produces:'release/*', model:'sonnet', thinking:'low' },
      { agent:'Tester', consumes:'release/*', produces:'smoke-report.md', model:'sonnet', thinking:'medium' },
    ],
  },
  {
    id:'build-feature', name:'Build Feature', ctx:'work', budget:25, lastRun:'dnes 03:12', lastState:'parked', avatar: PIPELINE_DEFAULT_AVATAR,
    desc:'Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.',
    file:'~/zibby/pipelines/build-feature.pipeline.md',
    phases:[
      { agent:'Architekt', consumes:'task.md', produces:'design.md', model:'opus', thinking:'high' },
      { agent:'Kodér', consumes:'design.md', produces:'branch feat/*', model:'sonnet', thinking:'medium' },
      { agent:'Tester', consumes:'branch', produces:'test-report.md', model:'sonnet', thinking:'medium',
        loop:{ to:'Kodér', maxRetries:3, escalate:true, then:'park_for_review' } },
      { agent:'Dokumentátor', consumes:'branch', produces:'README.md', model:'sonnet', thinking:'low' },
    ],
  },
  {
    id:'nightly-research', name:'Nightly Research', ctx:'work', budget:15, lastRun:'dnes 02:40', lastState:'done', avatar: PIPELINE_DEFAULT_AVATAR,
    desc:'Researcher nasbírá zdroje, Architekt je zsyntetizuje do poznámky.',
    file:'~/zibby/pipelines/nightly-research.pipeline.md',
    phases:[
      { agent:'Researcher', consumes:'topic.md', produces:'sources.md', model:'sonnet', thinking:'medium' },
      { agent:'Architekt', consumes:'sources.md', produces:'knowledge/*.md', model:'opus', thinking:'high' },
    ],
  },
  {
    id:'pr-guard', name:'PR Guard', ctx:'work', budget:8, lastRun:'včera 18:02', lastState:'done', avatar: PIPELINE_DEFAULT_AVATAR,
    desc:'Reviewer projde diff a připraví push k tvému schválení.',
    file:'~/zibby/pipelines/pr-guard.pipeline.md',
    phases:[
      { agent:'Reviewer', consumes:'branch', produces:'review.md', model:'opus', thinking:'high' },
    ],
  },
  {
    id:'media-tidy', name:'Media tidy', ctx:'home', budget:5, lastRun:'včera 23:10', lastState:'done', avatar: PIPELINE_DEFAULT_AVATAR,
    desc:'Stáhne a srovná média na Holly.',
    file:'~/zibby/pipelines/media-tidy.pipeline.md',
    phases:[
      { agent:'Researcher', consumes:'watchlist.md', produces:'plan.md', model:'sonnet', thinking:'low' },
      { agent:'Kodér', consumes:'plan.md', produces:'Holly/media/*', model:'sonnet', thinking:'low' },
    ],
  },
];
const pipelinesFor = (ctx) => PIPELINES.filter((p) => p.ctx === ctx);

// ---- Globální pravidla schvalování ---------------------------------------
const GLOBAL_RULES = [
  { id: 'gr-purchase', type: 'action', label: 'purchase', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all', name: 'Nákup — vždy schválit', desc: 'Všechny platební akce vyžadují explicitní souhlas uživatele.', category: 'Platby' },
  { id: 'gr-git-main', type: 'tool', tool: 'git', verb: 'push', pattern: 'main', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all', name: 'git push → main', desc: 'Přímý push na hlavní větev vyžaduje potvrzení.', category: 'Git & kód' },
  { id: 'gr-merge', type: 'action', label: 'merge', sub: 'PR', decision: 'ask', resolution: [{ kind: 'check', name: 'ci_green' }, { kind: 'human' }], mode: 'all', name: 'Merge PR → CI + souhlas', desc: 'Před mergem musí být zelené CI a souhlas uživatele.', category: 'Git & kód' },
  { id: 'gr-delete', type: 'action', label: 'delete', pattern: 'mimo /tmp', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all', name: 'Mazání mimo /tmp', desc: 'Jakékoli mazání mimo /tmp musí být explicitně potvrzeno.', category: 'Systém' },
  { id: 'gr-email', type: 'action', label: 'send_email', decision: 'notify', resolution: [], mode: 'all', name: 'E-mail → vždy zalogovat', desc: 'Každé odeslání e-mailu se zapíše do activity feed.', category: 'Komunikace' },
  { id: 'gr-deploy', type: 'context', context: 'work', verb: 'deploy', decision: 'ask', resolution: [{ kind: 'check', name: 'ci_green' }, { kind: 'human' }], mode: 'all', name: 'Deploy → CI + souhlas', desc: 'Deploy v pracovním kontextu vyžaduje zelené CI a souhlas.', category: 'Git & kód' },
];
const GATE_RULE_CATEGORIES = ['Platby', 'Git & kód', 'Systém', 'Komunikace'];

// ---- Projekty (cílové adresáře) -----------------------------------------
const PROJECT_CATEGORIES = ['Vývoj', 'Média & domácnost', 'Ostatní'];
const PROJECTS_DATA = [
  { id: 'zibby-core',   name: 'zibby-core',   path: '~/zibby',                      desc: 'ZIBBY démon, skilly, agenti, velín',         ctx: 'work', category: 'Vývoj' },
  { id: 'auth-svc',     name: 'auth-svc',     path: '~/Projects/auth-svc',          desc: 'Auth microservice – JWT, rate-limiter, testy', ctx: 'work', category: 'Vývoj' },
  { id: 'media-vault',  name: 'media-vault',  path: '~/Projects/media-vault',       desc: 'Médiatéka – filmy, seriály, fotky na Holly',    ctx: 'home', category: 'Média & domácnost' },
  { id: 'home-ops',     name: 'home-ops',     path: '~/Projects/home-ops',          desc: 'Domácí provoz – nákupy, zálohy, NAS',            ctx: 'home', category: 'Média & domácnost' },
  { id: 'rohlik-list',  name: 'rohlik-list',  path: '~/Projects/rohlik-list',       desc: 'Nákupní seznam a jídelníček',                   ctx: 'home', category: 'Média & domácnost' },
];

const NAV = [
  { id: 'overview',     label: 'Přehled',              glyph: 'grid'      },
  { id: 'tasks',        label: 'Tasky',                 glyph: 'bolt',  badge: 2, alert: true  },

  { id: 'skills',       label: 'Skilly',                glyph: 'spark'     },
  { id: 'agents',       label: 'Agenti',                glyph: 'bot'       },

  { id: 'pipelines',    label: 'Orchestrace',           glyph: 'flow'      },
  { id: 'projects',     label: 'Projekty',              glyph: 'code'      },
  { id: 'integrations', label: 'Integrace',             glyph: 'plug'      },
  { id: 'automations',  label: 'Automatizace',          glyph: 'clock'     },
  { id: 'memory',       label: 'Paměť',                 glyph: 'brain'     },
];
const NAV_LABEL = Object.fromEntries([...NAV, { id: 'settings', label: 'Nastavení systému', glyph: 'gear' }].map((n) => [n.id, n.label]));

Object.assign(window, { Z, accentOf, accentDimOf, CLAUDE_LIMITS, AGENT_SDK, FAV_SKILLS, FAV_SKILLS_WORK, favsFor, RUNNING_AGENTS, APPROVALS, ACTIVITY, SYSTEM, AGENTS, agentByName, agentsFor, AGENT_CATEGORIES, AGENT_CATEGORY_GLYPH, AGENT_GLYPHS, PIPELINE_DEFAULT_AVATAR, mkAgentBody, pipelinesUsingAgent, PIPELINES, pipelinesFor, NAV, NAV_LABEL, SKILLS, SKILL_CATEGORIES, CATEGORY_GLYPH, SKILL_GLYPHS, skillsFor, mkSkillBody, TOOL_RISK, TOOL_RISK_LABEL, riskyToolsOf, GLOBAL_RULES, GATE_RULE_CATEGORIES, PROJECTS_DATA, PROJECT_CATEGORIES });

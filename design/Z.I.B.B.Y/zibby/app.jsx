// ZIBBY velín — top-level app: shell + screen router
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

// Keyboard shortcut for New Task (fixed: N)
const DEFAULT_TASK_SHORTCUT = { key: 'n', ctrl: false, meta: false, alt: false, shift: false };

// graceful placeholder for not-yet-built screens
const Placeholder = ({ nav, accent }) => (
  <div>
    <HudPanel accent={accent} pad={40}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: 3, display: 'grid', placeItems: 'center', color: accent, border: `1px solid ${accent}55`, background: 'rgba(255,255,255,0.02)' }}>
          <Icon name={(NAV.find((n) => n.id === nav) || {}).glyph || (nav === 'settings' ? 'gear' : 'grid')} size={26} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{NAV_LABEL[nav]}</div>
        <Mono style={{ fontSize: 12, color: Z.inkDim, maxWidth: 420, lineHeight: 1.5 }}>
          Tahle obrazovka je další na řadě. Drží stejný vzor — karty (= soubory na disku) → čudlík → modal s promptem → běh na pozadí.
        </Mono>
        <Mono style={{ fontSize: 10, color: Z.inkFaint, letterSpacing: '0.1em' }}>// v přípravě</Mono>
      </div>
    </HudPanel>
  </div>
);

// Tenký stavový proužek — periferní vidění mimo Přehled (rail jen na Přehledu).
const ThinStatusRail = ({ onNav }) => {
  const allTasks = (typeof TASKS_DATA !== 'undefined' ? TASKS_DATA : []);
  const run = allTasks.filter(t => t.status === 'running').length;
  const wait = allTasks.filter(t => t.status === 'classified' || t.status === 'parked').length;
  const Cell = ({ state, n, label, to }) => (
    <div onClick={() => onNav && onNav(to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }} title={label}>
      <ZtDot size={8} state={state} />
      <span style={{ fontFamily: Z.mono, fontSize: 12.5, fontWeight: 600, color: Z.ink }}>{String(n).padStart(2, '0')}</span>
    </div>
  );
  return (
    <div style={{ width: 60, flex: '0 0 60px', borderLeft: `1px solid ${Z.line}`, background: Z.bg0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '22px 0' }}>
      <span title="systém · nominal"><ZtDot size={9} state="ok" /></span>
      <div style={{ width: 22, height: 1, background: Z.line }} />
      <Cell label="tasky běží" n={run} state="run" to="runs" />
      <Cell label="čeká na tebe" n={wait} state="wait" to="approvals" />
    </div>
  );
};

function App() {
  const loadSettings = () => {
    const def = { lang: 'cs', defaultCtx: 'home', caffeinate: true, voiceShortcut: DEFAULT_VOICE_SHORTCUT };
    try { return { ...def, ...JSON.parse(localStorage.getItem('zibby.settings') || '{}') }; } catch (e) { return def; }
  };
  const [settings, setSettings] = useStateApp(loadSettings);
  const saveSettings = (patch) => setSettings((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem('zibby.settings', JSON.stringify(next)); } catch (e) {}
    return next;
  });

  const [nav, setNav] = useStateApp('overview');
  const [viewMode, setViewMode] = useStateApp('hud'); // 'hud' | 'voice'
  const [newTaskOpen, setNewTaskOpen] = useStateApp(false);
  // Tasky — sdílený stav (nový task se sem vloží a předvybere)
  const [tasks, setTasks] = useStateApp(TASKS_DATA);
  const [taskSel, setTaskSel] = useStateApp(() => (TASKS_DATA.find(t => t.status === 'classified') || TASKS_DATA[0] || {}).id);

  // Always-current shortcut ref — avoids re-registering the listener on every settings change
  const scRef = useRefApp(settings.voiceShortcut || DEFAULT_VOICE_SHORTCUT);
  scRef.current = settings.voiceShortcut || DEFAULT_VOICE_SHORTCUT;

  // Keyboard: configurable shortcut to toggle voice mode
  // Keyboard: N to open New Task dialog
  useEffectApp(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (matchesShortcut(e, scRef.current)) { setViewMode(m => m === 'voice' ? 'hud' : 'voice'); return; }
      if (matchesShortcut(e, DEFAULT_TASK_SHORTCUT)) setNewTaskOpen(o => !o);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Task queue handlers — odhad executoru z textu (simulace backend kategorizace)
  const guessExecutor = (text) => {
    const t = (text || '').toLowerCase();
    if (/(implement|feature|featur|spec|test|rate|api|refactor|search|filtr|build)/.test(t))
      return { executorKind: 'pipeline', executorId: 'build-feature', executorName: 'Build Feature', confidence: 0.86, confirmedAt: null, alternatives: [{ executorKind: 'agent', executorId: 'coder', executorName: 'Kodér (agent)', confidence: 0.5 }] };
    if (/(médi|media|seriál|film|foto|tmdb|stáhni|download|epizod)/.test(t))
      return { executorKind: 'agent', executorId: 'curator', executorName: 'Kurátor', confidence: 0.9, confirmedAt: null, alternatives: [] };
    if (/(zálo|backup|holly|nas|snapshot|disk)/.test(t))
      return { executorKind: 'agent', executorId: 'steward', executorName: 'Hospodář', confidence: 0.82, confirmedAt: null, alternatives: [] };
    return { executorKind: 'agent', executorId: 'researcher', executorName: 'Researcher', confidence: 0.78, confirmedAt: null, alternatives: [] };
  };

  const handleTaskSubmit = ({ title, text, paths, scheduledAt }) => {
    const id = 'task-' + Date.now();
    const scheduled = scheduledAt && scheduledAt > Date.now();
    const newTask = {
      id, title: title || '', description: text, createdAt: 'právě teě',
      status: scheduled ? 'queued' : 'classifying',
      classification: null, agentRun: null, pipelineRun: null, paths,
      scheduledAt: scheduledAt || null,
    };
    setTasks(q => [newTask, ...q]);
    setTaskSel(id);     // předvybrání nového tasku
    setNav('tasks');    // přesměrování na kartu Tasky
    // odložený start: počkej do naplánovaného času (v demu max ~6 s), pak klasifikuj
    const waitMs = scheduled ? Math.min(scheduledAt - Date.now(), 6000) : 0;
    setTimeout(() => {
      if (scheduled) setTasks(q => q.map(t => t.id === id ? { ...t, status: 'classifying' } : t));
      const delay = 2200 + Math.random() * 2400;
      setTimeout(() => {
        setTasks(q => q.map(t => t.id === id ? { ...t, status: 'classified', classification: guessExecutor(text) } : t));
      }, delay);
    }, waitMs);
  };
  const [skills, setSkills] = useStateApp(SKILLS);
  const [agents, setAgents] = useStateApp(AGENTS);
  const [skillCats, setSkillCats] = useStateApp(SKILL_CATEGORIES);
  const [agentCats, setAgentCats] = useStateApp(AGENT_CATEGORIES);
  const [gateRules, setGateRules] = useStateApp(GLOBAL_RULES);
  const [gateRuleCats, setGateRuleCats] = useStateApp(GATE_RULE_CATEGORIES);
  const [projects, setProjects] = useStateApp(PROJECTS_DATA);
  const [projectCats, setProjectCats] = useStateApp(PROJECT_CATEGORIES);
  const accent = accentOf();

  let body;
  if (nav === 'overview') body = <OverviewBody accent={accent} agents={agents} onNav={setNav} setSkills={setSkills} skills={skills} />;
  else if (nav === 'approvals') body = <ApprovalsBody accent={accent} />;
  else if (nav === 'gate-rules') body = <GateRulesBody accent={accent} agents={agents} cats={gateRuleCats} gateRules={gateRules} setCats={setGateRuleCats} setGateRules={setGateRules} skills={skills} />;
  else if (nav === 'skills') body = <SkillsBody accent={accent} cats={skillCats} gateRules={gateRules} projects={projects} setCats={setSkillCats} setSkills={setSkills} skills={skills} />;
  else if (nav === 'agents') body = <AgentsBody accent={accent} agents={agents} cats={agentCats} gateRules={gateRules} projects={projects} setAgents={setAgents} setCats={setAgentCats} />;
  else if (nav === 'pipelines') body = <PipelinesBody accent={accent} />;
  else if (nav === 'projects') body = <ProjectsBody accent={accent} cats={projectCats} projects={projects} setCats={setProjectCats} setProjects={setProjects} />;
  else if (nav === 'integrations') body = <IntegrationsBody accent={accent} />;
  else if (nav === 'automations') body = <AutomationsBody accent={accent} />;
  else if (nav === 'memory') body = <MemoryBody accent={accent} />;
  else if (nav === 'tasks') body = <TasksBody accent={accent} selId={taskSel} setSelId={setTaskSel} setTasks={setTasks} tasks={tasks} />;
  else if (nav === 'definitions') body = <DefinitionsBody accent={accent} agents={agents} />;
  else if (nav === 'runs') body = <RunsBody accent={accent} />;
  else if (nav === 'settings') body = <SettingsBody accent={accent} agents={agents} gateCats={gateRuleCats} gateRules={gateRules} saveSettings={saveSettings} setGateCats={setGateRuleCats} setGateRules={setGateRules} settings={settings} skills={skills} />;
  else body = <Placeholder accent={accent} nav={nav} />;

  if (viewMode === 'voice') {
    return (
      <Frame skin="velin">
        <VoiceScreen accent={accent} onExit={() => setViewMode('hud')} />
      </Frame>
    );
  }

  return (
    <Frame skin="velin">
      <Sidebar accent={accent} active={nav} onNav={setNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          accent={accent} lang={settings.lang}
          nav={nav} onLang={(v) => saveSettings({ lang: v })}
          onNewTask={() => setNewTaskOpen(true)}
          onVoice={() => setViewMode('voice')}
        />
        {newTaskOpen && (
          <NewTaskDialog
            accent={accent}
            onClose={() => setNewTaskOpen(false)}
            onSubmit={handleTaskSubmit}
          />
        )}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '24px 26px' }}>
          {body}
        </div>
      </div>
      {nav === 'overview' && (
        <div style={{
          width: 324, flex: '0 0 324px',
          borderLeft: `1px solid ${Z.line}`,
          background: Z.bg0,
          overflow: 'auto',
          padding: '24px 18px',
        }}>
          <RightRailContent accent={accent} onNav={setNav} />
        </div>
      )}
    </Frame>
  );
}

Object.assign(window, { App });

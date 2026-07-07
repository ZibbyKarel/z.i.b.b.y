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
  const [taskQueue, setTaskQueue] = useStateApp([]);
  const [newTaskOpen, setNewTaskOpen] = useStateApp(false);

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

  // Task queue handlers
  const handleTaskSubmit = ({ text, paths }) => {
    const id = 'task-' + Date.now();
    const newTask = { id, text, paths, ts: Date.now(), state: 'categorizing', category: null };
    setTaskQueue(q => [...q, newTask]);
    // Simuluje backend kategorizaci (black magic)
    const delay = 2200 + Math.random() * 2600;
    setTimeout(() => {
      const cat = TASK_CATS[Math.floor(Math.random() * TASK_CATS.length)];
      setTaskQueue(q => q.map(t => t.id === id ? { ...t, state: 'categorized', category: cat } : t));
    }, delay);
  };

  const handleClearDoneTasks = () => {
    setTaskQueue(q => q.filter(t => t.state === 'categorizing'));
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
  else if (nav === 'tasks') body = <TasksBody accent={accent} />;
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
          nav={nav} onClearDoneTasks={handleClearDoneTasks}
          onLang={(v) => saveSettings({ lang: v })}
          onNewTask={() => setNewTaskOpen(true)}
          onVoice={() => setViewMode('voice')}
          taskQueue={taskQueue}
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
      {/* Persistent right rail — visible on every page */}
      <div style={{
        width: 340, flex: '0 0 340px',
        borderLeft: `1px solid ${Z.line}`,
        background: Z.bg0,
        overflow: 'auto',
        padding: '24px 18px',
      }}>
        <RightRailContent accent={accent} onNav={setNav} />
      </div>
    </Frame>
  );
}

Object.assign(window, { App });

// ZIBBY velín — Overview body (content only; shell lives in app.jsx)
const { useState: useStateOv } = React;

// Prominentní blok jednoho interaktivního limitu (5h / týden)
const LimitBlock = ({ d }) => {
  const c = limitColor(d.usedPct);
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, padding: '13px 14px', background: Z.bg0, border: `1px solid ${c}38`, borderRadius: 3, boxShadow: `0 0 0 1px ${c}14, 0 0 18px ${c}12` }}>
      <Mono style={{ fontSize: 10, color: Z.inkDim, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{d.label}</Mono>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 9 }}>
        <Mono style={{ fontSize: 28, fontWeight: 700, color: c, lineHeight: 1 }}>{d.usedPct}</Mono>
        <Mono style={{ fontSize: 14, fontWeight: 700, color: c }}>%</Mono>
      </div>
      <div style={{ marginTop: 10 }}><Bar glow color={c} h={7} pct={d.usedPct} /></div>
      <Mono style={{ fontSize: 8.5, color: Z.inkFaint, display: 'block', marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>reset {d.resetIn}</Mono>
    </div>
  );
};

// Prominentní panel s limity pro dashboard — jen interaktivní limity
const LimitsPanel = ({ accent }) => {
  const r = CLAUDE_LIMITS.rolling, w = CLAUDE_LIMITS.weekly;
  return (
    <HudPanel accent={accent} pad={18} right={<Mono style={{ fontSize: 9, color: Z.inkFaint }}>čerpá tvůj chat</Mono>}
      title="claude · interaktivní limity">
      <div style={{ display: 'flex', gap: 10 }}>
        <LimitBlock d={r} />
        <LimitBlock d={w} />
      </div>
    </HudPanel>
  );
};

// Agent SDK kredit — samostatný panel pod limity
const AgentSdkPanel = ({ accent }) => {
  const sdk = AGENT_SDK, sdkC = limitColor(sdk.usedPct);
  return (
    <HudPanel accent={sdkC} pad={18} right={<Mono style={{ fontSize: 9, color: Z.inkFaint }}>obnova {sdk.renew}</Mono>}
      title="agent sdk · kredit">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <Icon name="dollar" size={15} style={{ color: sdkC, marginBottom: 2, flex: '0 0 auto' }} />
        <Mono style={{ fontSize: 28, fontWeight: 700, color: sdkC, lineHeight: 1 }}>${sdk.remaining}</Mono>
        <Mono style={{ fontSize: 12, color: Z.inkFaint, fontWeight: 400 }}>/ ${sdk.total}</Mono>
      </div>
      <Bar glow color={sdkC} h={6} pct={sdk.usedPct} />
      <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 8 }}>spotřebováno ${sdk.used} · běhy agentů čerpají odsud</Mono>
    </HudPanel>
  );
};

// Persistent right rail — viditelný na všech stránkách
const RightRailContent = ({ accent, onNav }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <LimitsPanel accent={accent} />
    <div>
      <ApprovalCard hud />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <GhostBtn accent={Z.warn} icon="bolt" onClick={() => onNav && onNav('tasks')}>Otevřít Tasky</GhostBtn>
      </div>
    </div>
    <HudPanel accent={accent} pad={18} title="běžící agenti">
      {RUNNING_AGENTS.map((a) => <AgentRow hud a={a} key={a.id} />)}
      <div style={{ marginTop: 12 }}><GhostBtn accent={accent} icon="pulse" onClick={() => onNav && onNav('runs')}>Otevřít aktivitu</GhostBtn></div>
    </HudPanel>
  </div>
);

const OverviewBody = ({ accent, skills = SKILLS, setSkills, agents = AGENTS, onNav }) => {
  const [down, setDown] = useStateOv(false); // simulace výpadku démona (klikni na stav)
  const skillCount = skills.length;
  const agentCount = agents.length;
  // Task-centric live stats from global TASKS_DATA
  const allTasks   = (typeof TASKS_DATA !== 'undefined' ? TASKS_DATA : []);
  const tRunning   = allTasks.filter(t => t.status === 'running');
  const tPending   = allTasks.filter(t => t.status === 'classified' || t.status === 'parked');
  const tAgents    = tRunning.filter(t => t.classification && t.classification.executorKind === 'agent');
  const tPipes     = tRunning.filter(t => t.classification && t.classification.executorKind === 'pipeline');
  const greetSub   = tRunning.length > 0
    ? <><span style={{ color: Z.work }}>{tRunning.length} {tRunning.length === 1 ? 'task běží' : tRunning.length < 5 ? 'tasky běží' : 'tasků běží'}</span>{tPending.length > 0 ? <>, <span style={{ color: Z.warn }}>{tPending.length} čeká na tebe</span>.</> : '.'}</>
    : <span style={{ color: Z.inkDim }}>vše klidné.</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {down ? (
          /* ---- VARIANTA: DÉMON NEBĚŽÍ ---- */
          <HudPanel accent={Z.bad} pad={22} style={{ borderColor: `${Z.bad}66`, boxShadow: `0 0 0 1px ${Z.bad}22, 0 0 26px ${Z.bad}1a` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div onClick={() => setDown(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} title="přepnout zpět na NOMINAL">
                  <Dot pulse color={Z.bad} />
                  <Mono style={{ fontSize: 11, letterSpacing: '0.18em', color: Z.bad, textTransform: 'uppercase' }}>Systém · OFFLINE</Mono>
                  <Mono style={{ fontSize: 10, color: Z.inkFaint, marginLeft: 4 }}>· démon na {SYSTEM.host} neodpovídá</Mono>
                </div>
                <div style={{ fontSize: 27, fontWeight: 600, marginTop: 13, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  Node démon spadl. <span style={{ color: Z.inkDim }}>Agenti jsou pozastavení,</span> naplánované běhy se nespustí.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', background: `${Z.bad}12`, border: `1px solid ${Z.bad}33`, borderRadius: 3, maxWidth: 'fit-content' }}>
                  <Icon name="warn" size={14} style={{ color: Z.bad }} />
                  <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>poslední signál před 4 m · zdvih ECONNREFUSED na :8787 · 3 běhy ve frontě</Mono>
                </div>
              </div>
              <button onClick={() => setDown(false)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: Z.mono, fontSize: 12, fontWeight: 700,
                padding: '10px 16px', cursor: 'pointer', borderRadius: 2, color: Z.bg0, background: Z.bad, border: 'none',
                boxShadow: `0 0 16px ${Z.bad}66`, flex: '0 0 auto',
              }}><Icon name="retry" size={15} stroke={2} /> Restartovat démona</button>
            </div>
            <div style={{ display: 'flex', gap: 36, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${Z.bad}33`, flexWrap: 'wrap', opacity: 0.55 }}>
              <Stat accent={Z.bad} icon="bolt" label="tasky běží" value="—" />
              <Stat accent={Z.inkDim} icon="bot" label="agenti" value="—" />
              <Stat accent={Z.inkDim} icon="flow" label="pipeline" value="—" />
            </div>
          </HudPanel>
        ) : (
          /* ---- VARIANTA: NOMINAL ---- */
          <HudPanel accent={accent} pad={22}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div onClick={() => setDown(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} title="simulovat výpadek démona">
                  <Dot pulse color={Z.ok} />
                  <Mono style={{ fontSize: 11, letterSpacing: '0.18em', color: Z.ok, textTransform: 'uppercase' }}>Systém · NOMINAL</Mono>
                  <Mono style={{ fontSize: 10, color: Z.inkFaint, marginLeft: 4 }}>· démon na {SYSTEM.host}{SYSTEM.awake ? ' · vzhůru' : ''}</Mono>
                </div>
                <div style={{ fontSize: 27, fontWeight: 600, marginTop: 13, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  {greeting()}. {greetSub}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 36, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${Z.line}`, flexWrap: 'wrap' }}>
              <Stat accent={accent} icon="bolt" label="tasky běží" value={String(tRunning.length).padStart(2, '0')} />
              <Stat accent={Z.inkDim} icon="bot" label="z toho agenti" value={String(tAgents.length).padStart(2, '0')} />
              <Stat accent={Z.inkDim} icon="flow" label="z toho pipeline" value={String(tPipes.length).padStart(2, '0')} />
              {tPending.length > 0 && <Stat accent={Z.warn} icon="pause" label="ke schválení" value={String(tPending.length).padStart(2, '0')} />}
            </div>
          </HudPanel>
        )}

        {/* morning briefing */}
        <HudPanel accent={accent} pad={18} title="co se stalo přes noc · ranní brífink">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              { c: Z.ok, icon: 'branch', t: 'Build Feature → hotovo', s: 'branch feat/search-filters čeká na review · $11.20 / $25' },
              { c: Z.warn, icon: 'pause', t: 'Build Feature → zaparkováno po 3 pokusech', s: 'Tester: flaky test v checkout-flow · čeká na ranní review' },
              { c: Z.bad, icon: 'shield', t: 'PR Guard → čeká na souhlas s push', s: 'git push origin feat/api-rate-limit · náhled diffu' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3 }}>
                <Icon name={r.icon} size={16} style={{ color: r.c }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: Z.ink, fontWeight: 500 }}>{r.t}</div>
                  <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.s}</Mono>
                </div>
                <Icon name="chevron" size={14} style={{ color: Z.inkFaint }} />
              </div>
            ))}
          </div>
        </HudPanel>

      </div>
    </div>
  );
};

Object.assign(window, { OverviewBody, RightRailContent, LimitsPanel, AgentSdkPanel });

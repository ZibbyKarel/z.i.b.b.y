// ZIBBY velín — Overview body (přehled / velín). Redesign:
// headline nese stav (žádný duplicitní stat řádek), brífink má inline akce,
// rail je periferní vidění (limity mají jediný domov). Vše na ZT komponentách.
const { useState: useStateOv } = React;

// ---- limitní řádek v railu (jediný domov limitů) -------------------------
const VaLimitRow = ({ label, pct, note }) => {
  const c = pct >= 85 ? ZT.bad : pct >= 60 ? ZT.wait : ZT.ink2;
  return (
    <div style={{ padding: '9px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ ...T.micro, color: ZT.ink2 }}>{label}</span>
        <span style={{ fontFamily: ZT.mono, fontSize: 12, fontWeight: 600, color: pct >= 60 ? c : ZT.ink }}>{pct} %</span>
      </div>
      <ZtMeter pct={pct} color={pct >= 60 ? c : 'rgba(255,255,255,0.28)'} h={4} />
      <div style={{ ...T.micro, fontSize: 10.5, marginTop: 6 }}>{note}</div>
    </div>);

};

const LimitsPanel = ({ accent }) => {
  const r = CLAUDE_LIMITS.rolling,w = CLAUDE_LIMITS.weekly;
  return (
    <ZtPanel title="Limity" pad={18} right={<span style={T.micro}>jediný domov limitů</span>}>
      <VaLimitRow label="Claude · 5h" pct={r.usedPct} note={`reset za ${r.resetIn} · ${r.tokens}`} />
      <VaLimitRow label="Claude · týden" pct={w.usedPct} note={`reset ${w.resetIn} · ${w.tokens}`} />
    </ZtPanel>);

};

// ---- běžící agenti (živý panel) ------------------------------------------
const AgentSdkPanel = LimitsPanel; // zpětná kompatibilita exportu

const RunningPanel = ({ onNav }) =>
<ZtPanel title="Běží" live liveColor={ZT.run} pad={18} right={<span style={T.micro}>{RUNNING_AGENTS.length} agenti</span>}>
    {RUNNING_AGENTS.map((a, i) =>
  <div key={a.id} style={{ padding: '10px 0', borderBottom: i < RUNNING_AGENTS.length - 1 ? `1px solid ${ZT.line}` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <ZtDot state="run" size={6} />
          <span style={{ fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 600, color: ZT.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.skill}</span>
          <span style={{ ...T.micro, color: ZT.run }}>{a.pct} %</span>
        </div>
        <div style={{ ...T.micro, margin: '5px 0 7px', paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
        <div style={{ paddingLeft: 14 }}><ZtMeter pct={a.pct} color={ZT.run} /></div>
      </div>
  )}
    <div style={{ marginTop: 10 }}><ZtBtn size="sm" icon="pulse" onClick={() => onNav && onNav('runs')}>Otevřít aktivitu</ZtBtn></div>
  </ZtPanel>;


// ---- rail — periferní vidění velínu (jen na Přehledu) --------------------
const RightRailContent = ({ accent, onNav }) => {
  const ap = APPROVAL_QUEUE[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ZtApproval density="rail" onDecide={() => {}} a={{
        actor: ap.actor, action: ap.action.replace(/^[A-ZÁ-Ž]/, (m) => m.toLowerCase()),
        risk: ap.risk, impact: '1 248 Kč', impactNote: '14 položek · doručení zítra 18–20 h',
        detailLink: 'náhled košíku'
      }} />
      <RunningPanel onNav={onNav} />
    </div>);

};

// ---- brífink řádek s inline akcí podle stavu -----------------------------
const VaBriefRow = ({ state, title, sub, actions, last = false }) =>
<div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <ZtDot state={state} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...T.body, fontSize: 13.5, fontWeight: 500 }}>{title}</div>
      <div style={{ ...T.micro, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>{actions}</div>
  </div>;


const Mn = ({ children }) => <span style={{ fontFamily: ZT.mono, fontSize: '0.95em' }}>{children}</span>;

const OverviewBody = ({ accent, skills = SKILLS, setSkills, agents = AGENTS, onNav }) => {
  const [down, setDown] = useStateOv(false); // simulace výpadku démona (klikni na stav)
  const allTasks = typeof TASKS_DATA !== 'undefined' ? TASKS_DATA : [];
  const tRunning = allTasks.filter((t) => t.status === 'running');
  const tPending = allTasks.filter((t) => t.status === 'classified' || t.status === 'parked');

  if (down) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ZtPanel pad={24} live liveColor={ZT.bad} style={{ borderColor: `${ZT.bad}55` }}>
          <div onClick={() => setDown(false)} title="přepnout zpět na NOMINAL" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <ZtDot state="bad" size={7} />
            <span style={{ ...T.label, color: ZT.bad }}>Systém · offline</span>
            <span style={{ ...T.micro, marginLeft: 6 }}>démon na {SYSTEM.host} neodpovídá</span>
          </div>
          <div style={{ ...T.display, marginTop: 14 }}>
            Node démon spadl. <span style={{ color: ZT.ink2, fontWeight: 400 }}>Agenti jsou pozastavení,</span> naplánované běhy se nespustí.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 13px', background: `${ZT.bad}12`, border: `1px solid ${ZT.bad}33`, borderRadius: ZT.rCtl, maxWidth: 'fit-content' }}>
            <Icon name="warn" size={14} style={{ color: ZT.bad }} />
            <span style={{ ...T.micro, fontSize: 11 }}>poslední signál před 4 m · ECONNREFUSED na :8787 · 3 běhy ve frontě</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <ZtBtn variant="danger" icon="retry" onClick={() => setDown(false)}>Restartovat démona</ZtBtn>
          </div>
        </ZtPanel>
      </div>);

  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      {/* status — headline nese stav, žádný duplicitní stat řádek */}
      <ZtPanel pad={24} live liveColor={ZT.run}>
        <div onClick={() => setDown(true)} title="simulovat výpadek démona" style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <ZtDot state="ok" size={7} />
          <span style={{ ...T.label, color: ZT.ok }}>Nominal</span>
          <span style={{ ...T.micro, marginLeft: 6 }}>démon na {SYSTEM.host} · vzhůru {SYSTEM.uptime} · caffeinate</span>
        </div>
        <div style={{ ...T.display, marginTop: 14 }}>
          {greeting()}. <span style={{ color: ZT.run }}>{tRunning.length} {tRunning.length === 1 ? 'task běží' : 'tasky běží'}</span>,{' '}
          <span style={{ color: ZT.wait }}>{tPending.length} čeká na tebe</span>.
        </div>
        <div style={{ ...T.bodySm, marginTop: 8, maxWidth: '58ch' }}>
          Noční běhy proběhly bez chyby. Vše podstatné je v ranním brífinku níže — vyřídíš ho odsud.
        </div>
      </ZtPanel>

      {/* ranní brífink — každý řádek nese akci podle stavu */}
      <ZtPanel title="Ranní brífink · co se stalo přes noc" pad={20} right={<span style={T.micro}>3 položky</span>}>
        <VaBriefRow state="ok"
        title={<span><Mn>Build Feature</Mn> dokončil branch feat/search-filters</span>}
        sub="4 fáze · 42 min · test-report zelený"
        actions={<ZtBtn size="sm" icon="branch" onClick={() => onNav && onNav('runs')}>Otevřít PR</ZtBtn>} />
        <VaBriefRow state="wait"
        title={<span><Mn>Build Feature</Mn> zaparkován po 3 pokusech</span>}
        sub="Tester: flaky test v checkout-flow · poslední chyba v logu"
        actions={<React.Fragment>
            <ZtBtn size="sm" icon="retry" onClick={() => onNav && onNav('runs')}>Retry</ZtBtn>
            <ZtBtn size="sm">Zahodit</ZtBtn>
          </React.Fragment>} />
        <VaBriefRow state="wait" last
        title={<span><Mn>PR Guard</Mn> žádá souhlas s push → main</span>}
        sub="git push origin feat/api-rate-limit · +214 −38 · review.md čistý"
        actions={<React.Fragment>
            <ZtBtn variant="primary" size="sm" icon="check" onClick={() => onNav && onNav('approvals')}>Schválit</ZtBtn>
            <ZtBtn size="sm" icon="x">Zamítnout</ZtBtn>
          </React.Fragment>} />
      </ZtPanel>
    </div>);

};

Object.assign(window, { OverviewBody, RightRailContent, LimitsPanel, AgentSdkPanel, RunningPanel, VaBriefRow });
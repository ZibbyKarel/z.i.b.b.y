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
      <ZtMeter color={pct >= 60 ? c : 'rgba(255,255,255,0.28)'} h={4} pct={pct} />
      <div style={{ ...T.micro, fontSize: 10.5, marginTop: 6 }}>{note}</div>
    </div>);

};

const LimitsPanel = ({ accent }) => {
  const r = CLAUDE_LIMITS.rolling,w = CLAUDE_LIMITS.weekly;
  return (
    <ZtPanel pad={18} right={<span style={T.micro}>jediný domov limitů</span>} title="Limity">
      <VaLimitRow label="Claude · 5h" note={`reset za ${r.resetIn} · ${r.tokens}`} pct={r.usedPct} />
      <VaLimitRow label="Claude · týden" note={`reset ${w.resetIn} · ${w.tokens}`} pct={w.usedPct} />
    </ZtPanel>);

};

// ---- běžící agenti (živý panel) ------------------------------------------
const AgentSdkPanel = LimitsPanel; // zpětná kompatibilita exportu

const RunningPanel = ({ onNav }) =>
<ZtPanel live liveColor={ZT.run} pad={18} right={<span style={T.micro}>{RUNNING_AGENTS.length} agenti</span>} title="Běží">
    {RUNNING_AGENTS.map((a, i) =>
  <div key={a.id} style={{ padding: '10px 0', borderBottom: i < RUNNING_AGENTS.length - 1 ? `1px solid ${ZT.line}` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <ZtDot size={6} state="run" />
          <span style={{ fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 600, color: ZT.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.skill}</span>
          <span style={{ ...T.micro, color: ZT.run }}>{a.pct} %</span>
        </div>
        <div style={{ ...T.micro, margin: '5px 0 7px', paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
        <div style={{ paddingLeft: 14 }}><ZtMeter color={ZT.run} pct={a.pct} /></div>
      </div>
  )}
    <div style={{ marginTop: 10 }}><ZtBtn icon="pulse" onClick={() => onNav && onNav('runs')} size="sm">Otevřít aktivitu</ZtBtn></div>
  </ZtPanel>;


// ---- rail — periferní vidění velínu (jen na Přehledu) --------------------
const RightRailContent = ({ accent, onNav }) => {
  const ap = APPROVAL_QUEUE[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ZtApproval a={{
        actor: ap.actor, action: ap.action.replace(/^[A-ZÁ-Ž]/, (m) => m.toLowerCase()),
        risk: ap.risk, impact: '1 248 Kč', impactNote: '14 položek · doručení zítra 18–20 h',
        detailLink: 'náhled košíku'
      }} density="rail" onDecide={() => {}} />
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
        <ZtPanel live liveColor={ZT.bad} pad={24} style={{ borderColor: `${ZT.bad}55` }}>
          <div onClick={() => setDown(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} title="přepnout zpět na NOMINAL">
            <ZtDot size={7} state="bad" />
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
            <ZtBtn icon="retry" onClick={() => setDown(false)} variant="danger">Restartovat démona</ZtBtn>
          </div>
        </ZtPanel>
      </div>);

  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      {/* status — headline nese stav, žádný duplicitní stat řádek */}
      <ZtPanel live liveColor={ZT.run} pad={24}>
        <div onClick={() => setDown(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} title="simulovat výpadek démona">
          <ZtDot size={7} state="ok" />
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
      <ZtPanel pad={20} right={<span style={T.micro}>3 položky</span>} title="Ranní brífink · co se stalo přes noc">
        <VaBriefRow actions={<ZtBtn icon="branch" onClick={() => onNav && onNav('runs')} size="sm">Otevřít PR</ZtBtn>}
        state="ok"
        sub="4 fáze · 42 min · test-report zelený"
        title={<span><Mn>Build Feature</Mn> dokončil branch feat/search-filters</span>} />
        <VaBriefRow actions={<React.Fragment>
            <ZtBtn icon="retry" onClick={() => onNav && onNav('runs')} size="sm">Retry</ZtBtn>
            <ZtBtn size="sm">Zahodit</ZtBtn>
          </React.Fragment>}
        state="wait"
        sub="Tester: flaky test v checkout-flow · poslední chyba v logu"
        title={<span><Mn>Build Feature</Mn> zaparkován po 3 pokusech</span>} />
        <VaBriefRow last actions={<React.Fragment>
            <ZtBtn icon="check" onClick={() => onNav && onNav('approvals')} size="sm" variant="primary">Schválit</ZtBtn>
            <ZtBtn icon="x" size="sm">Zamítnout</ZtBtn>
          </React.Fragment>}
        state="wait"
        sub="git push origin feat/api-rate-limit · +214 −38 · review.md čistý"
        title={<span><Mn>PR Guard</Mn> žádá souhlas s push → main</span>} />
      </ZtPanel>
    </div>);

};

Object.assign(window, { OverviewBody, RightRailContent, LimitsPanel, AgentSdkPanel, RunningPanel, VaBriefRow });
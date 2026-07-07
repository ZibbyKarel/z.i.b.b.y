// ZIBBY redesign — VelinAfter: vyhlazený HUD Přehled (1560×940)
// Bez scanlines/mřížky · glow jen na živém · informace jednou · rail jen na Přehledu

const ZtMicIcon = ({ size = 13 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"></rect>
    <path d="M5 10v2a7 7 0 0 0 14 0v-2"></path>
    <path d="M12 19v3M8 22h8"></path>
  </svg>
);

// ---- sidebar ---------------------------------------------------------------
const VaSidebar = () => (
  <nav style={{ width: 216, flex: '0 0 216px', borderRight: `1px solid ${ZT.line}`, display: 'flex', flexDirection: 'column', padding: '20px 12px', background: 'rgba(0,0,0,0.22)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 20px' }}>
      <img src="uploads/icon.png" alt="ZIBBY" style={{ width: 38, height: 38, objectFit: 'contain' }} />
      <div>
        <div style={{ fontFamily: ZT.mono, fontSize: 15, fontWeight: 700, letterSpacing: '0.30em', color: ZT.ink }}>Z·I·B·B·Y</div>
        <div style={{ ...T.micro, fontSize: 9.5, marginTop: 3, whiteSpace: 'nowrap' }}>tichý velín · v0.9</div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {NAV.map((n) => {
        const on = n.id === 'overview';
        return (
          <div key={n.id} style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: ZT.rCtl, cursor: 'pointer',
            color: on ? ZT.ink : ZT.ink2, background: on ? ZT.accentDim : 'transparent',
            fontFamily: ZT.sans, fontSize: 13.5, fontWeight: on ? 600 : 450,
          }}>
            <span style={{ color: on ? ZT.accent : ZT.ink3, display: 'flex' }}><Icon name={n.glyph} size={16} /></span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge ? <span style={{ fontFamily: ZT.mono, fontSize: 11, fontWeight: 600, color: n.alert ? ZT.wait : ZT.ink3 }}>{n.badge}</span> : null}
          </div>
        );
      })}
    </div>
    <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${ZT.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: ZT.rCtl, cursor: 'pointer', color: ZT.ink2, fontSize: 13.5 }}>
        <span style={{ color: ZT.ink3, display: 'flex' }}><Icon name="gear" size={16} /></span>
        Nastavení systému
      </div>
    </div>
  </nav>
);

// ---- top bar ---------------------------------------------------------------
const VaTopBar = () => (
  <header style={{ height: 58, flex: '0 0 58px', display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: `1px solid ${ZT.line}` }}>
    <span style={{ fontFamily: ZT.sans, fontSize: 13.5, fontWeight: 600, color: ZT.ink }}>Přehled</span>
    {/* search ve flow — žádné absolutní centrování, nekoliduje */}
    <button className="zt-focusable" style={{
      display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 360px', marginLeft: 'auto', marginRight: 'auto', minWidth: 160,
      padding: '8px 13px', background: 'rgba(0,0,0,0.25)', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink3, cursor: 'pointer',
    }}>
      <Icon name="search" size={13} />
      <span style={{ fontFamily: ZT.sans, fontSize: 12.5, flex: 1, textAlign: 'left' }}>Příkaz nebo skill…</span>
      <span style={{ ...T.micro, fontSize: 10, border: `1px solid ${ZT.line}`, borderRadius: 4, padding: '1px 6px' }}>⌘K</span>
    </button>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ZtBtn variant="primary" size="sm" icon="bolt">Task</ZtBtn>
      <ZtBtn variant="ghost" size="sm"><ZtMicIcon /> Voice</ZtBtn>
      <ZtBtn variant="ghost" size="sm">CZ</ZtBtn>
    </div>
  </header>
);

// ---- briefing row s inline akcí ---------------------------------------------
const VaBriefRow = ({ state, title, sub, actions, last = false }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <ZtDot state={state} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...T.body, fontSize: 13.5, fontWeight: 500 }}>{title}</div>
      <div style={{ ...T.micro, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>{actions}</div>
  </div>
);

// ---- rail panely --------------------------------------------------------------
const VaRunningPanel = () => (
  <ZtPanel title="Běží" live liveColor={ZT.run} pad={18}
    right={<span style={{ ...T.micro }}>2 agenti</span>}>
    {RUNNING_AGENTS.map((a, i) => (
      <div key={a.id} style={{ padding: '10px 0', borderBottom: i < RUNNING_AGENTS.length - 1 ? `1px solid ${ZT.line}` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <ZtDot state="run" size={6} />
          <span style={{ fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 600, color: ZT.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.skill}</span>
          <span style={{ ...T.micro, color: ZT.run }}>{a.pct} %</span>
        </div>
        <div style={{ ...T.micro, margin: '5px 0 7px', paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
        <div style={{ paddingLeft: 14 }}><ZtMeter pct={a.pct} color={ZT.run} /></div>
      </div>
    ))}
  </ZtPanel>
);

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
    </div>
  );
};

const VaLimitsPanel = () => (
  <ZtPanel title="Limity & kredit" pad={18} right={<span style={T.micro}>jediný domov limitů</span>}>
    <VaLimitRow label="Claude · 5h okno" pct={64} note="reset za 2 h 11 m · 128k / 200k" />
    <VaLimitRow label="Claude · týden" pct={38} note="reset po 09:00 · 1.9M / 5M" />
    <div style={{ borderTop: `1px solid ${ZT.line}`, marginTop: 8, paddingTop: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ ...T.num, fontSize: 22 }}>$128</span>
        <span style={T.micro}>/ $200 · Agent SDK</span>
        <span style={{ ...T.micro, marginLeft: 'auto' }}>obnova 1. čer</span>
      </div>
      <div style={{ marginTop: 9 }}><ZtMeter pct={36} color={'rgba(255,255,255,0.28)'} /></div>
    </div>
  </ZtPanel>
);

// ---- celá obrazovka -----------------------------------------------------------
const VelinAfter = () => (
  <div style={{
    width: '100%', height: '100%', display: 'flex', fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden',
    background: `radial-gradient(ellipse 120% 90% at 50% -10%, #101722 0%, ${ZT.bg} 58%)`,
  }}>
    <VaSidebar />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <VaTopBar />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 324px', gap: 20, padding: '22px 24px', alignContent: 'start' }}>

        {/* hlavní sloupec */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* status — headline nese stav, žádný duplicitní stat řádek */}
          <ZtPanel pad={24} live liveColor={ZT.run}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ZtDot state="ok" size={7} />
              <span style={{ ...T.label, color: ZT.ok }}>Nominal</span>
              <span style={{ ...T.micro, marginLeft: 6 }}>démon na Mac M5 · vzhůru 14 h · caffeinate</span>
            </div>
            <div style={{ ...T.display, marginTop: 14 }}>
              Dobré ráno. <span style={{ color: ZT.run }}>2 tasky běží</span>,{' '}
              <span style={{ color: ZT.wait }}>2 čekají na tebe</span>.
            </div>
            <div style={{ ...T.bodySm, marginTop: 8, maxWidth: '56ch' }}>
              Noční běhy proběhly za $13.40. Vše podstatné je v ranním brífinku níže — vyřídíš ho odsud.
            </div>
          </ZtPanel>

          {/* ranní brífink — každý řádek nese akci podle stavu */}
          <ZtPanel title="Ranní brífink · co se stalo přes noc" pad={20}
            right={<span style={T.micro}>3 položky · $13.40</span>}>
            <VaBriefRow state="ok"
              title={<span><span style={{ fontFamily: ZT.mono, fontSize: '0.95em' }}>Build Feature</span> dokončil branch feat/search-filters</span>}
              sub="4 fáze · 42 min · $11.20 z $25 · test-report zelený"
              actions={<ZtBtn size="sm" icon="branch">Otevřít PR</ZtBtn>} />
            <VaBriefRow state="wait"
              title={<span><span style={{ fontFamily: ZT.mono, fontSize: '0.95em' }}>Build Feature</span> zaparkován po 3 pokusech</span>}
              sub="Tester: flaky test v checkout-flow · poslední chyba v logu"
              actions={<React.Fragment>
                <ZtBtn size="sm" icon="retry">Retry</ZtBtn>
                <ZtBtn size="sm">Zahodit</ZtBtn>
              </React.Fragment>} />
            <VaBriefRow state="wait" last
              title={<span><span style={{ fontFamily: ZT.mono, fontSize: '0.95em' }}>PR Guard</span> žádá souhlas s push → main</span>}
              sub="git push origin feat/api-rate-limit · +214 −38 · review.md čistý"
              actions={<React.Fragment>
                <ZtBtn variant="primary" size="sm" icon="check">Schválit</ZtBtn>
                <ZtBtn size="sm" icon="x">Zamítnout</ZtBtn>
              </React.Fragment>} />
          </ZtPanel>
        </div>

        {/* rail — jen na Přehledu; periferní vidění velínu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ZtApproval density="rail" a={{
            actor: 'rohlik', action: 'objednat košík', risk: 'platba',
            impact: '1 248 Kč', impactNote: '14 položek · doručení zítra 18–20 h',
            detailLink: 'náhled košíku',
          }} />
          <VaRunningPanel />
          <VaLimitsPanel />
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { VelinAfter, VaSidebar, VaTopBar, ZtMicIcon });

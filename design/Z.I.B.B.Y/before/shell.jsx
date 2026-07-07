// ZIBBY velín — shared shell primitives, Sidebar, TopBar (context switch + Claude limits)
const { useState } = React;

// ---- primitives ----------------------------------------------------------

const limitColor = (pct) => pct >= 85 ? Z.bad : pct >= 60 ? Z.warn : Z.ok;

const Bar = ({ pct, color, h = 6, glow = false, track = 'rgba(255,255,255,0.06)' }) =>
<div style={{ height: h, borderRadius: h, background: track, overflow: 'hidden', position: 'relative' }}>
    <div style={{
    position: 'absolute', inset: 0, width: pct + '%', borderRadius: h,
    background: color, boxShadow: glow ? `0 0 10px ${color}88` : 'none', transition: 'width .4s'
  }} />
  </div>;


const Dot = ({ color, pulse = false, size = 8 }) =>
<span style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', display: 'inline-block' }}>
    {pulse && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: color, opacity: 0.35, animation: 'zpulse 1.8s ease-out infinite' }} />}
    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}` }} />
  </span>;


const Mono = ({ children, style }) => <span style={{ fontFamily: Z.mono, ...style }}>{children}</span>;

// run button ("čudlík")
const RunBtn = ({ accent, label = 'Spustit', size = 'md', onClick, icon = 'play' }) => {
  const [h, setH] = useState(false);
  const pad = size === 'sm' ? '6px 12px' : '8px 16px';
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: pad, cursor: 'pointer',
      fontFamily: Z.mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
      color: h ? Z.bg0 : accent, background: h ? accent : 'transparent',
      border: `1px solid ${accent}`, borderRadius: 2,
      boxShadow: h ? `0 0 16px ${accent}66` : 'none', transition: 'all .16s'
    }}>
      <Icon name={icon} size={12} stroke={2} /> {label}
    </button>);

};

const GhostBtn = ({ children, icon, onClick, accent = Z.inkDim }) => {
  const [h, setH] = useState(false);
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
      fontFamily: Z.mono, fontSize: 11, color: h ? Z.ink : accent, background: h ? 'rgba(255,255,255,0.05)' : 'transparent',
      border: `1px solid ${Z.line}`, borderRadius: 2, transition: 'all .14s'
    }}>
      {icon && <Icon name={icon} size={13} />} {children}
    </button>);

};

const SectionLabel = ({ children, right }) =>
<div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
    <div style={{ fontFamily: Z.mono, fontSize: 11, letterSpacing: '0.18em', color: Z.inkFaint, textTransform: 'uppercase' }}>{children}</div>
    {right}
  </div>;


// ---- Sidebar -------------------------------------------------------------

const Sidebar = ({ active = 'overview', accent, onNav }) =>
<nav style={{
  width: 224, flex: '0 0 224px', background: Z.bg0, borderRight: `1px solid ${Z.line}`,
  display: 'flex', flexDirection: 'column', padding: '22px 14px'
}}>
    {/* brand */}
    <div style={{ padding: '4px 6px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="uploads/icon.png" alt="ZIBBY" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(91,141,239,0.45))' }} />
        <div data-zb-wordmark style={{ fontFamily: Z.mono, fontSize: 18, fontWeight: 700, letterSpacing: '0.30em', color: Z.ink }}>
          Z<span style={{ color: Z.inkFaint }}>·</span>I<span style={{ color: Z.inkFaint }}>·</span>B<span style={{ color: Z.inkFaint }}>·</span>B<span style={{ color: Z.inkFaint }}>·</span>Y
        </div>
      </div>
      <div style={{ fontFamily: Z.mono, fontSize: 7.5, letterSpacing: '-0.01em', color: Z.inkFaint, marginTop: 7, whiteSpace: 'nowrap' }}>Zestful Intuitive Brainy Butler for You</div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {NAV.map((n) => {
      const on = n.id === active;
      return (
        <div key={n.id} onClick={() => onNav && onNav(n.id)} style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 3, cursor: 'pointer',
          color: on ? Z.ink : Z.inkDim, background: on ? 'rgba(255,255,255,0.04)' : 'transparent',
          position: 'relative', fontSize: 13.5, fontWeight: on ? 600 : 500
        }}>
            {on && <span style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderRadius: 3, background: accent, boxShadow: `0 0 10px ${accent}` }} />}
            <span style={{ color: on ? accent : Z.inkFaint, display: 'flex' }}><Icon name={n.glyph} size={17} /></span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge && <span style={{ fontFamily: Z.mono, fontSize: 10, fontWeight: 700, color: Z.bg0, background: n.alert ? Z.bad : accent, borderRadius: 10, padding: '1px 7px', boxShadow: n.alert ? `0 0 10px ${Z.bad}88` : 'none' }}>{n.badge}</span>}
          </div>);

    })}
    </div>

    <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${Z.line}` }}>
      <div onClick={() => onNav && onNav('settings')} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 3, cursor: 'pointer',
      color: active === 'settings' ? Z.ink : Z.inkDim, background: active === 'settings' ? 'rgba(255,255,255,0.04)' : 'transparent',
      position: 'relative', fontSize: 13.5, fontWeight: active === 'settings' ? 600 : 500
    }}>
        {active === 'settings' && <span style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderRadius: 3, background: accent, boxShadow: `0 0 10px ${accent}` }} />}
        <span style={{ color: active === 'settings' ? accent : Z.inkFaint, display: 'flex' }}><Icon name="gear" size={17} /></span>
        <span style={{ flex: 1 }}>Nastavení systému</span>
      </div>
    </div>
  </nav>;


// ---- Context switch removed (kontext home/work zrušen) -------------------

// ---- Claude Code limits widget (always in top bar) -----------------------

// ---- Limits widget: TWO separate wallets ---------------------------------
// A) interaktivní limity (Claude Code)  |  B) Agent SDK kredit ($) — priorita

const MiniBar = ({ label, pct, color, width = 78 }) =>
<div style={{ width }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
      <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{label}</Mono>
      <Mono style={{ fontSize: 9.5, color, fontWeight: 700 }}>{pct}%</Mono>
    </div>
    <Bar pct={pct} color={color} h={6} glow />
  </div>;


const LimitRow = ({ d }) => {
  const c = limitColor(d.usedPct);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <Mono style={{ fontSize: 10.5, color: Z.inkDim, letterSpacing: '0.04em' }}>{d.label}</Mono>
        <Mono style={{ fontSize: 10, color: c, fontWeight: 600 }}>{d.usedPct}%</Mono>
      </div>
      <Bar pct={d.usedPct} color={c} h={5} glow />
      <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 5 }}>reset {d.resetIn} · {d.tokens}</Mono>
    </div>);

};

const Sparkline = ({ data, color, w = 260, h = 40 }) => {
  const max = Math.max(...data),min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = i / (data.length - 1) * w;
    const y = h - (v - min) / (max - min || 1) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block', width: '100%' }} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity="0.08" stroke="none" />
    </svg>);

};

const LimitsWidget = () => {
  const [open, setOpen] = useState(false);
  const r = CLAUDE_LIMITS.rolling,w = CLAUDE_LIMITS.weekly,sdk = AGENT_SDK;
  const sdkColor = limitColor(sdk.usedPct);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '8px 15px', cursor: 'pointer',
        background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3
      }}>
        {/* A) interaktivní */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Mono style={{ fontSize: 8, color: Z.inkFaint, letterSpacing: '0.12em', textTransform: 'uppercase', writingMode: 'horizontal-tb', lineHeight: 1.25, textAlign: 'right' }}>inter-<br />aktivní</Mono>
          <MiniBar label="5h" pct={r.usedPct} color={limitColor(r.usedPct)} width={66} />
          <MiniBar label="týden" pct={w.usedPct} color={limitColor(w.usedPct)} width={66} />
        </div>
        {/* divider */}
        <div style={{ width: 1, height: 34, background: Z.lineHi }} />
        {/* B) Agent SDK kredit — priorita */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: sdkColor }}>
            <Icon name="dollar" size={17} />
            <Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.25 }}>agent<br />sdk</Mono>
          </div>
          <div style={{ width: 66 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'baseline' }}>
              <Mono style={{ fontSize: 11, color: Z.ink, fontWeight: 700, lineHeight: 1 }}>${sdk.remaining}</Mono>
              <Mono style={{ fontSize: 9, color: Z.inkFaint }}>/${sdk.total}</Mono>
            </div>
            <Bar pct={sdk.usedPct} color={sdkColor} h={6} glow />
          </div>
        </div>
        <Icon name="chevron" size={14} style={{ color: Z.inkFaint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }} />
      </button>

      {open &&
      <div style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, zIndex: 50,
        background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 3, padding: 18,
        boxShadow: '0 18px 50px rgba(0,0,0,0.5)'
      }}>
          {/* A */}
          <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Interaktivní limity · Claude Code</Mono>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 13 }}>
            <LimitRow d={r} /><LimitRow d={w} />
          </div>
          <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 10 }}>čerpá tvůj chat · nezávislé na agentech</Mono>

          {/* divider */}
          <div style={{ height: 1, background: Z.lineHi, margin: '16px 0' }} />

          {/* B */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Mono style={{ fontSize: 9.5, color: sdkColor, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Agent SDK kredit</Mono>
            <Mono style={{ fontSize: 9, color: Z.inkFaint }}>obnova {sdk.renew}</Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 11 }}>
            <Mono style={{ fontSize: 26, fontWeight: 700, color: Z.ink }}>${sdk.remaining}</Mono>
            <Mono style={{ fontSize: 12, color: Z.inkDim }}>zbývá z ${sdk.total}</Mono>
          </div>
          <div style={{ marginTop: 9 }}><Bar pct={sdk.usedPct} color={sdkColor} h={6} glow /></div>
          <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 7 }}>spotřebováno ${sdk.used} · běhy agentů čerpají odsud</Mono>

          <div style={{ marginTop: 14 }}>
            <Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.12em' }}>TREND 14 DNÍ ($/den)</Mono>
            <div style={{ marginTop: 6 }}><Sparkline data={sdk.trend} color={sdkColor} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <div>
              <Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em' }}>PODLE AGENTA</Mono>
              {sdk.byAgent.slice(0, 4).map(([n, cx, p], i) =>
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
                  <Dot color={Z.work} size={5} />
                  <Mono style={{ fontSize: 10.5, color: Z.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</Mono>
                  <Mono style={{ fontSize: 10, color: Z.inkDim }}>${p}</Mono>
                </div>
            )}
            </div>
            <div>
              <Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em' }}>PODLE PIPELINE</Mono>
              {sdk.byPipeline.slice(0, 4).map(([n, cx, p], i) =>
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
                  <Dot color={Z.work} size={5} />
                  <Mono style={{ fontSize: 10.5, color: Z.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</Mono>
                  <Mono style={{ fontSize: 10, color: Z.inkDim }}>${p}</Mono>
                </div>
            )}
            </div>
          </div>
        </div>
      }
    </div>);

};

// ---- language switcher (dropdown, CZ / EN — bez vlajek) ------------------
const LANGS = [
  { id: 'cs', code: 'CZ', label: 'Čeština' },
  { id: 'en', code: 'EN', label: 'English' },
];

const LangSwitch = ({ lang = 'cs', onChange, accent }) => {
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.id === lang) || LANGS[0];
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} title="Jazyk rozhraní" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 11px', cursor: 'pointer',
        background: open ? Z.bg0 : 'transparent', border: `1px solid ${open ? accent : Z.line}`, borderRadius: 3,
        color: Z.ink, fontFamily: Z.mono, fontSize: 12, fontWeight: 600, transition: 'all .14s',
      }}>
        <span style={{ color: accent }}>{cur.code}</span>
        <span style={{ color: Z.inkDim, fontWeight: 400, fontSize: 11 }}>{cur.label}</span>
        <Icon name="chevron" size={12} style={{ color: Z.inkFaint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .14s' }} />
      </button>
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, minWidth: 168,
            background: Z.bg1, border: `1px solid ${Z.line}`, borderRadius: 4,
            boxShadow: `0 0 0 1px ${accent}1f, 0 18px 44px rgba(0,0,0,0.55)`, overflow: 'hidden', padding: 4,
          }}>
            {LANGS.map((l) => {
              const on = l.id === lang;
              return (
                <button key={l.id} onClick={() => { onChange(l.id); setOpen(false); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', cursor: 'pointer',
                  background: on ? accentDimOf() : 'transparent', border: 'none', borderRadius: 2,
                  color: Z.ink, textAlign: 'left', transition: 'background .12s',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = Z.bg0; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color: on ? accent : Z.inkDim, width: 22 }}>{l.code}</span>
                  <span style={{ fontSize: 13, color: Z.ink, flex: 1 }}>{l.label}</span>
                  {on && <Icon name="check" size={14} stroke={2} style={{ color: accent }} />}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      )}
    </div>
  );
};

const VoiceToggleBtn = ({ onClick, accent }) => {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      title="Voice Mode (V)"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 13px', cursor: 'pointer',
        background: h ? `${accent}18` : 'transparent',
        border: `1px solid ${h ? accent : Z.line}`,
        borderRadius: 3, color: h ? accent : Z.inkDim,
        fontFamily: Z.mono, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.06em',
        transition: 'all .16s',
      }}
    >
      {/* mic icon inline */}
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
        <path d="M12 19v3M8 22h8" />
      </svg>
      VOICE
    </button>
  );
};

const TopBar = ({ accent, nav = 'overview', lang = 'cs', onLang, onVoice, onNewTask, taskQueue = [], onClearDoneTasks }) =>
<header style={{
  height: 64, flex: '0 0 64px', display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px',
  borderBottom: `1px solid ${Z.line}`, background: Z.bg1, position: 'relative', zIndex: 20
}}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <ZibbyMark size={20} color={Z.inkDim} />
      <Mono style={{ fontSize: 12, color: Z.ink, fontWeight: 600 }}>{NAV_LABEL[nav] || 'Přehled'}</Mono>
    </div>
    {/* centered command / search bar */}
    <button title="Příkaz nebo skill (⌘K)" style={{
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      display: 'flex', alignItems: 'center', gap: 10, width: 360, maxWidth: '40vw', padding: '9px 14px',
      background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, color: Z.inkFaint, cursor: 'pointer'
    }}>
      <Icon name="search" size={14} />
      <span style={{ fontSize: 12.5, color: Z.inkFaint, flex: 1, textAlign: 'left' }}>Příkaz nebo skill…</span>
      <span style={{ fontFamily: Z.mono, fontSize: 10, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 2, padding: '1px 6px' }}>⌘K</span>
    </button>
    <div style={{ flex: 1 }} />
    {onNewTask && (
      <NewTaskBtn
        onClick={onNewTask}
        accent={accent}
        pendingCount={taskQueue.filter(t => t.state === 'categorizing').length}
      />
    )}
    {taskQueue.length > 0 && (
      <CategorizationQueue
        accent={accent}
        tasks={taskQueue}
        onClearDone={onClearDoneTasks}
      />
    )}
    {onVoice && <VoiceToggleBtn onClick={onVoice} accent={accent} />}
    <LangSwitch lang={lang} accent={accent} onChange={onLang} />
  </header>;


Object.assign(window, { Bar, Dot, Mono, RunBtn, GhostBtn, SectionLabel, Sidebar, LimitsWidget, TopBar, LangSwitch, limitColor, MiniBar, Sparkline, VoiceToggleBtn });
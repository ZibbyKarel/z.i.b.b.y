// ZIBBY redesign — sjednocené tokeny (ZT) + sdílené komponenty „after"
// Jediný zdroj pravdy pro HUD i Voice. Barva = stav, tvar = kategorie.

const ZT = {
  // scéna + povrchy (3 úrovně, konec ad-hoc rgba)
  bg:        '#0b0e13',
  surface:   '#10151c',
  surfaceHi: '#151c25',
  line:      'rgba(255,255,255,0.08)',
  lineHi:    'rgba(255,255,255,0.14)',
  // text
  ink:  '#e6edf3',
  ink2: '#9aa7b4',
  ink3: '#66737f',
  // hlas systému (interakce, výběr, brand — už ne stav „běží")
  accent: '#5b8def',
  accentDim: 'rgba(91,141,239,0.14)',
  // stavy — jediné barvy, které smí svítit
  ok:   '#3fcf8e',
  run:  '#7aa5f8',
  wait: '#f0b429',
  bad:  '#ff6b6b',
  // riziko — jediná kategorická paleta, která zůstává
  riskPay:  '#f0b429',
  riskDel:  '#ff6b6b',
  riskPush: '#b07cff',
  riskSend: '#56c4d6',
  // tvar
  rCtl: 6,
  rPanel: 10,
  // typo
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
};

const ZT_RISK = {
  platba:   { c: ZT.riskPay,  glyph: 'dollar', label: 'platba' },
  mazani:   { c: ZT.riskDel,  glyph: 'trash',  label: 'mazání' },
  push:     { c: ZT.riskPush, glyph: 'branch', label: 'push' },
  odeslani: { c: ZT.riskSend, glyph: 'arrow',  label: 'odeslání' },
};

const ZT_STATE = {
  ok:   { c: ZT.ok,   label: 'hotovo' },
  run:  { c: ZT.run,  label: 'běží',  live: true },
  wait: { c: ZT.wait, label: 'čeká na tebe', live: true },
  bad:  { c: ZT.bad,  label: 'chyba' },
  idle: { c: ZT.ink3, label: 'idle' },
};

// typografická škála — 8 kroků, minimum 11 px
const T = {
  display: { fontFamily: ZT.sans, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: ZT.ink },
  title:   { fontFamily: ZT.sans, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25, color: ZT.ink },
  body:    { fontFamily: ZT.sans, fontSize: 14, fontWeight: 400, lineHeight: 1.6, color: ZT.ink },
  bodySm:  { fontFamily: ZT.sans, fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: ZT.ink2 },
  num:     { fontFamily: ZT.mono, fontSize: 26, fontWeight: 600, lineHeight: 1, color: ZT.ink },
  data:    { fontFamily: ZT.mono, fontSize: 12, fontWeight: 400, lineHeight: 1.6, color: ZT.ink2 },
  label:   { fontFamily: ZT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: ZT.ink3 },
  micro:   { fontFamily: ZT.mono, fontSize: 11, fontWeight: 400, lineHeight: 1.5, color: ZT.ink3 },
};

// ---- CSS (focus ring, keyframes) -----------------------------------------
(function injectZtCss() {
  const id = 'zt-css';
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = `
.zt-focusable:focus-visible { outline: 2px solid ${ZT.accent}; outline-offset: 2px; }
@keyframes ztLive   { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes ztSpin   { to { transform: rotate(360deg); } }
@keyframes ztRingIn  { 0% { transform: scale(1.5); opacity: 0; } 60% { opacity: .4; } 100% { transform: scale(1); opacity: 0; } }
@keyframes ztRingOut { 0% { transform: scale(1); opacity: .4; } 100% { transform: scale(1.55); opacity: 0; } }
@keyframes ztBreath  { 0%,100% { transform: scale(.985); opacity: .8; } 50% { transform: scale(1.01); opacity: 1; } }
@keyframes ztArc     { 0% { stroke-dashoffset: 300; } 100% { stroke-dashoffset: 40; } }
@keyframes ztFadeUp  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ztCaret   { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .zt-anim, .zt-anim * { animation: none !important; }
}
`;
  document.head.appendChild(el);
})();

// ---- ZtDot — stavová tečka; pulz jen u živých stavů ----------------------
const ZtDot = ({ state = 'idle', size = 7 }) => {
  const s = ZT_STATE[state] || ZT_STATE.idle;
  return (
    <span className="zt-anim" style={{
      width: size, height: size, borderRadius: '50%', background: s.c, flex: '0 0 auto', display: 'inline-block',
      boxShadow: s.live ? `0 0 8px ${s.c}aa` : 'none',
      animation: s.live ? 'ztLive 2s ease-in-out infinite' : 'none',
    }}></span>
  );
};

// ---- ZtChip — stavový chip (jediná definice stavů) -----------------------
const ZtChip = ({ state = 'idle', children }) => {
  const s = ZT_STATE[state] || ZT_STATE.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '3px 10px 3px 8px',
      borderRadius: 999, border: `1px solid ${s.c}33`, background: `${s.c}10`,
      fontFamily: ZT.mono, fontSize: 11, color: s.c, whiteSpace: 'nowrap',
    }}>
      <ZtDot state={state} size={6} />
      {children || s.label}
    </span>
  );
};

// ---- ZtRisk — rizikový tag (sémantická barva + glyf) ----------------------
const ZtRisk = ({ risk = 'platba', big = false }) => {
  const r = ZT_RISK[risk] || ZT_RISK.platba;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: big ? '5px 11px' : '3px 9px', borderRadius: ZT.rCtl,
      border: `1px solid ${r.c}44`, background: `${r.c}14`,
      fontFamily: ZT.mono, fontSize: big ? 12 : 11, fontWeight: 600,
      letterSpacing: '0.04em', color: r.c, whiteSpace: 'nowrap',
    }}>
      <Icon name={r.glyph} size={big ? 13 : 12} /> {r.label}
    </span>
  );
};

// ---- ZtMeter — bar bez glow ----------------------------------------------
const ZtMeter = ({ pct, color = ZT.accent, h = 4 }) => (
  <div style={{ height: h, borderRadius: h / 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
    <div style={{ width: pct + '%', height: '100%', borderRadius: h / 2, background: color, transition: 'width .4s' }}></div>
  </div>
);

// ---- ZtBtn — jediný button systém ----------------------------------------
// variant: primary | ghost | danger · size: sm | md · stavy: hover/focus/disabled/loading
const ZtBtn = ({ variant = 'ghost', size = 'md', icon, children, onClick, disabled = false, loading = false, color, style }) => {
  const [h, setH] = React.useState(false);
  const c = color || (variant === 'danger' ? ZT.bad : ZT.accent);
  const pad = size === 'sm' ? '6px 12px' : '9px 16px';
  const fs = size === 'sm' ? 11.5 : 12.5;
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: pad,
    fontFamily: ZT.mono, fontSize: fs, fontWeight: 600, letterSpacing: '0.02em',
    borderRadius: ZT.rCtl, cursor: disabled || loading ? 'default' : 'pointer',
    transition: 'background .16s, border-color .16s, color .16s',
    opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
  };
  let look;
  if (variant === 'primary') {
    look = { color: ZT.bg, background: h && !disabled && !loading ? c : c + 'e6', border: `1px solid transparent` };
  } else if (variant === 'danger') {
    look = { color: h && !disabled ? ZT.ink : c, background: h && !disabled ? `${c}1a` : 'transparent', border: `1px solid ${c}55` };
  } else {
    look = { color: h && !disabled ? ZT.ink : ZT.ink2, background: h && !disabled ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${h && !disabled ? ZT.lineHi : ZT.line}` };
  }
  return (
    <button className="zt-focusable" disabled={disabled} onClick={loading ? undefined : onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...base, ...look, ...style }}>
      {loading
        ? <span className="zt-anim" style={{ width: 12, height: 12, border: `1.5px solid ${variant === 'primary' ? ZT.bg : c}44`, borderTopColor: variant === 'primary' ? ZT.bg : c, borderRadius: '50%', display: 'inline-block', animation: 'ztSpin .7s linear infinite' }}></span>
        : (icon ? <Icon name={icon} size={size === 'sm' ? 12 : 14} stroke={2} /> : null)}
      {children}
    </button>
  );
};

// ---- ZtHold — hold-to-confirm pro vysoké riziko (platba, mazání) ----------
const ZtHold = ({ color = ZT.wait, label = 'Podržet pro schválení', doneLabel = 'Schváleno', onConfirm, style }) => {
  const [p, setP] = React.useState(0);          // 0–100
  const [done, setDone] = React.useState(false);
  const raf = React.useRef(null);
  const t0 = React.useRef(0);
  const DUR = 900;
  const start = () => {
    if (done) return;
    t0.current = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0.current) / DUR);
      setP(k * 100);
      if (k >= 1) { setDone(true); onConfirm && onConfirm(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (done) return;
    cancelAnimationFrame(raf.current);
    setP(0);
  };
  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button className="zt-focusable"
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchEnd={stop}
      style={{
        position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 18px', borderRadius: ZT.rCtl, cursor: done ? 'default' : 'pointer',
        fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em',
        color: done ? ZT.bg : color, background: done ? ZT.ok : `${color}14`,
        border: `1px solid ${done ? ZT.ok : color + '66'}`, transition: 'background .2s, color .2s, border-color .2s',
        userSelect: 'none', WebkitUserSelect: 'none', ...style,
      }}>
      {!done && <span style={{ position: 'absolute', inset: 0, width: p + '%', background: `${color}2e`, transition: p === 0 ? 'width .25s' : 'none' }}></span>}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={14} stroke={2.4} /> {done ? doneLabel : label}
      </span>
    </button>
  );
};

// ---- ZtPanel — jediný povrch; live = závorky + život ----------------------
const ZtCorners = ({ color }) => {
  const c = { position: 'absolute', width: 10, height: 10, borderColor: color, borderStyle: 'solid', opacity: 0.55 };
  return (
    <React.Fragment>
      <span style={{ ...c, top: 6, left: 6, borderWidth: '1.5px 0 0 1.5px' }}></span>
      <span style={{ ...c, top: 6, right: 6, borderWidth: '1.5px 1.5px 0 0' }}></span>
      <span style={{ ...c, bottom: 6, left: 6, borderWidth: '0 0 1.5px 1.5px' }}></span>
      <span style={{ ...c, bottom: 6, right: 6, borderWidth: '0 1.5px 1.5px 0' }}></span>
    </React.Fragment>
  );
};

const ZtPanel = ({ children, title, right, live = false, liveColor, pad = 20, hi = false, style }) => (
  <div style={{
    position: 'relative', background: hi ? ZT.surfaceHi : ZT.surface,
    border: `1px solid ${hi ? ZT.lineHi : ZT.line}`, borderRadius: ZT.rPanel, padding: pad,
    boxShadow: hi ? '0 18px 50px rgba(0,0,0,0.45)' : 'none',
    ...style,
  }}>
    {live && <ZtCorners color={liveColor || ZT.run} />}
    {title && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <span style={T.label}>{title}</span>
        {right}
      </div>
    )}
    {children}
  </div>
);

// ---- ZtApproval — JEDNA approval karta pro rail / stránku / voice ---------
// Vždy odpovídá na: CO se schvaluje · ČÍM je to rizikové · JAKÝ má dopad.
// density: 'rail' (kompakt) | 'page' (s náhledem) | 'voice' (velké, na dálku)
const ZtApproval = ({ a, density = 'rail', preview = null, onDecide }) => {
  const [dec, setDec] = React.useState(null);
  const r = ZT_RISK[a.risk] || ZT_RISK.platba;
  const big = density === 'voice';
  const decide = (v) => { setDec(v); onDecide && onDecide(v); };
  const highRisk = a.risk === 'platba' || a.risk === 'mazani';

  return (
    <ZtPanel live={!dec} liveColor={ZT.wait} pad={density === 'page' ? 22 : 18}
      style={{ borderColor: dec ? ZT.line : `${ZT.wait}3d` }}>
      {/* 1 · stav + riziko */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: big ? 16 : 13 }}>
        <ZtDot state={dec ? (dec === 'ok' ? 'ok' : 'idle') : 'wait'} size={7} />
        <span style={{ ...T.label, color: dec ? (dec === 'ok' ? ZT.ok : ZT.ink3) : ZT.wait }}>
          {dec ? (dec === 'ok' ? 'Schváleno' : 'Zamítnuto') : 'Čeká na tebe'}
        </span>
        <span style={{ marginLeft: 'auto' }}><ZtRisk risk={a.risk} big={big} /></span>
      </div>

      {/* 2 · CO se schvaluje */}
      <div style={{ fontFamily: ZT.sans, fontSize: big ? 19 : density === 'page' ? 17 : 14.5, fontWeight: 600, lineHeight: 1.35, color: ZT.ink }}>
        <span style={{ fontFamily: ZT.mono, color: r.c, fontSize: '0.92em' }}>{a.actor}</span>
        <span style={{ color: ZT.ink2, fontWeight: 400 }}> chce </span>{a.action}
      </div>

      {/* 3 · DOPAD — částka / rozsah jako primární číslo */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: big ? 14 : 10, flexWrap: 'wrap' }}>
        <span style={{ ...T.num, fontSize: big ? 30 : 24, color: r.c, whiteSpace: 'nowrap' }}>{a.impact}</span>
        <span style={{ ...T.micro, fontSize: big ? 12.5 : 11 }}>{a.impactNote}</span>
      </div>

      {/* náhled přesné akce — jen page density */}
      {density === 'page' && preview && (
        <div style={{ marginTop: 16 }}>{preview}</div>
      )}
      {density !== 'page' && a.detailLink && !dec && (
        <div style={{ ...T.micro, marginTop: 10 }}>{a.detailLink} <span style={{ color: ZT.accent }}>→</span></div>
      )}

      {/* 4 · rozhodnutí */}
      {dec ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, padding: '9px 12px', borderRadius: ZT.rCtl, background: dec === 'ok' ? `${ZT.ok}10` : 'rgba(255,255,255,0.03)', border: `1px solid ${dec === 'ok' ? ZT.ok + '33' : ZT.line}` }}>
          <Icon name={dec === 'ok' ? 'check' : 'x'} size={14} style={{ color: dec === 'ok' ? ZT.ok : ZT.ink3 }} />
          <span style={{ ...T.bodySm, color: dec === 'ok' ? ZT.ok : ZT.ink3 }}>{dec === 'ok' ? 'Agent pokračuje' : 'Akce zrušena — žádná data nezměněna'}</span>
          <button onClick={() => decide(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', ...T.micro, color: ZT.ink3, padding: 0 }}>vrátit</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: density === 'rail' ? 'column' : 'row', gap: 9, marginTop: big ? 18 : 14 }}>
          {highRisk
            ? <ZtHold color={r.c} onConfirm={() => decide('ok')} style={{ flex: density === 'rail' ? 'none' : 1.4, width: density === 'rail' ? '100%' : 'auto' }} />
            : <ZtBtn variant="primary" icon="check" onClick={() => decide('ok')} style={{ flex: density === 'rail' ? 'none' : 1.4, width: density === 'rail' ? '100%' : 'auto' }}>Schválit</ZtBtn>}
          <ZtBtn variant="ghost" icon="x" onClick={() => decide('no')} style={{ flex: density === 'rail' ? 'none' : 1, width: density === 'rail' ? '100%' : 'auto' }}>Zamítnout</ZtBtn>
        </div>
      )}
    </ZtPanel>
  );
};

Object.assign(window, { ZT, ZT_RISK, ZT_STATE, T, ZtDot, ZtChip, ZtRisk, ZtMeter, ZtBtn, ZtHold, ZtPanel, ZtCorners, ZtApproval });

// ZIBBY velín — Voice-First Interface
const { useState: useStateV, useEffect: useEffectV, useRef: useRefV } = React;

// ---- CSS keyframes (injected once) -------------------------------------
const VOICE_CSS = `
@keyframes vOrbitCW   { to { transform: rotate(360deg); } }
@keyframes vOrbitCCW  { to { transform: rotate(-360deg); } }
@keyframes vBreath    { 0%,100%{transform:scale(.96);opacity:.55} 50%{transform:scale(1.02);opacity:.85} }
@keyframes vGlowIdle  { 0%,100%{box-shadow:0 0 38px rgba(91,141,239,.12),0 0 80px rgba(91,141,239,.06)} 50%{box-shadow:0 0 60px rgba(91,141,239,.26),0 0 120px rgba(91,141,239,.12)} }
@keyframes vGlowHot   { 0%,100%{box-shadow:0 0 60px rgba(91,141,239,.38),0 0 120px rgba(91,141,239,.18)} 50%{box-shadow:0 0 100px rgba(91,141,239,.62),0 0 200px rgba(91,141,239,.28)} }
@keyframes vRipple    { 0%{transform:scale(1);opacity:.28} 100%{transform:scale(2.0);opacity:0} }
@keyframes vBarA      { 0%,100%{height:5px}  40%{height:30px} }
@keyframes vBarB      { 0%,100%{height:22px} 50%{height:6px}  }
@keyframes vBarC      { 0%,100%{height:14px} 33%{height:36px} 66%{height:8px}  }
@keyframes vBarD      { 0%,100%{height:8px}  60%{height:26px} }
@keyframes vBarE      { 0%,100%{height:18px} 25%{height:8px}  75%{height:32px} }
@keyframes vFadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes vThinkSpin { 0%{stroke-dashoffset:220} 100%{stroke-dashoffset:0} }
@keyframes vModeIn    { from{opacity:0;transform:scale(.985)} to{opacity:1;transform:scale(1)} }
@keyframes vDotBlink  { 0%,80%,100%{opacity:.25} 40%{opacity:1} }
`;

const STATE_LABEL = {
  idle:      'Čekám na tvůj příkaz…',
  listening: 'Poslouchám…',
  thinking:  'Přemýšlím…',
  speaking:  'ZIBBY odpovídá…',
};

const BAR_ANIMS = [
  'vBarA','vBarB','vBarC','vBarD','vBarE','vBarC','vBarA','vBarD',
  'vBarB','vBarE','vBarA','vBarC','vBarD','vBarB','vBarE','vBarA',
  'vBarC','vBarD','vBarB','vBarA',
];
const NUM_BARS = 20;

const DEMO_MSGS = [
  { role: 'user',  text: 'Připrav mi dnešní standup' },
  { role: 'zibby', text: 'Hotovo. 3 PR od včera, 1 opravený flaky test v auth-svc. Standup uložen do work/daily/2026-06-09.md.' },
  { role: 'user',  text: 'Spusť Build Feature pipeline pro auth-svc' },
  { role: 'zibby', text: 'Pipeline spuštěna. Architekt pracuje na design.md — odhadovaný čas dokončení 8 minut. Sleduj průběh v Orchestraci.' },
];

// ---- VoiceOrb -----------------------------------------------------------
function VoiceOrb({ state, accent }) {
  const S = 264, cx = 132;
  const isActive   = state !== 'idle';
  const isThinking = state === 'thinking';
  const isWave     = state === 'listening' || state === 'speaking';

  return (
    <div style={{ position: 'relative', width: S, height: S }}>
      {/* Ripple rings */}
      {isActive && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', borderRadius: '50%',
          border: `1px solid ${accent}`,
          inset: -(28 + i * 30),
          opacity: 0, pointerEvents: 'none',
          animation: `vRipple 2.8s ease-out ${i * 0.92}s infinite`,
        }} />
      ))}

      {/* SVG orbital rings */}
      <svg
        height={S}
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }} viewBox={`0 0 ${S} ${S}`} width={S}
      >
        {/* outer dashed orbit */}
        <circle
          cx={cx} cy={cx} fill="none"
          opacity={isActive ? 0.5 : 0.22} r={cx - 6}
          stroke={accent}
          strokeDasharray="3 13" strokeWidth="1"
          style={{
            transformOrigin: `${cx}px ${cx}px`,
            animation: `vOrbitCW ${isThinking ? '3.2s' : '20s'} linear infinite`,
          }}
        />
        {/* second dashed orbit (counter, small) */}
        <circle
          cx={cx} cy={cx} fill="none"
          opacity={isActive ? 0.35 : 0.12} r={cx - 22}
          stroke={accent}
          strokeDasharray="2 18" strokeWidth="0.8"
          style={{
            transformOrigin: `${cx}px ${cx}px`,
            animation: `vOrbitCCW ${isThinking ? '4s' : '28s'} linear infinite`,
          }}
        />
        {/* inner arc (partial, fast) */}
        <path
          d={`M ${cx} ${cx - (cx - 40)} A ${cx - 40} ${cx - 40} 0 0 1 ${cx + (cx - 40)} ${cx}`}
          fill="none" opacity={isActive ? 0.72 : 0.38} stroke={accent}
          strokeWidth={isActive ? '2' : '1.2'}
          style={{
            transformOrigin: `${cx}px ${cx}px`,
            animation: `vOrbitCCW ${isThinking ? '2.2s' : '13s'} linear infinite`,
          }}
        />
        {/* thinking progress arc */}
        {isThinking && (
          <circle
            cx={cx} cy={cx} fill="none"
            opacity="0.85" r={cx - 56} stroke={accent}
            strokeDasharray="220" strokeDashoffset="220"
            strokeWidth="2.5"
            style={{
              transformOrigin: `${cx}px ${cx}px`,
              transform: 'rotate(-90deg)',
              animation: 'vThinkSpin 2.4s ease-in-out infinite alternate',
            }}
          />
        )}
        {/* tick marks on outer orbit */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const r0 = cx - 6, r1 = cx - 14;
          const rad = (deg - 90) * Math.PI / 180;
          return (
            <line key={i}
              opacity={isActive ? 0.5 : 0.18} stroke={accent}
              strokeWidth="1" x1={cx + Math.cos(rad) * r0}
              x2={cx + Math.cos(rad) * r1} y1={cx + Math.sin(rad) * r0}
              y2={cx + Math.sin(rad) * r1}
            />
          );
        })}
      </svg>

      {/* Core orb */}
      <div style={{
        position: 'absolute', inset: 34, borderRadius: '50%',
        background: `radial-gradient(circle at 38% 32%, #121d32, ${Z.bg0} 75%)`,
        border: `1.5px solid ${accent}${isActive ? '55' : '22'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.4s',
        animation: isActive
          ? 'vGlowHot 1.5s ease-in-out infinite'
          : 'vBreath 3.8s ease-in-out infinite, vGlowIdle 3.8s ease-in-out infinite',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <ZibbyMark color={accent} size={38} />
          <Mono style={{ fontSize: 8, letterSpacing: '0.28em', color: accent, opacity: isActive ? 0.9 : 0.5 }}>
            Z·I·B·B·Y
          </Mono>
        </div>
      </div>

      {/* Waveform bars */}
      {isWave && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(NUM_BARS)].map((_, i) => {
            const angle    = (i / NUM_BARS) * 360 - 90;
            const rad      = (angle * Math.PI) / 180;
            const dist     = 118;
            const bx       = cx + Math.cos(rad) * dist;
            const by       = cx + Math.sin(rad) * dist;
            const aDur     = (0.36 + (i % 5) * 0.09).toFixed(2) + 's';
            const aDelay   = (-(i / NUM_BARS) * 1.1).toFixed(2) + 's';
            return (
              <div key={i} style={{
                position: 'absolute',
                width: 3, height: 10,
                background: accent,
                borderRadius: 2,
                left: bx - 1.5, top: by - 5,
                transformOrigin: '50% 50%',
                transform: `rotate(${angle + 90}deg)`,
                animation: `${BAR_ANIMS[i]} ${aDur} ease-in-out ${aDelay}s infinite`,
                opacity: 0.68,
              }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- VoicePanel (ambient corner card) -----------------------------------
function VoicePanel({ title, icon, children, style }) {
  return (
    <div style={{
      background: 'rgba(9,11,15,0.84)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${Z.lineHi}`,
      borderRadius: 4, padding: '11px 13px',
      minWidth: 192, maxWidth: 228,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
        <Icon name={icon} size={12} style={{ color: Z.inkFaint }} />
        <Mono style={{ fontSize: 8.5, letterSpacing: '0.2em', color: Z.inkFaint, textTransform: 'uppercase' }}>
          {title}
        </Mono>
      </div>
      {children}
    </div>
  );
}

// ---- VoiceTranscript ----------------------------------------------------
function VoiceTranscript({ messages, accent }) {
  const shown = messages.slice(-3);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 7,
      maxWidth: 540, textAlign: 'center', minHeight: 52,
    }}>
      {shown.map((m, i) => {
        const isLatest = i === shown.length - 1;
        return (
          <div key={i} style={{
            fontSize: m.role === 'zibby' ? 13.5 : 12,
            color: m.role === 'zibby' ? Z.ink : Z.inkDim,
            lineHeight: 1.56,
            opacity: 0.28 + (i + 1) / shown.length * 0.72,
            animation: isLatest ? 'vFadeUp 0.4s ease-out' : 'none',
          }}>
            <Mono style={{
              fontSize: 9, color: m.role === 'zibby' ? accent : Z.inkFaint,
              marginRight: 8, letterSpacing: '0.12em',
            }}>
              {m.role === 'zibby' ? 'ZIBBY' : 'TY'}
            </Mono>
            {m.text}
          </div>
        );
      })}
    </div>
  );
}

// ---- VoiceScreen --------------------------------------------------------
function VoiceScreen({ accent, onExit }) {
  const [state, setVoiceState] = useStateV('idle');
  const [messages, setMessages] = useStateV(DEMO_MSGS.slice(0, 2));
  const timerRef = useRefV(null);

  // Inject CSS once
  useEffectV(() => {
    const id = 'zibby-voice-css';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = VOICE_CSS;
      document.head.appendChild(el);
    }
  }, []);

  // Keyboard: Escape to exit voice
  useEffectV(() => {
    const handler = (e) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onExit]);

  // Demo cycle: listening → thinking → speaking → idle
  const handleMic = () => {
    if (state !== 'idle') {
      clearTimeout(timerRef.current);
      setVoiceState('idle');
      return;
    }
    const seq = [
      { s: 'listening', ms: 2200 },
      { s: 'thinking',  ms: 2600 },
      { s: 'speaking',  ms: 3000, cb: () => setMessages(DEMO_MSGS) },
      { s: 'idle',      ms: 0 },
    ];
    let idx = 0;
    const step = () => {
      const { s, ms, cb } = seq[idx];
      setVoiceState(s);
      if (cb) cb();
      idx++;
      if (idx < seq.length) timerRef.current = setTimeout(step, ms);
    };
    step();
  };

  useEffectV(() => () => clearTimeout(timerRef.current), []);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const isActive = state !== 'idle';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(ellipse 100% 85% at 50% 48%, #0b1422 0%, ${Z.bg0} 62%)`,
      fontFamily: Z.sans,
      animation: 'vModeIn 0.42s cubic-bezier(.22,.68,0,1.2)',
    }}>
      {/* Scanlines overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.011) 0px,rgba(255,255,255,0.011) 1px,transparent 1px,transparent 5px)',
      }} />

      {/* Grid overlay (faint, top half) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.18,
        backgroundImage: `linear-gradient(${Z.line} 1px,transparent 1px),linear-gradient(90deg,${Z.line} 1px,transparent 1px)`,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%,#000 10%,transparent 80%)',
      }} />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 22px', borderBottom: `1px solid ${Z.line}`,
        flexShrink: 0, position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ZibbyMark color={accent} size={18} />
          <Mono style={{ fontSize: 10.5, color: accent, letterSpacing: '0.22em' }}>VOICE MODE</Mono>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            marginLeft: 4,
            background: isActive ? Z.ok : accent,
            boxShadow: `0 0 8px ${isActive ? Z.ok : accent}`,
            transition: 'background 0.4s, box-shadow 0.4s',
          }} />
        </div>

        <Mono style={{ fontSize: 15, color: Z.ink, fontWeight: 600 }}>{timeStr}</Mono>

        <button onClick={onExit} onMouseEnter={e => { e.currentTarget.style.color = Z.ink; e.currentTarget.style.borderColor = accent; }}
          onMouseLeave={e => { e.currentTarget.style.color = Z.inkDim; e.currentTarget.style.borderColor = Z.line; }}
          style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 14px', cursor: 'pointer',
          background: 'transparent', border: `1px solid ${Z.line}`,
          borderRadius: 3, color: Z.inkDim,
          fontFamily: Z.mono, fontSize: 11,
          transition: 'all .15s',
        }}
        >
          <Icon name="grid" size={13} /> HUD
        </button>
      </div>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>

        {/* TL — Active agents */}
        <div style={{ position: 'absolute', top: 18, left: 20 }}>
          <VoicePanel icon="bot" title="Aktivní agenti">
            {RUNNING_AGENTS.length > 0 ? RUNNING_AGENTS.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <Dot pulse color={Z.run} size={5} />
                <Mono style={{ fontSize: 10.5, color: Z.ink, flex: 1 }}>{a.skill}</Mono>
                <div style={{ width: 40, height: 2, background: Z.line, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${a.pct}%`, height: '100%', background: accent }} />
                </div>
                <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{a.pct}%</Mono>
              </div>
            )) : (
              <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>Žádní agenti nespuštěni</Mono>
            )}
          </VoicePanel>
        </div>

        {/* TR — Pending approvals */}
        <div style={{ position: 'absolute', top: 18, right: 20 }}>
          <VoicePanel icon="shield" title="Čekají na schválení">
            {APPROVALS.map(a => (
              <div key={a.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                    background: Z.warn, boxShadow: `0 0 6px ${Z.warn}`,
                  }} />
                  <Mono style={{ fontSize: 11, color: Z.ink }}>{a.skill}</Mono>
                </div>
                <div style={{ fontSize: 11, color: Z.inkDim, marginTop: 2, paddingLeft: 12, lineHeight: 1.4 }}>
                  {a.detail}
                </div>
              </div>
            ))}
          </VoicePanel>
        </div>

        {/* BL — Recent activity */}
        <div style={{ position: 'absolute', bottom: 18, left: 20 }}>
          <VoicePanel icon="pulse" title="Nedávná aktivita">
            {ACTIVITY.slice(0, 3).map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 7 }}>
                <div style={{ marginTop: 3 }}>
                  <Dot color={e.icon === 'ok' ? Z.ok : e.icon === 'wait' ? Z.warn : Z.run} size={5} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: Z.ink }}>{e.text}</div>
                  <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{e.t}</Mono>
                </div>
              </div>
            ))}
          </VoicePanel>
        </div>

        {/* BR — Quick actions */}
        <div style={{ position: 'absolute', bottom: 18, right: 20 }}>
          <VoicePanel icon="spark" title="Rychlé akce">
            {FAV_SKILLS_WORK.slice(0, 3).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <Icon name={s.glyph} size={12} style={{ color: accent }} />
                <Mono style={{ fontSize: 11, color: Z.ink, flex: 1 }}>{s.name}</Mono>
                <Mono style={{
                  fontSize: 9, color: Z.inkFaint, padding: '1px 5px',
                  border: `1px solid ${Z.line}`, borderRadius: 2,
                }}>⊕</Mono>
              </div>
            ))}
          </VoicePanel>
        </div>

        {/* ── Center column ────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
          <VoiceTranscript accent={accent} messages={messages} />
          <VoiceOrb accent={accent} state={state} />

          {/* Status */}
          <div style={{ textAlign: 'center', minHeight: 46 }}>
            <div style={{
              fontSize: 15.5,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? Z.ink : Z.inkFaint,
              letterSpacing: '0.01em',
              transition: 'color 0.4s',
            }}>
              {STATE_LABEL[state]}
            </div>
            {state === 'thinking' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: accent, display: 'inline-block',
                    animation: `vDotBlink 1.2s ease-in-out ${i * 0.22}s infinite`,
                  }} />
                ))}
              </div>
            )}
            {state === 'listening' && (
              <Mono style={{
                fontSize: 10, color: accent, letterSpacing: '0.14em',
                marginTop: 6, display: 'block',
                animation: 'vFadeUp 0.3s ease-out',
              }}>
                // mluvte nyní
              </Mono>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom controls ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '15px 24px', borderTop: `1px solid ${Z.line}`,
        flexShrink: 0, position: 'relative', zIndex: 2,
      }}>
        {/* Mic toggle */}
        <button onClick={handleMic} style={{
          width: 56, height: 56, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive ? accent : 'rgba(91,141,239,0.10)',
          border: `1.5px solid ${accent}`,
          color: isActive ? Z.bg0 : accent,
          boxShadow: isActive ? `0 0 30px ${accent}60, 0 0 60px ${accent}22` : 'none',
          transition: 'all 0.28s cubic-bezier(.22,.68,0,1.2)',
        }} title={isActive ? 'Zastavit (klikni)' : 'Spustit demo (klikni)'}>
          <svg fill="none" height={22} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={22}>
            <rect height="12" rx="3" width="6" x="9" y="2" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
            <path d="M12 19v3M8 22h8" />
          </svg>
        </button>

        {/* Speaker */}
        <button onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = Z.line; e.currentTarget.style.color = Z.inkDim; }}
          style={{
          width: 38, height: 38, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkDim,
          transition: 'all 0.18s',
        }}
          title="Hlasitost"
        >
          <svg fill="none" height={16} stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24" width={16}>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </button>

        <Mono style={{ fontSize: 10, color: Z.inkFaint, letterSpacing: '0.08em' }}>
          klikni mikrofon pro demo · Esc pro HUD
        </Mono>
      </div>
    </div>
  );
}

Object.assign(window, { VoiceScreen });

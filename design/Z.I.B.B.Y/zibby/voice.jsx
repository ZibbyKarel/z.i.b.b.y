// ZIBBY velín — Voice UI (redesign). Stavy se liší TVAREM pohybu, ne rychlostí:
// idle / listening (prstence dovnitř + živý přepis) / thinking (určitý oblouk) /
// speaking (prstence ven) / error (statický přerušený kruh + retry/únik).
// Klidová scéna: jeden kontextový souhrn místo 4 rohových panelů.
const { useState: useStateV, useEffect: useEffectV, useRef: useRefV } = React;

const ZtMicIcon = ({ size = 21 }) => (
  <svg fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>
    <rect height="12" rx="3" width="6" x="9" y="2"></rect>
    <path d="M5 10v2a7 7 0 0 0 14 0v-2"></path>
    <path d="M12 19v3M8 22h8"></path>
  </svg>
);

// ---- ZtOrb — 5 stavů odlišených tvarem pohybu ----------------------------
const ZtOrb = ({ state = 'idle', size = 248 }) => {
  const cx = size / 2;
  const col = state === 'error' ? ZT.bad : ZT.accent;
  const coreInset = Math.round(size * 0.16);
  return (
    <div className="zt-anim" style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      {/* listening — prstence se stahují DOVNITŘ (nasávám) */}
      {state === 'listening' && [0, 1].map((i) => (
        <div key={i} style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `1.5px solid ${col}`, opacity: 0, animation: `ztRingIn 1.6s ease-out ${i * 0.8}s infinite`, pointerEvents: 'none' }}></div>
      ))}
      {/* speaking — prstence jdou VEN (vysílám) */}
      {state === 'speaking' && [0, 1].map((i) => (
        <div key={i} style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: `1.5px solid ${col}`, opacity: 0, animation: `ztRingOut 1.8s ease-out ${i * 0.9}s infinite`, pointerEvents: 'none' }}></div>
      ))}
      <svg height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} viewBox={`0 0 ${size} ${size}`} width={size}>
        {state !== 'error' && (
          <circle cx={cx} cy={cx} fill="none" opacity={state === 'idle' ? 0.18 : 0.4} r={cx - 3} stroke={col}
            strokeDasharray="2 10" strokeWidth="1"
            style={{ transformOrigin: `${cx}px ${cx}px`, animation: 'ztSpin 26s linear infinite' }} />
        )}
        {state === 'thinking' && (
          <circle cx={cx} cy={cx} fill="none" opacity="0.9" r={cx - 12} stroke={col}
            strokeDasharray={`${(cx - 12) * 1.2} ${(cx - 12) * 6}`} strokeLinecap="round" strokeWidth="2.5"
            style={{ transformOrigin: `${cx}px ${cx}px`, animation: 'ztSpin 1.4s linear infinite' }} />
        )}
        {state === 'error' && (
          <circle cx={cx} cy={cx} fill="none" opacity="0.55" r={cx - 3} stroke={col}
            strokeDasharray="26 14" strokeWidth="1.5" />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: coreInset, borderRadius: '50%',
        background: `radial-gradient(circle at 38% 32%, #121a28, #0a0e15 75%)`,
        border: `1.5px solid ${col}${state === 'idle' ? '26' : state === 'error' ? '88' : '66'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: state === 'listening' || state === 'speaking' ? `0 0 44px ${col}30` : 'none',
        animation: state === 'idle' ? 'ztBreath 4.2s ease-in-out infinite' : 'none',
        transition: 'border-color .24s, box-shadow .24s',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.max(4, size * 0.025) }}>
          <ZibbyMark color={col} size={Math.round(size * 0.15)} />
          <span style={{ fontFamily: ZT.mono, fontSize: Math.max(8, size * 0.034), letterSpacing: '0.30em', color: col, opacity: state === 'idle' ? 0.45 : 0.9 }}>Z·I·B·B·Y</span>
        </div>
      </div>
    </div>
  );
};

const ZT_VOICE = {
  idle:      { label: 'Čekám.',            sub: 'klepni na mikrofon nebo řekni „Zibby“' },
  listening: { label: 'Poslouchám…',       sub: null },
  thinking:  { label: 'Zpracovávám…',      sub: null },
  speaking:  { label: 'ZIBBY odpovídá',    sub: null },
  error:     { label: 'Neslyšel jsem tě.', sub: '12 s ticho — mikrofon běží, ale nic nepřišlo' },
};

const HEARD_FULL = 'Spusť Build Feature pipeline pro auth-svc';

// ---- VoiceScreen ---------------------------------------------------------
function VoiceScreen({ accent, onExit }) {
  const [state, setState] = useStateV('idle');
  const [heard, setHeard] = useStateV('');
  const timer = useRefV(null);
  const clearAll = () => clearTimeout(timer.current);

  // Esc → zpět do HUD
  useEffectV(() => {
    const h = (e) => { if (e.key === 'Escape') onExit && onExit(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onExit]);
  useEffectV(() => () => clearAll(), []);

  const runDemo = () => {
    clearAll();
    if (state !== 'idle') { setState('idle'); setHeard(''); return; }
    setState('listening');
    let i = 0;
    const type = () => {
      i += 3 + Math.floor(Math.random() * 3);
      setHeard(HEARD_FULL.slice(0, i));
      if (i < HEARD_FULL.length) timer.current = setTimeout(type, 70);
      else timer.current = setTimeout(() => {
        setState('thinking');
        timer.current = setTimeout(() => {
          setState('speaking');
          timer.current = setTimeout(() => { setState('idle'); setHeard(''); }, 3000);
        }, 2200);
      }, 500);
    };
    timer.current = setTimeout(type, 350);
  };

  const v = ZT_VOICE[state];
  const active = state !== 'idle' && state !== 'error';
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const runCount = RUNNING_AGENTS.length;
  const waitCount = APPROVAL_QUEUE.length;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: ZT.sans, color: ZT.ink,
      background: `radial-gradient(ellipse 95% 80% at 50% 46%, #0d1521 0%, ${ZT.bg} 64%)`,
    }}>
      {/* top bar — jeden kontextový souhrn místo 4 rohových panelů */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${ZT.line}`, flexShrink: 0 }}>
        <ZibbyMark color={ZT.accent} size={17} />
        <span style={{ ...T.label, color: ZT.accent }}>Voice</span>
        <ZtChip state={state === 'error' ? 'bad' : active ? 'run' : 'idle'}>
          {state === 'error' ? 'chyba' : active ? 'aktivní' : 'klid'}
        </ZtChip>
        <span style={{ ...T.micro, marginLeft: 14 }}>
          <span style={{ color: ZT.run }}>{runCount} běží</span> · <span style={{ color: ZT.wait }}>{waitCount} čeká na schválení</span>
        </span>
        <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 13, fontWeight: 600, color: ZT.ink }}>{timeStr}</span>
        <ZtBtn icon="grid" onClick={onExit} size="sm">HUD · Esc</ZtBtn>
      </div>

      {/* střed */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, position: 'relative' }}>
        {/* transcript — poslední 3 + odkaz na plnou historii */}
        <div style={{ maxWidth: 560, textAlign: 'center', minHeight: 110, display: 'flex', flexDirection: 'column', gap: 11, justifyContent: 'flex-end' }}>
          <div style={{ ...T.bodySm, lineHeight: 1.5, opacity: 0.45 }}>
            <span style={{ ...T.micro, fontSize: 10, color: ZT.ink3, marginRight: 8 }}>TY</span>
            Připrav mi dnešní standup
          </div>
          <div style={{ ...T.body, fontSize: 14.5, lineHeight: 1.5, opacity: 0.8 }}>
            <span style={{ ...T.micro, fontSize: 10, color: ZT.accent, marginRight: 8 }}>ZIBBY</span>
            Hotovo. 3 PR od včera, 1 opravený flaky test. Standup je v work/daily.
          </div>
          <div style={{ ...T.micro, marginTop: 2 }}>celý přepis v logu běhu <span style={{ color: ZT.accent }}>→</span></div>
        </div>

        <ZtOrb size={248} state={state} />

        {/* stavový řádek — čitelný z dálky, min 16 px */}
        <div style={{ textAlign: 'center', minHeight: 92 }}>
          <div style={{ fontFamily: ZT.sans, fontSize: 17, fontWeight: 500, color: state === 'error' ? ZT.bad : active ? ZT.ink : ZT.ink3, transition: 'color .24s' }}>
            {v.label}
          </div>
          {state === 'listening' && (
            <div className="zt-anim" style={{ ...T.body, fontSize: 15, color: ZT.ink, marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              „{heard}<span style={{ animation: 'ztCaret 0.9s step-end infinite', color: ZT.accent }}>▌</span>“
            </div>
          )}
          {state === 'thinking' && (
            <div className="zt-anim" style={{ marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              <div style={{ ...T.bodySm }}>„{HEARD_FULL}“</div>
              <div style={{ ...T.micro, marginTop: 6 }}>hledám pipeline · ověřuji approval pravidla</div>
            </div>
          )}
          {state === 'speaking' && (
            <div className="zt-anim" style={{ ...T.bodySm, marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              Pipeline spuštěna — Architekt začíná na design.md.
            </div>
          )}
          {state === 'error' && (
            <div className="zt-anim" style={{ marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              <div style={{ ...T.bodySm }}>{v.sub}</div>
              <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 14 }}>
                <ZtBtn icon="retry" onClick={() => { clearAll(); setState('idle'); setHeard(''); }} size="sm" variant="primary">Zkusit znovu</ZtBtn>
                <ZtBtn icon="grid" onClick={onExit} size="sm">Přejít do HUD</ZtBtn>
              </div>
            </div>
          )}
          {state === 'idle' && <div style={{ ...T.micro, marginTop: 9 }}>{v.sub}</div>}
        </div>
      </div>

      {/* ovládání */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '16px 24px 22px', flexShrink: 0, position: 'relative' }}>
        <button className="zt-focusable" onClick={runDemo} style={{
          width: 56, height: 56, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? ZT.accent : state === 'error' ? `${ZT.bad}14` : ZT.accentDim,
          border: `1.5px solid ${state === 'error' ? ZT.bad : ZT.accent}`,
          color: active ? ZT.bg : state === 'error' ? ZT.bad : ZT.accent,
          boxShadow: active ? `0 0 26px ${ZT.accent}44` : 'none',
          transition: 'all .24s ease-out',
        }} title={active ? 'Zastavit' : 'Spustit demo'}>
          <ZtMicIcon size={22} />
        </button>
        <button onClick={() => { clearAll(); setState('error'); setHeard(''); }} style={{ position: 'absolute', right: 24, background: 'none', border: 'none', cursor: 'pointer', ...T.micro, padding: 0 }}>
          simulovat chybu
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { VoiceScreen, ZtOrb, ZT_VOICE });

// ZIBBY redesign — VoiceAfter: hlasová plocha se zřetelnými stavy
// idle / listening / thinking / speaking / error — každý se liší tvarem pohybu, ne jen rychlostí

// ---- ZtOrb -----------------------------------------------------------------
const ZtOrb = ({ state = 'idle', size = 240 }) => {
  const cx = size / 2;
  const col = state === 'error' ? ZT.bad : ZT.accent;
  const coreInset = Math.round(size * 0.16);

  return (
    <div className="zt-anim" style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      {/* listening — prstence se stahují DOVNITŘ (nasávám) */}
      {state === 'listening' && [0, 1].map((i) => (
        <div key={i} style={{
          position: 'absolute', inset: -6, borderRadius: '50%', border: `1.5px solid ${col}`,
          opacity: 0, animation: `ztRingIn 1.6s ease-out ${i * 0.8}s infinite`, pointerEvents: 'none',
        }}></div>
      ))}
      {/* speaking — prstence jdou VEN (vysílám) */}
      {state === 'speaking' && [0, 1].map((i) => (
        <div key={i} style={{
          position: 'absolute', inset: 6, borderRadius: '50%', border: `1.5px solid ${col}`,
          opacity: 0, animation: `ztRingOut 1.8s ease-out ${i * 0.9}s infinite`, pointerEvents: 'none',
        }}></div>
      ))}

      <svg height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} viewBox={`0 0 ${size} ${size}`} width={size}>
        {/* klidová orbita — jen idle a aktivní stavy, ne error */}
        {state !== 'error' && (
          <circle cx={cx} cy={cx} fill="none" opacity={state === 'idle' ? 0.18 : 0.4} r={cx - 3} stroke={col}
            strokeDasharray="2 10" strokeWidth="1"
            style={{ transformOrigin: `${cx}px ${cx}px`, animation: 'ztSpin 26s linear infinite' }} />
        )}
        {/* thinking — určitý rotující oblouk (práce, ne nejistota) */}
        {state === 'thinking' && (
          <circle cx={cx} cy={cx} fill="none" opacity="0.9" r={cx - 12} stroke={col}
            strokeDasharray={`${(cx - 12) * 1.2} ${(cx - 12) * 6}`} strokeLinecap="round" strokeWidth="2.5"
            style={{ transformOrigin: `${cx}px ${cx}px`, animation: 'ztSpin 1.4s linear infinite' }} />
        )}
        {/* error — přerušený statický kruh */}
        {state === 'error' && (
          <circle cx={cx} cy={cx} fill="none" opacity="0.55" r={cx - 3} stroke={col}
            strokeDasharray="26 14" strokeWidth="1.5" />
        )}
      </svg>

      {/* jádro */}
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

// ---- stavové texty ----------------------------------------------------------
const ZT_VOICE = {
  idle:      { label: 'Čekám.',                     sub: 'klepni na mikrofon nebo řekni „Zibby“' },
  listening: { label: 'Poslouchám…',                sub: null },
  thinking:  { label: 'Zpracovávám…',               sub: null },
  speaking:  { label: 'ZIBBY odpovídá',             sub: null },
  error:     { label: 'Neslyšel jsem tě.',          sub: '12 s ticho — mikrofon běží, ale nic nepřišlo' },
};

// ---- VoiceAfter ---------------------------------------------------------------
const VoiceAfter = ({ initial = 'idle', demo = true }) => {
  const [state, setState] = React.useState(initial);
  const [heard, setHeard] = React.useState('');
  const timer = React.useRef(null);
  const HEARD_FULL = 'Spusť Build Feature pipeline pro auth-svc';

  const clearAll = () => { clearTimeout(timer.current); };

  const runDemo = () => {
    clearAll();
    if (state !== 'idle') { setState('idle'); setHeard(''); return; }
    setState('listening');
    // postupný „live" přepis — potvrzení, že slyším
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
  React.useEffect(() => () => clearAll(), []);

  const v = ZT_VOICE[state];
  const active = state !== 'idle' && state !== 'error';

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: ZT.sans, color: ZT.ink,
      background: `radial-gradient(ellipse 95% 80% at 50% 46%, #0d1521 0%, ${ZT.bg} 64%)`,
    }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 22px', borderBottom: `1px solid ${ZT.line}`, flexShrink: 0 }}>
        <ZibbyMark color={ZT.accent} size={17} />
        <span style={{ ...T.label, color: ZT.accent }}>Voice</span>
        <ZtChip state={state === 'error' ? 'bad' : active ? 'run' : 'idle'}>
          {state === 'error' ? 'chyba' : active ? 'aktivní' : 'klid'}
        </ZtChip>
        {/* jediný kontextový souhrn místo 4 rohových panelů */}
        <span style={{ ...T.micro, marginLeft: 14 }}>
          <span style={{ color: ZT.run }}>2 běží</span> · <span style={{ color: ZT.wait }}>1 čeká na schválení</span>
        </span>
        <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 13, fontWeight: 600, color: ZT.ink }}>07:42</span>
        <ZtBtn icon="grid" size="sm">HUD · Esc</ZtBtn>
      </div>

      {/* střed */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, position: 'relative' }}>

        {/* transcript — poslední 3 + odkaz na plnou historii */}
        <div style={{ maxWidth: 560, textAlign: 'center', minHeight: 92, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
          <div style={{ ...T.bodySm, opacity: 0.45 }}>
            <span style={{ ...T.micro, fontSize: 10, color: ZT.ink3, marginRight: 8 }}>TY</span>
            Připrav mi dnešní standup
          </div>
          <div style={{ ...T.body, fontSize: 14.5, opacity: 0.8 }}>
            <span style={{ ...T.micro, fontSize: 10, color: ZT.accent, marginRight: 8 }}>ZIBBY</span>
            Hotovo. 3 PR od včera, 1 opravený flaky test. Standup je v work/daily.
          </div>
          <div style={{ ...T.micro, marginTop: 4 }}>celý přepis v logu běhu <span style={{ color: ZT.accent }}>→</span></div>
        </div>

        <ZtOrb size={240} state={state} />

        {/* stavový řádek — čitelný z dálky, min 16 px */}
        <div style={{ textAlign: 'center', minHeight: 84 }}>
          <div style={{ fontFamily: ZT.sans, fontSize: 17, fontWeight: 500, color: state === 'error' ? ZT.bad : active ? ZT.ink : ZT.ink3, transition: 'color .24s' }}>
            {v.label}
          </div>

          {/* listening → živý přepis = potvrzení „slyším tě" */}
          {state === 'listening' && (
            <div className="zt-anim" style={{ ...T.body, fontSize: 15, color: ZT.ink, marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              „{heard}<span style={{ animation: 'ztCaret 0.9s step-end infinite', color: ZT.accent }}>▌</span>“
            </div>
          )}
          {/* thinking → potvrzený příkaz, žádná nejistota co se děje */}
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
          {/* error → co se stalo + co teď */}
          {state === 'error' && (
            <div className="zt-anim" style={{ marginTop: 10, animation: 'ztFadeUp .25s ease-out' }}>
              <div style={{ ...T.bodySm }}>{v.sub}</div>
              <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 14 }}>
                <ZtBtn icon="retry" onClick={() => { setState('idle'); setHeard(''); }} size="sm" variant="primary">Zkusit znovu</ZtBtn>
                <ZtBtn icon="grid" size="sm">Přejít do HUD</ZtBtn>
              </div>
            </div>
          )}
          {state === 'idle' && <div style={{ ...T.micro, marginTop: 9 }}>{v.sub}</div>}
        </div>
      </div>

      {/* ovládání */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '16px 24px 20px', flexShrink: 0 }}>
        <button className="zt-focusable" onClick={demo ? runDemo : undefined} style={{
          width: 54, height: 54, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? ZT.accent : state === 'error' ? `${ZT.bad}14` : ZT.accentDim,
          border: `1.5px solid ${state === 'error' ? ZT.bad : ZT.accent}`,
          color: active ? ZT.bg : state === 'error' ? ZT.bad : ZT.accent,
          boxShadow: active ? `0 0 26px ${ZT.accent}44` : 'none',
          transition: 'all .24s ease-out',
        }} title="Mikrofon">
          <ZtMicIcon size={21} />
        </button>
        {demo && (
          <button onClick={() => { clearAll(); setState('error'); setHeard(''); }} style={{ position: 'absolute', right: 22, background: 'none', border: 'none', cursor: 'pointer', ...T.micro, padding: 0 }}>
            simulovat chybu
          </button>
        )}
      </div>
    </div>
  );
};

// ---- řada stavů orbu (specimen board) ----------------------------------------
const OrbStatesBoard = () => {
  const states = [
    { s: 'idle',      n: 'Idle',      d: 'matný · pomalý dech 4 s · jediný pohyb bez příčiny' },
    { s: 'listening', n: 'Listening', d: 'prstence se stahují dovnitř + živý přepis pod orbem' },
    { s: 'thinking',  n: 'Thinking',  d: 'určitý rotující oblouk · stav říká, co se právě dělá' },
    { s: 'speaking',  n: 'Speaking',  d: 'prstence jdou ven — vysílám; jasně odlišné od listening' },
    { s: 'error',     n: 'Error',     d: 'statický přerušený kruh · červená · retry + únik do HUD' },
  ];
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: ZT.bg, fontFamily: ZT.sans }}>
      {states.map((x, i) => (
        <div key={x.s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '28px 16px', borderRight: i < 4 ? `1px solid ${ZT.line}` : 'none' }}>
          <ZtOrb size={148} state={x.s} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...T.label, color: x.s === 'error' ? ZT.bad : ZT.ink2 }}>{x.n}</div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 8, maxWidth: 180, lineHeight: 1.6 }}>{x.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

Object.assign(window, { ZtOrb, VoiceAfter, OrbStatesBoard, ZT_VOICE });

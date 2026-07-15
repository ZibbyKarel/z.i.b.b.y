// ZIBBY Velín-D — živý log systému, napravo uprostřed (uvolněný prostor po
// přesunu doku nahoru pod topbar). Sbalený do ikonky, plynule se rozbaluje
// a mizí, nikdy nezasahuje do prostoru doku nahoře.
const { useState: useStateLog, useEffect: useEffectLog, useRef: useRefLog } = React;

const VD_LOG_TEMPLATES = [
  (s) => `${s.name}: kontrola stavu proběhla bez chyby`,
  (s) => `${s.name}: nová dávka dat zpracována`,
  (s) => `${s.name}: čeká na odezvu externího API`,
  (s) => `${s.name}: checkpoint uložen`,
  (s) => `${s.name}: spuštěna plánovaná úloha`,
  (s) => `${s.name}: synchronizace dokončena`,
];

const vdFmtTime = (d) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const vdInitialLog = () => {
  const now = Date.now();
  const seed = [];
  VC_TASKS.slice(0, 4).forEach((t, i) => {
    const sys = vcSys(t.sys);
    if (sys) seed.push({ t: new Date(now - (VC_TASKS.length - i) * 47000), text: `${sys.name}: ${t.title} — ${t.phase}${t.pct != null ? ' · ' + t.pct + '%' : ''}` });
  });
  const sigEntries = Object.entries(VC_SIGNALS).slice(0, 3);
  sigEntries.forEach(([id, sig], i) => {
    const sys = vcSys(id);
    if (sys) seed.push({ t: new Date(now - (sigEntries.length - i) * 81000), text: `${sys.name}: ${sig.title}` });
  });
  return seed.sort((a, b) => a.t - b.t);
};

const VD_LOG_GLASS = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.55))',
  backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
};

const VcLiveLog = ({ dimmed }) => {
  const [open, setOpen] = useStateLog(false);
  const [lines, setLines] = useStateLog(vdInitialLog);
  const bodyRef = useRefLog(null);

  useEffectLog(() => {
    const id = setInterval(() => {
      const sys = VC_SUBSYSTEMS[Math.floor(Math.random() * VC_SUBSYSTEMS.length)];
      const tpl = VD_LOG_TEMPLATES[Math.floor(Math.random() * VD_LOG_TEMPLATES.length)];
      setLines((ls) => [...ls.slice(-40), { t: new Date(), text: tpl(sys) }]);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  useEffectLog(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines, open]);

  return (
    <div style={{
      position: 'absolute', left: 1327, top: 776, transform: 'translateY(-50%)', zIndex: 11,
      opacity: dimmed ? 0.3 : 1, filter: dimmed ? 'blur(2.5px)' : 'none',
      pointerEvents: dimmed ? 'none' : 'auto', transition: 'opacity .4s, filter .4s',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      {open ? (
        <div style={{
          width: 300, maxHeight: '40vh', display: 'flex', flexDirection: 'column', borderRadius: ZT.rPanel, overflow: 'hidden',
          border: `1px solid ${ZT.lineHi}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', animation: 'ztFadeUp .22s ease both',
          ...VD_LOG_GLASS,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: `1px solid ${ZT.line}` }}>
            <ZtDot state="run" size={6} />
            <span style={{ fontFamily: ZT.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: ZT.ink2 }}>Živý log</span>
            <button onClick={() => setOpen(false)} title="Sbalit" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, display: 'flex' }}><Icon name="x" size={14} /></button>
          </div>
          <div ref={bodyRef} style={{
            flex: 1, overflow: 'auto', padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 7,
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 14px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 14px)',
          }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontFamily: ZT.mono, fontSize: 10.5, lineHeight: 1.5 }}>
                <span style={{ color: ZT.ink3, flex: '0 0 auto' }}>{vdFmtTime(l.t)}</span>
                <span style={{ color: ZT.ink2 }}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} title="Živý log systému" style={{
          width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', position: 'relative',
          border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)',
          color: ZT.ink2, ...VD_LOG_GLASS,
        }}>
          <Icon name="terminal" size={17} />
          <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: ZT.run, boxShadow: `0 0 6px ${ZT.run}aa`, animation: 'ztLive 2s ease-in-out infinite' }} />
        </button>
      )}
    </div>
  );
};

Object.assign(window, { VcLiveLog });

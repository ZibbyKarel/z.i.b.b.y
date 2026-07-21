// ZIBBY Velín-C — orchestrátorský velín jako živá mapa subsystémů.
const { useState: useStateC, useEffect: useEffectC } = React;

// ── Přehled ZIBBY (klik na střed) — všechno napříč subsystémy ─────────────
const VcCoreDetail = ({ onClose, onOpenSys }) => {
  const s = VC_CORE.summary;
  const Stat = ({ n, label, c }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontFamily: ZT.mono, fontSize: 24, fontWeight: 700, color: c }}>{String(n).padStart(2, '0')}</span>
      <span style={{ ...T.micro, fontSize: 10.5 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '26px 40px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 720, maxHeight: '100%', display: 'flex', flexDirection: 'column',
        background: ZT.surface, border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rPanel, overflow: 'auto',
        boxShadow: `0 0 0 1px ${ZT.accent}18, 0 44px 110px rgba(0,0,0,0.66)`, animation: 'vcPop .34s ease both',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '20px 24px', borderBottom: `1px solid ${ZT.line}`, background: `linear-gradient(180deg, ${ZT.accent}16, transparent)` }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
            background: `radial-gradient(circle at 38% 32%, #dbe7ff, ${ZT.accent} 44%, #24406e)`, boxShadow: `0 0 22px ${ZT.accent}88` }}>
            <ZibbyMark size={26} color="#f2f6ff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...T.title, fontSize: 21 }}>ZIBBY</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ZtDot state="ok" size={7} /><span style={{ ...T.label, color: ZT.ok }}>{VC_CORE.status}</span>
              </span>
            </div>
            <div style={{ ...T.bodySm, fontSize: 12.5, marginTop: 3 }}>orchestrátor · řídím 8 subsystémů · {VC_CORE.running} úloh běží</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 6, display: 'flex' }}><Icon name="x" size={20} /></button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ ...T.body, fontSize: 15, lineHeight: 1.6, color: ZT.ink2, textWrap: 'pretty' }}>{VC_CORE.overnight}</div>
          <div style={{ display: 'flex', gap: 30, paddingBottom: 20, borderBottom: `1px solid ${ZT.line}` }}>
            <Stat n={s.working} label="pracují" c={ZT.run} />
            <Stat n={s.report} label="hlášení čeká" c={ZT.ok} />
            <Stat n={s.await} label="čekají na tebe" c={ZT.wait} />
            <Stat n={s.idle} label="v klidu" c={ZT.ink3} />
          </div>
          <div>
            <div style={{ ...T.label, marginBottom: 12 }}>Napříč subsystémy</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {VC_SUBSYSTEMS.map((sys) => {
                const st = VC_STATE[sys.state];
                return (
                  <div key={sys.id} onClick={() => onOpenSys(sys.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: sys.hue, flex: '0 0 auto', boxShadow: `0 0 6px ${sys.hue}88` }} />
                    <span style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, fontWeight: 500, flex: 1 }}>{sys.name}</span>
                    <span style={{ fontFamily: ZT.mono, fontSize: 10, color: st.c }}>{st.label}</span>
                    {sys.active > 0 && <span style={{ fontFamily: ZT.mono, fontSize: 10, color: ZT.run }}>·{sys.active}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Slim top bar ───────────────────────────────────────────────────────────
const VcTopBar = ({ lang, onLang }) => (
  <header style={{ height: 56, flex: '0 0 56px', display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', borderBottom: `1px solid ${ZT.line}`, background: 'rgba(11,14,19,0.72)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="uploads/icon.png" alt="ZIBBY" style={{ width: 26, height: 26, objectFit: 'contain' }} />
      <div style={{ fontFamily: ZT.mono, fontSize: 14, fontWeight: 700, letterSpacing: '0.24em', color: ZT.ink }}>
        Z<span style={{ color: ZT.ink3 }}>·</span>I<span style={{ color: ZT.ink3 }}>·</span>B<span style={{ color: ZT.ink3 }}>·</span>B<span style={{ color: ZT.ink3 }}>·</span>Y
      </div>
      <span style={{ fontFamily: ZT.mono, fontSize: 10, color: ZT.ink3, letterSpacing: '0.14em', textTransform: 'uppercase', marginLeft: 4, paddingLeft: 12, borderLeft: `1px solid ${ZT.line}` }}>Velín</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 auto', padding: '5px 14px', borderRadius: 999, border: `1px solid ${ZT.line}`, background: 'rgba(255,255,255,0.02)' }}>
      <ZtDot state="ok" size={6} />
      <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.ink2 }}>Nominal · <span style={{ color: ZT.run }}>4 pracují</span> · <span style={{ color: ZT.ok }}>2 hlášení</span> · <span style={{ color: ZT.wait }}>2 čekají na tebe</span></span>
    </div>
    <a href="ZIBBY Velin.html" title="Klasický velín (seznam)" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: ZT.rCtl, border: `1px solid ${ZT.line}`, color: ZT.ink2, textDecoration: 'none', fontFamily: ZT.mono, fontSize: 11 }}>
      <Icon name="grid" size={13} /> Klasický velín
    </a>
    <LangSwitch lang={lang} accent={ZT.accent} onChange={onLang} />
    <span style={{ width: 1, height: 26, background: ZT.line }} />
    <LimitsTopBar />
  </header>
);

// ── AppC ────────────────────────────────────────────────────────────────────
function AppC() {
  const [lang, setLang] = useStateC('cs');
  const [focus, setFocus] = useStateC(null);   // {t:'sys', id} | {t:'core'}
  const [task, setTask] = useStateC(null);
  const [taskRect, setTaskRect] = useStateC(null);

  const openSys = (id) => { setTask(null); setFocus({ t: 'sys', id }); };
  const openCore = () => { setTask(null); setFocus({ t: 'core' }); };
  const openTask = (tk, rect) => { setFocus(null); setTask(tk); setTaskRect(rect || null); };
  const closeAll = () => { setFocus(null); setTask(null); setTaskRect(null); };

  useEffectC(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const overlayed = !!focus || !!task;
  const sys = focus && focus.t === 'sys' ? vcSys(focus.id) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%',
      background: `radial-gradient(ellipse 130% 100% at 50% 42%, #121a27 0%, ${ZT.bg} 62%)`,
      fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <VcTopBar lang={lang} onLang={setLang} />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <VcMap onOpenSys={openSys} onOpenCore={openCore} dimmed={overlayed} />
        <VcTaskRail onOpen={openTask} dimmed={!!focus} />
        {sys && <VcSubsystemDetail key={sys.id} sys={sys} onClose={closeAll} onOpenTask={openTask} />}
        {focus && focus.t === 'core' && <VcCoreDetail onClose={closeAll} onOpenSys={openSys} />}
        {task && <VcTaskDetail key={task.id} task={task} originRect={taskRect} onClose={closeAll} onOpenSys={openSys} />}
      </div>
    </div>
  );
}

Object.assign(window, { AppC, VcCoreDetail, VcTopBar });

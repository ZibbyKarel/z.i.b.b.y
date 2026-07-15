// ZIBBY Velín-D — orchestrátorský velín jako živá mapa subsystémů s WebGL orby.
// Střed i subsystémy jsou dýchající drátěné koule (viz velin-d-orb.jsx).
const { useState: useStateD2, useEffect: useEffectD2, useRef: useRefD2 } = React;

// ── Statistika (sdíleno hover panelem status řádku) ───────────────────────
const VcStatD = ({ n, label, c }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    <span style={{ fontFamily: ZT.mono, fontSize: 24, fontWeight: 700, color: c }}>{String(n).padStart(2, '0')}</span>
    <span style={{ ...T.micro, fontSize: 10.5 }}>{label}</span>
  </div>
);

// ── Agregace pro operátora — co potřebuju vidět a schválit ────────────────
// Centrální místo: hlášení (report) + věci čekající na rozhodnutí (await/incident).
const VcApprovalRow = ({ e }) => {
  const c = e.sig.kind === 'incident' ? ZT.bad : e.sig.kind === 'await' ? ZT.wait : ZT.ok;
  const meta = e.sig.impact ? `${e.sig.impact}${e.sig.impactNote ? ' · ' + e.sig.impactNote : ''}` : e.sig.evidence;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 13px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flex: '0 0 auto', boxShadow: `0 0 6px ${c}88` }} />
        <span style={{ ...T.bodySm, fontSize: 11.5, color: ZT.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{e.sys.name}</span>
        <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3, marginLeft: 'auto' }}>{e.sig.at}</span>
      </div>
      <div style={{ ...T.bodySm, fontSize: 13, color: ZT.ink, fontWeight: 600 }}>{e.sig.title}</div>
      <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink2, lineHeight: 1.5, textWrap: 'pretty' }}>{e.sig.body}</div>
      {meta && <div style={{ fontFamily: ZT.mono, fontSize: 10.5, color: c }}>{meta}</div>}
      {(e.sig.kind === 'await' || e.sig.kind === 'incident') && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <RunBtn accent={ZT.ok} label="Schválit" size="sm" icon="check" />
          <GhostBtn accent={ZT.ink3} icon="x">Odmítnout</GhostBtn>
        </div>
      )}
    </div>
  );
};

// ── Řádek běžící úlohy (sekce „pracují") ──────────────────────────────────
const VcWorkRow = ({ task, onOpenSys }) => {
  const sys = vcSys(task.sys);
  return (
    <div onClick={() => onOpenSys(task.sys)} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 13px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: sys.hue, flex: '0 0 auto', boxShadow: `0 0 6px ${sys.hue}88` }} />
        <span style={{ ...T.bodySm, fontSize: 11.5, color: ZT.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sys.name}</span>
        <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3, marginLeft: 'auto' }}>{task.started}</span>
      </div>
      <div style={{ ...T.bodySm, fontSize: 13, color: ZT.ink, fontWeight: 600 }}>{task.title}</div>
      <div style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.run }}>{task.kind} · {task.phase}{task.pct != null ? ` · ${task.pct}%` : ''}</div>
    </div>
  );
};

const VC_SECTION_META = {
  report: { title: 'Hlášení připravena',      color: ZT.ok,   width: 460 },
  wait:   { title: 'Čeká na tvé rozhodnutí',  color: ZT.wait, width: 720 },
};

// ── Hover panel status řádku — obsah jen za sekci, na kterou operátor najel ─
const VcStatusPanelD = ({ section, onOpenSys }) => {
  const meta = VC_SECTION_META[section] || VC_SECTION_META.wait;
  const entries = Object.entries(VC_SIGNALS).map(([id, sig]) => ({ id, sig, sys: vcSys(id) })).filter((e) => e.sys);
  const needsDecision = entries.filter((e) => e.sig.kind === 'await' || e.sig.kind === 'incident');
  const reports = entries.filter((e) => e.sig.kind === 'report');
  const count = section === 'wait' ? needsDecision.length : reports.length;
  let body;
  if (section === 'wait') {
    body = <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{needsDecision.map((e) => <VcApprovalRow key={e.id} e={e} />)}</div>;
  } else {
    body = <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{reports.map((e) => <VcApprovalRow key={e.id} e={e} />)}</div>;
  }
  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      width: meta.width, maxHeight: '76vh', overflow: 'auto', display: 'flex', flexDirection: 'column',
      background: ZT.surfaceHi,
      border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rPanel,
      boxShadow: `0 0 0 1px ${meta.color}22, 0 30px 80px rgba(0,0,0,0.6)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${ZT.line}`, background: `linear-gradient(180deg, ${meta.color}14, transparent)` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, boxShadow: `0 0 6px ${meta.color}88` }} />
        <span style={{ ...T.title, fontSize: 15, color: meta.color }}>{meta.title}</span>
        <span style={{ ...T.bodySm, fontSize: 11.5, color: ZT.ink3, marginLeft: 'auto' }}>{count}</span>
      </div>
      <div style={{ padding: 20 }}>{body}</div>
    </div>
  );
};

// ── Nastavení systému (klik na střed) — jediné místo, orb přehled je teď v top baru ─
const VcSettingsModalD = ({ onClose }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '26px 40px' }} onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} style={{
      width: '100%', maxWidth: 480, maxHeight: '100%', display: 'flex', flexDirection: 'column',
      background: ZT.surface, border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rPanel, overflow: 'auto',
      boxShadow: `0 0 0 1px ${ZT.accent}18, 0 44px 110px rgba(0,0,0,0.66)`, animation: 'vcPop .34s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '20px 24px', borderBottom: `1px solid ${ZT.line}`, background: `linear-gradient(180deg, ${ZT.accent}16, transparent)` }}>
        <span style={{ width: 40, height: 40, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${ZT.accent}18`, color: ZT.accent }}>
          <Icon name="gear" size={19} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ ...T.title, fontSize: 17 }}>Nastavení systému</div>
          <div style={{ ...T.bodySm, fontSize: 12, marginTop: 2 }}>Předvolby, jazyk, hlas a účet</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 6, display: 'flex' }}><Icon name="x" size={20} /></button>
      </div>
      <div style={{ padding: '10px 14px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {VD_SETTINGS_PANEL_ITEMS.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: ZT.rCtl, cursor: 'pointer' }}>
            <span style={{ width: 30, height: 30, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${ZT.accent}14`, color: ZT.accent }}>
              <Icon name={it.glyph} size={14} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...T.bodySm, fontSize: 13, color: ZT.ink, fontWeight: 500 }}>{it.label}</div>
              <div style={{ ...T.bodySm, fontSize: 11.5, color: ZT.ink3 }}>{it.sub}</div>
            </div>
            <Icon name="chevron" size={14} style={{ color: ZT.ink3 }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Status řádek top baru — každá sekce hoverem odhalí jen svůj obsah ─────
// Plachta "vznikne" ze sekce, na kterou operátor poprvé najel — jen při
// přechodu zavřeno→otevřeno (roste jako scale z bodu pod sekcí, nikdy se
// nepřepočítává zpět na "auto" layout, takže po doběhnutí neposkočí);
// přejíždění mezi sekcemi uvnitř otevřené plachty animaci nespouští, jen
// přepíná obsah.
const VcStatusLineD = ({ onOpenSys, style }) => {
  const [activeKey, setActiveKey] = useStateD2(null);
  const closeTimer = useRefD2(null);
  const wasOpenRef = useRefD2(false);
  const pillRef = useRefD2(null);
  const wrapRef = useRefD2(null);
  const secRefs = { report: useRefD2(null), wait: useRefD2(null) };
  const s = VC_CORE.summary;
  const open = !!activeKey;
  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => { closeTimer.current = setTimeout(() => setActiveKey(null), 200); };

  useEffectD2(() => {
    if (open && !wasOpenRef.current) {
      const originEl = secRefs[activeKey] && secRefs[activeKey].current;
      const pill = pillRef.current, wrap = wrapRef.current;
      if (originEl && pill && wrap) {
        const secR = originEl.getBoundingClientRect();
        const pillR = pill.getBoundingClientRect();
        const w = VC_SECTION_META[activeKey].width;
        const left = Math.round(pillR.left + pillR.width / 2 - w / 2);
        const top = Math.round(pillR.bottom + 10);
        wrap.style.left = left + 'px';
        wrap.style.top = top + 'px';
        const originXPct = Math.min(100, Math.max(0, ((secR.left + secR.width / 2 - left) / w) * 100));
        wrap.style.transformOrigin = `${originXPct}% 0%`;
        wrap.style.transition = 'none';
        wrap.style.transform = 'scale(0.08)';
        wrap.style.opacity = '0';
        wrap.getBoundingClientRect();
        requestAnimationFrame(() => {
          wrap.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1), opacity .2s ease';
          wrap.style.transform = 'scale(1)';
          wrap.style.opacity = '1';
        });
      }
    }
    wasOpenRef.current = open;
  }, [open]);

  const Section = ({ k, color, children }) => (
    <span ref={secRefs[k]} onMouseEnter={() => { cancelClose(); setActiveKey(k); }} style={{
      padding: '3px 8px', borderRadius: 999, transition: 'background .15s, color .15s',
      background: activeKey === k ? `${color}22` : 'transparent',
      color: activeKey === k ? color : ZT.ink2,
    }}>{children}</span>
  );

  return (
    <>
      <div ref={pillRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose} style={vdGlassStyle({
        display: 'flex', alignItems: 'center', gap: 2, padding: '5px 10px 5px 12px', borderRadius: 999,
        flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0, cursor: 'default', transition: 'all .15s',
        ...style,
      })}>
        <ZtDot state="ok" size={6} />
        <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.ink2, marginRight: 4 }}>{VC_CORE.status} ·</span>
        <span style={{ fontFamily: ZT.mono, fontSize: 11 }}>
          <Section k="report" color={ZT.ok}>{s.report} hlášení</Section> ·{' '}
          <Section k="wait" color={ZT.wait}>{s.await} čekají na tebe</Section>
        </span>
      </div>
      <div style={{ position: 'relative', margin: '0 auto' }} onMouseLeave={scheduleClose}>
        {open && (
          <div ref={wrapRef} style={{ position: 'fixed', zIndex: 60 }}
            onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
            <VcStatusPanelD section={activeKey} onOpenSys={onOpenSys} />
          </div>
        )}
      </div>
    </>
  );
};

// ── Slim top bar ───────────────────────────────────────────────────────────
const VD_GLASS = 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))';
const vdGlassStyle = (extra) => ({
  background: VD_GLASS, backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)',
  ...extra,
});

const VD_TOPBAR_H = 40;
const VcTopBarD = ({ lang, onLang, onSearch, onOpenSys }) => (
  <header style={{ height: 56, flex: '0 0 56px', display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', position: 'relative', zIndex: 100, overflow: 'visible' }}>
    <VcStatusLineD onOpenSys={onOpenSys} style={{ width: 323, height: 38 }} />
    <button onClick={onSearch} title="Hledat napříč ZIBBY (⌘K)" style={vdGlassStyle({
      display: 'flex', alignItems: 'center', gap: 9, width: 190, height: VD_TOPBAR_H, flex: '0 0 auto', padding: '0 12px',
      borderRadius: 999, color: ZT.ink3, cursor: 'pointer',
    })}>
      <Icon name="search" size={13} />
      <span style={{ fontFamily: ZT.sans, fontSize: 12.5, color: ZT.ink3, flex: 1, textAlign: 'left' }}>Hledat…</span>
      <span style={{ fontFamily: ZT.mono, fontSize: 9, color: ZT.ink3, border: `1px solid ${ZT.line}`, borderRadius: 4, padding: '1px 6px' }}>⌘K</span>
    </button>
    <LimitsTopBar
      style={{ width: 119, height: 41 }}
      secondRingStyle={{ width: 55, height: 25 }}
      glassStyle={vdGlassStyle({ borderRadius: 999, padding: '0 14px' })}
    />
    <a href="ZIBBY Velin-C.html" title="Velín-C (klasické orby)" style={vdGlassStyle({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: VD_TOPBAR_H, height: VD_TOPBAR_H, padding: 0, borderRadius: 999, color: ZT.ink2, textDecoration: 'none', fontFamily: ZT.mono, fontSize: 11 })}>
      <Icon name="grid" size={13} />
    </a>
  </header>
);

// ── AppD ────────────────────────────────────────────────────────────────────
function AppD() {
  const [lang, setLang] = useStateD2('cs');
  const [focus, setFocus] = useStateD2(null);
  const [task, setTask] = useStateD2(null);
  const [taskRect, setTaskRect] = useStateD2(null);
  const [searchOpen, setSearchOpen] = useStateD2(false);

  const openSys = (id) => { setTask(null); setFocus({ t: 'sys', id }); };
  const openCore = () => { setTask(null); setFocus({ t: 'settings' }); };
  const openTask = (tk, rect) => { setFocus(null); setTask(tk); setTaskRect(rect || null); };
  const closeAll = () => { setFocus(null); setTask(null); setTaskRect(null); };

  useEffectD2(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v); return; }
      if (e.key === 'Escape') { if (searchOpen) setSearchOpen(false); else closeAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const overlayed = !!focus || !!task || searchOpen;
  const sys = focus && focus.t === 'sys' ? vcSys(focus.id) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%',
      background: `radial-gradient(ellipse 130% 100% at 50% 42%, #121a27 0%, ${ZT.bg} 62%)`,
      fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <VcTopBarD lang={lang} onLang={setLang} onSearch={() => setSearchOpen(true)} onOpenSys={openSys} />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, zIndex: 1 }}>
        <VcMapD onOpenSys={openSys} onOpenCore={openCore} dimmed={overlayed} bottomReserve={230} />
        <VcTaskRail onOpen={openTask} dimmed={overlayed} />
        <VcDockGroup dimmed={overlayed} />
        <VcLiveLog dimmed={overlayed} />
        <VcBottomBar dimmed={overlayed} />
        {sys && <VcSubsystemDetail key={sys.id} sys={sys} onClose={closeAll} onOpenTask={openTask} orbMode />}
        {focus && focus.t === 'settings' && <VcSettingsModalD onClose={closeAll} />}
        {task && <VcTaskDetail task={task} originRect={taskRect} onClose={closeAll} onOpenSys={openSys} />}
        <VcSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onOpenSys={openSys} onOpenTask={openTask} />
      </div>
    </div>
  );
}

Object.assign(window, { AppD, VcSettingsModalD, VcStatusPanelD, VcTopBarD });

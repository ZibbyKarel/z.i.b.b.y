// ZIBBY Velín-D — plovoucí dok napravo: sloupec ikon, hover rozjede panel se
// seznamem entit vlevo od doku. Nastavení odděleno dělítkem dole.
const { useState: useStateDock, useRef: useRefDock } = React;

const VD_DOCK_ITEMS = [
  { id: 'companies', label: 'Firmy', glyph: 'building' },
  { id: 'projects', label: 'Projekty', glyph: 'code' },
  { id: 'agents', label: 'Agenty', glyph: 'bot' },
  { id: 'skills', label: 'Skilly', glyph: 'spark' },
  { id: 'commands', label: 'Commands', glyph: 'terminal' },
  { id: 'mcp', label: 'MCP servery', glyph: 'plug' },
  { id: 'memory', label: 'Paměť systému', glyph: 'brain' },
];
const VD_SETTINGS_ITEM = { id: 'settings', label: 'Nastavení systému', glyph: 'gear' };

const VD_COMPANIES = [
  { name: 'Studio Lumen', sub: 'dodavatel · fakturace' },
  { name: 'Acme Cloud s.r.o.', sub: 'hosting · smlouva do 2027' },
  { name: 'Home Ops Family', sub: 'domácnost · sdílený rozpočet' },
];
const VD_COMMANDS = [
  { name: '/shrnout-den', sub: 'denní souhrn napříč subsystémy' },
  { name: '/schvalit-platby', sub: 'otevře frontu schválení' },
  { name: '/nasadit', sub: 'spustí deploy pipeline' },
  { name: '/pauza', sub: 'pozastaví běžící úlohu' },
];
const VD_SETTINGS_PANEL_ITEMS = [
  { label: 'Jazyk rozhraní', sub: 'Čeština / English', glyph: 'gear' },
  { label: 'Hlasový režim', sub: 'aktivace, hlas, citlivost', glyph: 'mic' },
  { label: 'Vzhled', sub: 'motiv, hustota, akcent', glyph: 'spark' },
  { label: 'Účet & limity', sub: 'Claude, Agent SDK kredit', glyph: 'dollar' },
];

const vdDockPanelFor = (id) => {
  switch (id) {
    case 'companies': return VD_COMPANIES.map((c) => ({ label: c.name, sub: c.sub, glyph: 'building' }));
    case 'projects': return VC_PROJECTS.map((p) => ({ label: p, sub: 'projekt', glyph: 'code' }));
    case 'agents': return (window.AGENTS || []).slice(0, 6).map((a) => ({ label: a.name, sub: a.role, glyph: a.glyph }));
    case 'skills': return (window.SKILLS || []).filter((s) => s.pinned).slice(0, 6).map((s) => ({ label: s.name, sub: s.desc, glyph: s.glyph }));
    case 'commands': return VD_COMMANDS.map((c) => ({ label: c.name, sub: c.sub, glyph: 'terminal' }));
    case 'mcp': return (window.INTEGRATIONS || []).filter((i) => i.kind === 'mcp').map((i) => ({ label: i.name, sub: i.desc, glyph: i.glyph || 'plug' }));
    case 'memory': return (window.VAULT_NODES || []).slice(0, 6).map((v) => ({ label: v.label, sub: (v.body || '').split('\n').filter(Boolean).find((l) => !l.startsWith('#')) || '', glyph: 'brain' }));
    case 'settings': return VD_SETTINGS_PANEL_ITEMS;
    default: return [];
  }
};

const VdDockBtn = ({ item, active, onEnter }) => (
  <button onMouseEnter={onEnter} title={item.label} style={{
    width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer',
    border: `1px solid ${active ? ZT.accent + '66' : 'transparent'}`,
    background: active ? `${ZT.accent}22` : 'transparent', color: active ? ZT.accent : ZT.ink2,
    transition: 'all .16s',
  }}>
    <Icon name={item.glyph} size={17} />
  </button>
);

const VdDockPanel = ({ meta, items }) => (
  <div style={{
    width: 280, borderRadius: ZT.rPanel, overflow: 'hidden', animation: 'ztFadeUp .16s ease both',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.6))',
    backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
    border: `1px solid ${ZT.lineHi}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: `1px solid ${ZT.line}` }}>
      <span style={{ color: ZT.accent, display: 'flex' }}><Icon name={meta.glyph} size={15} /></span>
      <span style={{ fontFamily: ZT.mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: ZT.ink2 }}>{meta.label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: ZT.mono, fontSize: 10, color: ZT.ink3 }}>{items.length}</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflow: 'auto' }}>
      {items.length === 0 && <div style={{ ...T.micro, padding: '14px' }}>Zatím nic k zobrazení.</div>}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i === 0 ? 'none' : `1px solid ${ZT.line}` }}>
          <span style={{ width: 24, height: 24, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${ZT.accent}18`, color: ZT.accent }}>
            <Icon name={it.glyph || meta.glyph} size={12} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: ZT.sans, fontSize: 12.5, fontWeight: 500, color: ZT.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
            {it.sub && <div style={{ fontFamily: ZT.sans, fontSize: 11, color: ZT.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const VcDock = ({ dimmed }) => {
  const [active, setActive] = useStateDock(null);
  const closeTimer = useRefDock(null);
  const open = (id) => { clearTimeout(closeTimer.current); setActive(id); };
  const scheduleClose = () => { closeTimer.current = setTimeout(() => setActive(null), 160); };
  const allItems = VD_DOCK_ITEMS.concat([VD_SETTINGS_ITEM]);
  const activeMeta = allItems.find((i) => i.id === active);

  return (
    <div onMouseLeave={scheduleClose} style={{
      position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', zIndex: 14,
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: dimmed ? 0.3 : 1, filter: dimmed ? 'blur(2.5px)' : 'none',
      pointerEvents: dimmed ? 'none' : 'auto', transition: 'opacity .4s, filter .4s',
    }}>
      {activeMeta && <div onMouseEnter={() => clearTimeout(closeTimer.current)}><VdDockPanel meta={activeMeta} items={vdDockPanelFor(active)} /></div>}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 7px', borderRadius: 22,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))',
        backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)',
      }}>
        {VD_DOCK_ITEMS.map((it) => <VdDockBtn key={it.id} item={it} active={active === it.id} onEnter={() => open(it.id)} />)}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '3px 4px' }} />
        <VdDockBtn item={VD_SETTINGS_ITEM} active={active === VD_SETTINGS_ITEM.id} onEnter={() => open(VD_SETTINGS_ITEM.id)} />
      </div>
    </div>
  );
};

Object.assign(window, { VcDock, VD_DOCK_ITEMS, VD_SETTINGS_ITEM, VD_COMPANIES, VD_COMMANDS, VD_SETTINGS_PANEL_ITEMS, vdDockPanelFor });

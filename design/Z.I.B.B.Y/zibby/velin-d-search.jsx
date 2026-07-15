// ZIBBY Velín-D — fulltextové ⌘K vyhledávání napříč celým systémem: subsystémy,
// pipeliny, agenti, projekty, úlohy, skilly, MCP servery, paměť, commandy, firmy, nastavení.
const { useState: useStateSearch, useEffect: useEffectSearch, useRef: useRefSearch, useMemo: useMemoSearch } = React;

const VD_SEARCH_KIND_LABEL = {
  subsystem: 'subsystém', pipeline: 'pipelina', agent: 'agent', project: 'projekt', task: 'úloha',
  skill: 'skill', mcp: 'MCP server', memory: 'paměť', command: 'command', company: 'firma', setting: 'nastavení',
};

const vdBuildSearchIndex = () => {
  const items = [];
  VC_SUBSYSTEMS.forEach((s) => {
    items.push({ kind: 'subsystem', label: s.name, sub: s.mandate, glyph: s.glyph, hue: s.hue, sysId: s.id });
    (s.pipelines || []).forEach((p) => items.push({ kind: 'pipeline', label: p.name, sub: `pipelina · ${s.name}`, glyph: 'flow', hue: s.hue, sysId: s.id }));
    (s.crew || []).forEach((c) => {
      const name = typeof c === 'string' ? c : c.name;
      const glyph = typeof c === 'string' ? 'bot' : (c.glyph || 'bot');
      if (!items.some((it) => it.kind === 'agent' && it.label === name)) items.push({ kind: 'agent', label: name, sub: `agent · ${s.name}`, glyph, hue: s.hue, sysId: s.id });
    });
  });
  VC_PROJECTS.forEach((p) => items.push({ kind: 'project', label: p, sub: 'projekt', glyph: 'doc', hue: ZT.ink3 }));
  VC_TASKS.forEach((t) => items.push({ kind: 'task', label: t.title, sub: `úloha · ${t.kind}`, glyph: 'bolt', hue: ZT.run, taskObj: t }));
  VC_TASKS_DONE.forEach((t) => items.push({ kind: 'task', label: t.title, sub: `dokončená úloha · ${vcSys(t.sys).name} · ${t.finishedAt}`, glyph: 'ok', hue: ZT.ok, taskObj: t }));
  (window.SKILLS || []).forEach((s) => items.push({ kind: 'skill', label: s.name, sub: s.desc, glyph: s.glyph, hue: ZT.accent }));
  (window.INTEGRATIONS || []).filter((i) => i.kind === 'mcp').forEach((i) => items.push({ kind: 'mcp', label: i.name, sub: i.desc, glyph: i.glyph || 'plug', hue: '#56c4d6' }));
  (window.VAULT_NODES || []).forEach((v) => items.push({ kind: 'memory', label: v.label, sub: (v.body || '').split('\n').filter(Boolean).find((l) => !l.startsWith('#')) || '', glyph: 'brain', hue: '#b07cff' }));
  VD_COMMANDS.forEach((c) => items.push({ kind: 'command', label: c.name, sub: c.sub, glyph: 'terminal', hue: '#e0a83c' }));
  VD_COMPANIES.forEach((c) => items.push({ kind: 'company', label: c.name, sub: c.sub, glyph: 'building', hue: '#46cf8b' }));
  VD_SETTINGS_PANEL_ITEMS.forEach((s) => items.push({ kind: 'setting', label: s.label, sub: s.sub, glyph: s.glyph, hue: ZT.ink2 }));
  return items;
};

const VdSearchRow = ({ it, active, onPick }) => (
  <div onMouseDown={(e) => { e.preventDefault(); onPick(it); }} style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
  }}>
    <span style={{ width: 30, height: 30, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${it.hue}22`, color: it.hue, border: `1px solid ${it.hue}44` }}>
      <Icon name={it.glyph} size={15} />
    </span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontFamily: ZT.sans, fontSize: 14, fontWeight: 500, color: ZT.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
      {it.sub && <div style={{ fontFamily: ZT.sans, fontSize: 12, color: ZT.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{it.sub}</div>}
    </div>
    <span style={{ ...T.micro, fontSize: 10, flex: '0 0 auto' }}>{VD_SEARCH_KIND_LABEL[it.kind]}</span>
  </div>
);

const VcSearchModal = ({ open, onClose, onOpenSys, onOpenTask }) => {
  const [q, setQ] = useStateSearch('');
  const [active, setActive] = useStateSearch(0);
  const inputRef = useRefSearch(null);
  const index = useMemoSearch(() => vdBuildSearchIndex(), []);

  useEffectSearch(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); }
  }, [open]);

  const results = useMemoSearch(() => {
    const s = q.trim().toLowerCase();
    const pool = s ? index.filter((it) => (it.label + ' ' + (it.sub || '')).toLowerCase().includes(s)) : index;
    return pool.slice(0, 30);
  }, [q, index]);

  const pick = (it) => {
    onClose();
    if (it.kind === 'subsystem' || it.kind === 'pipeline' || it.kind === 'agent') { onOpenSys && onOpenSys(it.sysId); return; }
    if (it.kind === 'task') { onOpenTask && onOpenTask(it.taskObj); return; }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (results[active]) pick(results[active]); }
  };

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', background: 'rgba(6,8,12,0.55)', backdropFilter: 'blur(3px)' }} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{
        width: 'min(600px, 92vw)', maxHeight: '68vh', display: 'flex', flexDirection: 'column',
        borderRadius: ZT.rPanel, overflow: 'hidden', animation: 'vcPop .2s ease both',
        background: 'linear-gradient(180deg, rgba(20,25,34,0.96), rgba(12,15,21,0.98))',
        border: `1px solid ${ZT.lineHi}`, boxShadow: `0 0 0 1px ${ZT.accent}22, 0 40px 100px rgba(0,0,0,0.6)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${ZT.line}` }}>
          <Icon name="search" size={17} style={{ color: ZT.ink3 }} />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
            placeholder="Hledej napříč ZIBBY — subsystémy, úlohy, agenty, skilly, firmy, nastavení…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: ZT.sans, fontSize: 15, color: ZT.ink, padding: '4px 0' }} />
          <span style={{ fontFamily: ZT.mono, fontSize: 10, color: ZT.ink3, border: `1px solid ${ZT.line}`, borderRadius: 4, padding: '2px 7px' }}>ESC</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && <div style={{ ...T.micro, padding: '22px 18px', textAlign: 'center' }}>Nic nenalezeno.</div>}
          {results.map((it, i) => <VdSearchRow key={it.kind + it.label + i} it={it} active={i === active} onPick={pick} />)}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { VcSearchModal, vdBuildSearchIndex });

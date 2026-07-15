// ZIBBY Velín-D — spodní toolbar: tři ikonky (chat / spustit úlohu / poznámka).
// Klik na ikonku ji plynule rozvine na plný komponent, ostatní dvě zůstanou
// jako malé ikonky a odsunou se do stran (přirozeně, flexboxem).
const { useState: useStateBB } = React;

const VD_BB_ITEMS = [
  { id: 'chat', glyph: 'chat', label: 'Chat', width: 560 },
  { id: 'task', glyph: 'play', label: 'Spustit úlohu', width: 400 },
  { id: 'note', glyph: 'edit', label: 'Přidat poznámku', width: 360 },
];

const VD_BB_GLASS = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))',
  backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)',
};

const VdBbIconBtn = ({ item, onClick }) => (
  <button onClick={onClick} title={item.label} style={{
    width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: ZT.ink2, transition: 'all .18s', ...VD_BB_GLASS,
  }}
    onMouseEnter={(e) => { e.currentTarget.style.color = ZT.ink; e.currentTarget.style.borderColor = ZT.lineHi; }}
    onMouseLeave={(e) => { e.currentTarget.style.color = ZT.ink2; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}>
    <Icon name={item.glyph} size={19} />
  </button>
);

// ── Spustit úlohu — vybere subsystém, zadá práci přirozeným jazykem ────────
const VcQuickTask = ({ onClose }) => {
  const [selId, setSelId] = useStateBB(VC_SUBSYSTEMS[0].id);
  const [val, setVal] = useStateBB('');
  const sel = vcSys(selId);
  const submit = () => { if (!val.trim()) return; setVal(''); onClose(); };
  return (
    <div style={{ borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animation: 'ztFadeUp .26s ease both', ...VD_BB_GLASS, border: `1px solid ${sel.hue}44` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 28, height: 28, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${sel.hue}18`, color: sel.hue }}>
          <Icon name={sel.glyph} size={14} />
        </span>
        <select value={selId} onChange={(e) => setSelId(e.target.value)} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl,
          color: ZT.ink, fontFamily: ZT.sans, fontSize: 12.5, padding: '7px 9px', outline: 'none',
        }}>
          {VC_SUBSYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={onClose} title="Zavřít" style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, display: 'flex' }}><Icon name="x" size={16} /></button>
      </div>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} placeholder="Zadej práci přirozeným jazykem…" rows={2} autoFocus
        style={{ resize: 'none', background: 'rgba(255,255,255,0.03)', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink, fontFamily: ZT.sans, fontSize: 13, padding: '9px 11px', outline: 'none' }} />
      <RunBtn accent={sel.hue} label="Spustit úlohu" icon="play" onClick={submit} />
    </div>
  );
};

// ── Přidat poznámku — rychlá poznámka pro ZIBBY ────────────────────────────
const VcQuickNote = ({ onClose }) => {
  const [val, setVal] = useStateBB('');
  return (
    <div style={{ borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animation: 'ztFadeUp .26s ease both', ...VD_BB_GLASS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={T.label}>Nová poznámka</span>
        <button onClick={onClose} title="Zavřít" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, display: 'flex' }}><Icon name="x" size={16} /></button>
      </div>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} placeholder="Napiš poznámku pro ZIBBY…" rows={3} autoFocus
        style={{ resize: 'none', background: 'rgba(255,255,255,0.03)', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink, fontFamily: ZT.sans, fontSize: 13, padding: '9px 11px', outline: 'none' }} />
      <RunBtn accent={ZT.accent} label="Uložit poznámku" icon="check" onClick={onClose} />
    </div>
  );
};

const VcBottomBar = ({ dimmed }) => {
  const [mode, setMode] = useStateBB(null);
  const toggle = (id) => setMode((m) => (m === id ? null : id));

  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 12,
      display: 'flex', alignItems: 'flex-end', gap: 10,
      opacity: dimmed ? 0.28 : 1, filter: dimmed ? 'blur(2px)' : 'none',
      pointerEvents: dimmed ? 'none' : 'auto', transition: 'opacity .4s, filter .4s',
    }}>
      {VD_BB_ITEMS.map((item) => {
        const active = mode === item.id;
        return (
          <div key={item.id} style={{ width: active ? item.width : 48, transition: 'width .38s cubic-bezier(.2,.8,.2,1)', flex: '0 0 auto' }}>
            {active
              ? (item.id === 'chat'
                  ? <VcChatDock onClose={() => setMode(null)} />
                  : item.id === 'task'
                    ? <VcQuickTask onClose={() => setMode(null)} />
                    : <VcQuickNote onClose={() => setMode(null)} />)
              : <VdBbIconBtn item={item} onClick={() => toggle(item.id)} />}
          </div>
        );
      })}
    </div>
  );
};

Object.assign(window, { VcBottomBar, VcQuickTask, VcQuickNote });

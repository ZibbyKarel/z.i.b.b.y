// ZIBBY velín — Hooks: CRUD pro Claude Code lifecycle hooky (net-new, P0 #3).
// Systém: /hooks, /hooks/[id]. Seznam + detail/edit.
const { useState: useStateHk } = React;

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'Notification'];
const HOOK_EVENT_C = { PreToolUse: '#f0b429', PostToolUse: '#3fcf8e', UserPromptSubmit: '#5b8def', Stop: '#ff6b6b', SubagentStop: '#b07cff', Notification: '#56c4d6' };

const HOOKS_DATA = [
  { id: 'guard-rm', name: 'Zablokuj rm -rf mimo /tmp', event: 'PreToolUse', matcher: 'Bash', command: '~/.claude/hooks/guard-rm.sh', timeout: 5, enabled: true, lastFired: '2h', fires: 214 },
  { id: 'log-writes', name: 'Zaloguj každý zápis souboru', event: 'PostToolUse', matcher: 'Write|Edit', command: '~/.claude/hooks/log-writes.sh', timeout: 3, enabled: true, lastFired: '4m', fires: 1842 },
  { id: 'inject-context', name: 'Přidej kontext projektu do promptu', event: 'UserPromptSubmit', matcher: '', command: '~/.claude/hooks/inject-context.sh', timeout: 8, enabled: true, lastFired: '11m', fires: 96 },
  { id: 'notify-desktop', name: 'Desktop notifikace při čekání', event: 'Notification', matcher: '', command: '~/.claude/hooks/notify.sh', timeout: 3, enabled: false, lastFired: '3 dny', fires: 58 },
  { id: 'session-summary', name: 'Zapiš shrnutí session do MEMORY.md', event: 'Stop', matcher: '', command: '~/.claude/hooks/session-summary.sh', timeout: 15, enabled: true, lastFired: '31m', fires: 302 },
];

const Switch = ({ on, accent, onToggle }) => (
  <button onClick={onToggle} title={on ? 'zapnuto' : 'vypnuto'} style={{ width: 42, height: 24, borderRadius: 24, padding: 3, cursor: 'pointer', display: 'flex', border: 'none', background: on ? `${accent}33` : 'rgba(255,255,255,0.08)', transition: 'background .16s' }}>
    <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? accent : Z.inkFaint, transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .16s, background .16s' }}></span>
  </button>
);

const EventBadge = ({ event }) => {
  const c = HOOK_EVENT_C[event] || Z.inkDim;
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: Z.mono, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: Z.rCtl, color: c, background: `${c}16`, border: `1px solid ${c}44`, whiteSpace: 'nowrap' }}>{event}</span>;
};

const HookCard = ({ h, accent, active, onOpen }) => (
  <div onClick={() => onOpen(h.id)} style={{
    display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 15px', cursor: 'pointer', opacity: h.enabled ? 1 : 0.55,
    background: active ? Z.panelHi : Z.panel, border: `1px solid ${active ? accent + '66' : Z.line}`, borderRadius: Z.rPanel,
    boxShadow: active ? `0 0 0 1px ${accent}22` : 'none', transition: 'all .14s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Dot color={h.enabled ? Z.ok : Z.inkFaint} size={7} />
      <div style={{ fontSize: 13, fontWeight: 600, color: Z.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
    </div>
    <EventBadge event={h.event} />
    <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{h.fires}× spuštěno</Mono>
  </div>
);

const HookFormModal = ({ hook, isNew, accent, onClose, onSave, onDelete }) => {
  const [name, setName] = useStateHk(hook.name || '');
  const [event, setEvent] = useStateHk(hook.event || 'PreToolUse');
  const [matcher, setMatcher] = useStateHk(hook.matcher || '');
  const [command, setCommand] = useStateHk(hook.command || '');
  const [timeout, setTimeout_] = useStateHk(hook.timeout || 5);
  const [confirm, setConfirm] = useStateHk(false);
  const valid = name.trim() && command.trim();
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', maxHeight: '90%', overflow: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}><Icon name="link" size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>{isNew ? 'Nový hook' : 'Upravit hook'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>Claude Code lifecycle hook</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><FieldLabel>Název</FieldLabel><TextInput value={name} onChange={setName} placeholder="Co hook dělá jednou větou" /></div>
          <div>
            <FieldLabel>Event</FieldLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {HOOK_EVENTS.map((ev) => (
                <button key={ev} onClick={() => setEvent(ev)} style={{ fontFamily: Z.mono, fontSize: 10.5, padding: '6px 10px', cursor: 'pointer', borderRadius: Z.rCtl, color: event === ev ? Z.bg0 : (HOOK_EVENT_C[ev]), background: event === ev ? HOOK_EVENT_C[ev] : 'transparent', border: `1px solid ${HOOK_EVENT_C[ev]}55` }}>{ev}</button>
              ))}
            </div>
          </div>
          <div><FieldLabel>Matcher <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· regex na jméno nástroje, prázdné = vše</span></FieldLabel><TextInput mono value={matcher} onChange={setMatcher} placeholder="Bash|Write" /></div>
          <div><FieldLabel>Příkaz</FieldLabel><TextInput mono value={command} onChange={setCommand} placeholder="~/.claude/hooks/muj-hook.sh" /></div>
          <div style={{ width: 140 }}>
            <FieldLabel>Timeout (s)</FieldLabel>
            <input type="number" value={timeout} onChange={(e) => setTimeout_(Number(e.target.value))} style={{ width: '100%', marginTop: 7, padding: '9px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, color: Z.ink, fontFamily: Z.mono, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew ? <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}><Icon name="trash" size={13} /> Smazat</button> : <div></div>}
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            <RunBtn accent={accent} icon={isNew ? 'plus' : 'check'} label={isNew ? 'Vytvořit hook' : 'Uložit změny'}
              onClick={() => valid && onSave({ ...hook, name: name.trim(), event, matcher: matcher.trim(), command: command.trim(), timeout })} />
          </div>
        </div>
      </div>
      {confirm && <ConfirmDialog title="Smazat hook?" message={<span>Opravdu smazat hook <Mono style={{ color: Z.ink }}>{hook.name}</Mono>? Přestane se spouštět okamžitě.</span>} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDelete(hook.id); }} />}
    </div>
  );
};

const HookDetailScreen = ({ hook, accent, onEdit, onToggle }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: Z.rPanel, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}><Icon name="link" size={22} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: Z.sans, fontSize: 19, fontWeight: 600, color: Z.ink }}>{hook.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}><EventBadge event={hook.event} />{hook.matcher && <Mono style={{ fontSize: 11, color: Z.inkFaint }}>matcher: {hook.matcher}</Mono>}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch on={hook.enabled} accent={accent} onToggle={() => onToggle(hook.id)} />
        <GhostBtn icon="edit" onClick={onEdit}>Upravit</GhostBtn>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
      <Icon name="terminal" size={13} style={{ color: Z.inkFaint }} />
      <Mono style={{ fontSize: 11, color: Z.inkFaint, flex: 1 }}>{hook.command}</Mono>
      <Mono style={{ fontSize: 10, color: Z.inkFaint }}>timeout {hook.timeout}s</Mono>
    </div>
    <HudPanel accent={accent} title="statistiky">
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>SPUŠTĚNO</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{hook.fires}×</Mono></div>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>NAPOSLED</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{hook.lastFired}</Mono></div>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>STAV</Mono><Mono style={{ fontSize: 13, color: hook.enabled ? Z.ok : Z.inkFaint, marginTop: 4, display: 'block' }}>{hook.enabled ? 'aktivní' : 'vypnutý'}</Mono></div>
      </div>
    </HudPanel>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: `${Z.warn}0e`, border: `1px solid ${Z.warn}33`, borderRadius: Z.rCtl }}>
      <Icon name="warn" size={14} style={{ color: Z.warn }} />
      <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>Hook běží synchronně a může blokovat nástroj — drž timeout nízký.</Mono>
    </div>
  </div>
);

const HooksScreen = ({ accent }) => {
  const [list, setList] = useStateHk(HOOKS_DATA);
  const [selId, setSelId] = useStateHk(HOOKS_DATA[0].id);
  const [editing, setEditing] = useStateHk(null);
  const [creating, setCreating] = useStateHk(false);
  const sel = list.find((h) => h.id === selId) || list[0];

  const update = (next) => setList((prev) => prev.map((h) => h.id === next.id ? next : h));
  const toggle = (id) => setList((prev) => prev.map((h) => h.id === id ? { ...h, enabled: !h.enabled } : h));
  const saveEdit = (next) => { update(next); setEditing(null); };
  const del = (id) => { setList((prev) => prev.filter((h) => h.id !== id)); setEditing(null); if (selId === id) setSelId((list.find((h) => h.id !== id) || {}).id); };
  const create = (draft) => {
    const id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('hook-' + Date.now());
    const next = { id, ...draft, enabled: true, fires: 0, lastFired: '—' };
    setList((prev) => [...prev, next]); setSelId(id); setCreating(false);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ flex: '0 0 320px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>Hooks</div>
            <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>Lifecycle hooky Claude Code — spouští se na eventy nástrojů.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((h) => <HookCard key={h.id} h={h} accent={accent} active={h.id === sel.id} onOpen={setSelId} />)}
          </div>
          <div style={{ marginTop: 16 }}><RunBtn accent={accent} label="Nový hook" icon="plus" onClick={() => setCreating(true)} /></div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {sel && <HookDetailScreen key={sel.id} hook={sel} accent={accent} onEdit={() => setEditing(sel)} onToggle={toggle} />}
        </div>
      </div>
      {editing && <HookFormModal hook={editing} isNew={false} accent={accent} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={del} />}
      {creating && <HookFormModal hook={{ name: '', event: 'PreToolUse', matcher: '', command: '', timeout: 5 }} isNew={true} accent={accent} onClose={() => setCreating(false)} onSave={create} onDelete={() => {}} />}
    </div>
  );
};

Object.assign(window, { HooksScreen, HookCard, HookFormModal, HookDetailScreen, Switch });

// ZIBBY velín — MCP servery: CRUD registrace MCP serverů (net-new, P0 #4).
// Systém: /mcp.
const { useState: useStateMcp } = React;

const MCP_TRANSPORT_C = { stdio: '#5b8def', sse: '#56c4d6', http: '#3fcf8e' };

const MCP_DATA = [
  { id: 'github', name: 'github', desc: 'Přístup k repozitářům, PR a issues', transport: 'stdio', command: 'npx @modelcontextprotocol/server-github', scope: 'user', enabled: true, env: [['GITHUB_TOKEN', '••••••••']], tools: ['list_repos', 'get_pr', 'create_issue'] },
  { id: 'postgres', name: 'postgres', desc: 'Read-only přístup k projektové DB', transport: 'stdio', command: 'npx @modelcontextprotocol/server-postgres', scope: 'project', enabled: true, env: [['DATABASE_URL', '••••••••']], tools: ['query', 'list_tables'] },
  { id: 'figma', name: 'figma', desc: 'Čtení Figma souborů a komponent', transport: 'sse', command: 'https://mcp.figma.com/sse', scope: 'user', enabled: false, env: [['FIGMA_TOKEN', '••••••••']], tools: ['get_file', 'get_components'] },
  { id: 'sentry', name: 'sentry', desc: 'Chybové eventy a issues ze Sentry', transport: 'http', command: 'https://mcp.sentry.io', scope: 'project', enabled: true, env: [['SENTRY_TOKEN', '••••••••']], tools: ['list_issues', 'get_event'] },
];

const McpSwitch = ({ on, accent, onToggle }) => (
  <button onClick={onToggle} title={on ? 'zapnuto' : 'vypnuto'} style={{ width: 42, height: 24, borderRadius: 24, padding: 3, cursor: 'pointer', display: 'flex', border: 'none', background: on ? `${accent}33` : 'rgba(255,255,255,0.08)', transition: 'background .16s' }}>
    <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? accent : Z.inkFaint, transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .16s, background .16s' }}></span>
  </button>
);

const TransportBadge = ({ t }) => {
  const c = MCP_TRANSPORT_C[t] || Z.inkDim;
  return <span style={{ fontFamily: Z.mono, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: Z.rCtl, color: c, background: `${c}16`, border: `1px solid ${c}44` }}>{t}</span>;
};

const McpCard = ({ m, accent, active, onOpen }) => (
  <div onClick={() => onOpen(m.id)} style={{
    display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 15px', cursor: 'pointer', opacity: m.enabled ? 1 : 0.55,
    background: active ? Z.panelHi : Z.panel, border: `1px solid ${active ? accent + '66' : Z.line}`, borderRadius: Z.rPanel,
    boxShadow: active ? `0 0 0 1px ${accent}22` : 'none', transition: 'all .14s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 28, height: 28, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent }}><Icon name="server" size={14} /></div>
      <Mono style={{ fontSize: 13, fontWeight: 700, color: Z.ink }}>{m.name}</Mono>
      <Dot color={m.enabled ? Z.ok : Z.inkFaint} size={6} />
    </div>
    <div style={{ fontSize: 11.5, color: Z.inkDim, lineHeight: 1.4 }}>{m.desc}</div>
    <div style={{ display: 'flex', gap: 6 }}><TransportBadge t={m.transport} /><Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{m.scope}</Mono></div>
  </div>
);

const McpTestResult = ({ state }) => {
  if (!state) return null;
  const ok = state === 'ok';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', borderRadius: Z.rCtl, background: ok ? `${Z.ok}10` : `${Z.bad}10`, border: `1px solid ${ok ? Z.ok + '33' : Z.bad + '33'}` }}>
      <Icon name={ok ? 'check' : 'x'} size={14} style={{ color: ok ? Z.ok : Z.bad }} />
      <Mono style={{ fontSize: 11, color: ok ? Z.ok : Z.bad }}>{ok ? 'Připojení funguje · odpověď 214ms' : 'Připojení selhalo · authentication error'}</Mono>
    </div>
  );
};

const McpFormModal = ({ mcp, isNew, accent, onClose, onSave, onDelete }) => {
  const [name, setName] = useStateMcp(mcp.name || '');
  const [desc, setDesc] = useStateMcp(mcp.desc || '');
  const [transport, setTransport] = useStateMcp(mcp.transport || 'stdio');
  const [command, setCommand] = useStateMcp(mcp.command || '');
  const [scope, setScope] = useStateMcp(mcp.scope || 'user');
  const [confirm, setConfirm] = useStateMcp(false);
  const [testState, setTestState] = useStateMcp(null);
  const [testing, setTesting] = useStateMcp(false);
  const valid = name.trim() && command.trim();
  const runTest = () => { setTesting(true); setTestState(null); setTimeout(() => { setTesting(false); setTestState(command.trim() ? 'ok' : 'err'); }, 900); };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '100%', maxHeight: '90%', overflow: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}><Icon name="server" size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>{isNew ? 'Nový MCP server' : 'Upravit MCP server'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>{isNew ? 'typ nelze po vytvoření změnit' : 'typ uzamčen'}</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><FieldLabel>Název</FieldLabel><TextInput mono value={name} onChange={setName} placeholder="github" /></div>
          <div><FieldLabel>Popis</FieldLabel><TextInput value={desc} onChange={setDesc} placeholder="K čemu server slouží" /></div>
          <div>
            <FieldLabel>Transport {!isNew && <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· uzamčeno</span>}</FieldLabel>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {['stdio', 'sse', 'http'].map((t) => (
                <button key={t} disabled={!isNew} onClick={() => setTransport(t)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 11px', cursor: isNew ? 'pointer' : 'default', borderRadius: Z.rCtl, color: transport === t ? Z.bg0 : MCP_TRANSPORT_C[t], background: transport === t ? MCP_TRANSPORT_C[t] : 'transparent', border: `1px solid ${MCP_TRANSPORT_C[t]}55`, opacity: !isNew && transport !== t ? 0.4 : 1 }}>{t}</button>
              ))}
            </div>
          </div>
          <div><FieldLabel>{transport === 'stdio' ? 'Příkaz' : 'URL'}</FieldLabel><TextInput mono value={command} onChange={setCommand} placeholder={transport === 'stdio' ? 'npx @modelcontextprotocol/server-…' : 'https://…'} /></div>
          <div>
            <FieldLabel>Scope</FieldLabel>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {['user', 'project'].map((s) => (
                <button key={s} onClick={() => setScope(s)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 11px', cursor: 'pointer', borderRadius: Z.rCtl, color: scope === s ? Z.bg0 : Z.inkDim, background: scope === s ? accent : 'transparent', border: `1px solid ${scope === s ? accent : Z.line}` }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <FieldLabel style={{ marginBottom: 0 }}>Test připojení</FieldLabel>
              <GhostBtn icon="pulse" accent={accent} onClick={runTest}>{testing ? 'Testuji…' : 'Otestovat'}</GhostBtn>
            </div>
            <McpTestResult state={testState} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew ? <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}><Icon name="trash" size={13} /> Smazat</button> : <div></div>}
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            <RunBtn accent={accent} icon={isNew ? 'plus' : 'check'} label={isNew ? 'Přidat server' : 'Uložit změny'}
              onClick={() => valid && onSave({ ...mcp, name: name.trim(), desc: desc.trim(), transport, command: command.trim(), scope })} />
          </div>
        </div>
      </div>
      {confirm && <ConfirmDialog title="Smazat MCP server?" message={<span>Opravdu odregistrovat <Mono style={{ color: Z.ink }}>{mcp.name}</Mono>? Agenti ztratí přístup k jeho nástrojům.</span>} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDelete(mcp.id); }} />}
    </div>
  );
};

const McpDetailScreen = ({ mcp, accent, onEdit, onToggle }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: Z.rPanel, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}><Icon name="server" size={22} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Mono style={{ fontSize: 19, fontWeight: 700, color: Z.ink }}>{mcp.name}</Mono>
        <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>{mcp.desc}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><TransportBadge t={mcp.transport} /><Mono style={{ fontSize: 10, color: Z.inkFaint }}>scope: {mcp.scope}</Mono></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <McpSwitch on={mcp.enabled} accent={accent} onToggle={() => onToggle(mcp.id)} />
        <GhostBtn icon="edit" onClick={onEdit}>Upravit</GhostBtn>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
      <Icon name="terminal" size={13} style={{ color: Z.inkFaint }} />
      <Mono style={{ fontSize: 11, color: Z.inkFaint, flex: 1 }}>{mcp.command}</Mono>
    </div>
    <HudPanel accent={accent} title="proměnné prostředí">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mcp.env.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
            <Mono style={{ fontSize: 11.5, color: Z.ink, flex: 1 }}>{k}</Mono>
            <Mono style={{ fontSize: 11.5, color: Z.inkFaint }}>{v}</Mono>
          </div>
        ))}
      </div>
    </HudPanel>
    <HudPanel accent={accent} title="nabízené nástroje">
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {mcp.tools.map((t) => <span key={t} style={{ fontFamily: Z.mono, fontSize: 11, color: Z.inkDim, background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, padding: '5px 10px' }}>{t}</span>)}
      </div>
    </HudPanel>
  </div>
);

const McpScreen = ({ accent }) => {
  const [list, setList] = useStateMcp(MCP_DATA);
  const [selId, setSelId] = useStateMcp(MCP_DATA[0].id);
  const [editing, setEditing] = useStateMcp(null);
  const [creating, setCreating] = useStateMcp(false);
  const sel = list.find((m) => m.id === selId) || list[0];

  const update = (next) => setList((prev) => prev.map((m) => m.id === next.id ? next : m));
  const toggle = (id) => setList((prev) => prev.map((m) => m.id === id ? { ...m, enabled: !m.enabled } : m));
  const saveEdit = (next) => { update(next); setEditing(null); };
  const del = (id) => { setList((prev) => prev.filter((m) => m.id !== id)); setEditing(null); if (selId === id) setSelId((list.find((m) => m.id !== id) || {}).id); };
  const create = (draft) => {
    const id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('mcp-' + Date.now());
    const next = { id, ...draft, enabled: true, env: [], tools: [] };
    setList((prev) => [...prev, next]); setSelId(id); setCreating(false);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ flex: '0 0 320px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>MCP servery</div>
            <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>Registrace nástrojových serverů (Model Context Protocol).</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((m) => <McpCard key={m.id} m={m} accent={accent} active={m.id === sel.id} onOpen={setSelId} />)}
          </div>
          <div style={{ marginTop: 16 }}><RunBtn accent={accent} label="Přidat server" icon="plus" onClick={() => setCreating(true)} /></div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {sel && <McpDetailScreen key={sel.id} mcp={sel} accent={accent} onEdit={() => setEditing(sel)} onToggle={toggle} />}
        </div>
      </div>
      {editing && <McpFormModal mcp={editing} isNew={false} accent={accent} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={del} />}
      {creating && <McpFormModal mcp={{ name: '', desc: '', transport: 'stdio', command: '', scope: 'user' }} isNew={true} accent={accent} onClose={() => setCreating(false)} onSave={create} onDelete={() => {}} />}
    </div>
  );
};

Object.assign(window, { McpScreen, McpCard, McpFormModal, McpDetailScreen });

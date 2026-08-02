// ZIBBY velín — Commands: katalog vlastních slash-příkazů (net-new, P0 #1).
// Systém: /commands, /commands/[id]. Katalog + detail/edit + create modal.
const { useState: useStateCmd } = React;

const COMMANDS_DATA = [
  { id: 'standup', name: '/standup', desc: 'Sepíše standup ze včerejších commitů', argHint: '[projekt]', tools: ['read', 'git'], model: 'sonnet', runs: 58, lastRun: '1h',
    prompt: 'Projdi commity za posledních 24h v $ARGUMENTS. Sepiš 3 odrážky: co bylo hotovo, co je dnes v plánu, jaké jsou blokace. Tón věcný, česky.' },
  { id: 'pr-brief', name: '/pr-brief', desc: 'Shrne otevřený PR do jedné zprávy', argHint: '<pr-číslo>', tools: ['read', 'git'], model: 'sonnet', runs: 34, lastRun: '3h',
    prompt: 'Načti diff PR #$ARGUMENTS. Shrň účel změny, rizika a co by měl reviewer zkontrolovat prioritně. Max 6 vět.' },
  { id: 'ship-it', name: '/ship-it', desc: 'Spustí PR Guard nad aktuální branchí', argHint: '', tools: ['git', 'bash'], model: 'sonnet', runs: 21, lastRun: 'včera',
    prompt: 'Spusť pipeline PR Guard nad aktuální branchí. Po dokončení nahlas výsledek review a zda je branch připravená na push.' },
  { id: 'digest', name: '/digest', desc: 'Denní shrnutí ze všech projektů', argHint: '', tools: ['read'], model: 'opus', runs: 12, lastRun: '2 dny',
    prompt: 'Projdi aktivitu za posledních 24h napříč projekty a sepiš stručný digest — max 8 odrážek, seřazeno podle důležitosti.' },
];

const CmdCard = ({ c, accent, active, onOpen }) => (
  <div onClick={() => onOpen(c.id)} style={{
    display: 'flex', flexDirection: 'column', gap: 8, padding: '13px 15px', cursor: 'pointer',
    background: active ? Z.panelHi : Z.panel, border: `1px solid ${active ? accent + '66' : Z.line}`, borderRadius: Z.rPanel,
    boxShadow: active ? `0 0 0 1px ${accent}22` : 'none', transition: 'all .14s',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Mono style={{ fontSize: 13.5, fontWeight: 700, color: accent }}>{c.name}</Mono>
      <Mono style={{ fontSize: 9.5, color: Z.inkFaint, marginLeft: 'auto' }}>{c.runs}×</Mono>
    </div>
    <div style={{ fontSize: 12, color: Z.inkDim, lineHeight: 1.4 }}>{c.desc}</div>
  </div>
);

const CommandFormModal = ({ cmd, isNew, accent, onClose, onSave, onDelete }) => {
  const [name, setName] = useStateCmd(cmd.name || '/');
  const [desc, setDesc] = useStateCmd(cmd.desc || '');
  const [argHint, setArgHint] = useStateCmd(cmd.argHint || '');
  const [prompt, setPrompt] = useStateCmd(cmd.prompt || '');
  const [tools, setTools] = useStateCmd((cmd.tools || []).join(', '));
  const [model, setModel] = useStateCmd(cmd.model || 'sonnet');
  const [confirm, setConfirm] = useStateCmd(false);
  const valid = /^\/[a-z0-9-]+$/.test(name.trim()) && prompt.trim().length > 0;
  const MODEL_C = { opus: '#b07cff', sonnet: '#56c4d6', haiku: '#7fd98a' };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', maxHeight: '90%', overflow: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}><Icon name="terminal" size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>{isNew ? 'Nový příkaz' : 'Upravit příkaz'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>~/.claude/commands/{(name || '').replace(/^\//, '') || 'název'}.md</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}><FieldLabel>Název příkazu</FieldLabel><TextInput mono value={name} onChange={setName} placeholder="/standup" /></div>
            <div style={{ flex: 1 }}><FieldLabel>Argument hint <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· volitelné</span></FieldLabel><TextInput mono value={argHint} onChange={setArgHint} placeholder="[projekt]" /></div>
          </div>
          <div><FieldLabel>Popis</FieldLabel><TextInput value={desc} onChange={setDesc} placeholder="Co příkaz udělá jednou větou" /></div>
          <div>
            <FieldLabel>Prompt template <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· $ARGUMENTS se nahradí zadáním</span></FieldLabel>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} style={{ width: '100%', marginTop: 7, padding: '10px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, color: Z.ink, fontFamily: Z.mono, fontSize: 12.5, lineHeight: 1.6, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Model</FieldLabel>
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                {['opus', 'sonnet', 'haiku'].map((m) => (
                  <button key={m} onClick={() => setModel(m)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 10px', cursor: 'pointer', borderRadius: Z.rCtl, color: model === m ? Z.bg0 : (MODEL_C[m] || Z.inkDim), background: model === m ? (MODEL_C[m] || accent) : 'transparent', border: `1px solid ${MODEL_C[m] || Z.line}55` }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}><FieldLabel>Povolené nástroje</FieldLabel><TextInput mono value={tools} onChange={setTools} placeholder="read, write, bash…" /></div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew ? (
            <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}><Icon name="trash" size={13} /> Smazat</button>
          ) : <div></div>}
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            <RunBtn accent={accent} icon={isNew ? 'plus' : 'check'} label={isNew ? 'Vytvořit příkaz' : 'Uložit změny'}
              onClick={() => valid && onSave({ ...cmd, name: name.trim(), desc: desc.trim(), argHint: argHint.trim(), prompt: prompt.trim(), tools: tools.split(',').map((s) => s.trim()).filter(Boolean), model })} />
          </div>
        </div>
      </div>
      {confirm && <ConfirmDialog title="Smazat příkaz?" message={<span>Opravdu smazat <Mono style={{ color: Z.ink }}>{cmd.name}</Mono>? Soubor se odstraní z <Mono style={{ color: Z.ink }}>~/.claude/commands/</Mono>.</span>} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDelete(cmd.id); }} />}
    </div>
  );
};

const CommandDetailScreen = ({ cmd, accent, onEdit }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: Z.rPanel, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}><Icon name="terminal" size={22} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Mono style={{ fontSize: 21, fontWeight: 700, color: Z.ink }}>{cmd.name}</Mono>
          {cmd.argHint && <Mono style={{ fontSize: 12, color: Z.inkFaint }}>{cmd.argHint}</Mono>}
        </div>
        <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>{cmd.desc}</div>
      </div>
      <GhostBtn icon="edit" onClick={onEdit}>Upravit</GhostBtn>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
      <Icon name="file" size={13} style={{ color: Z.inkFaint }} />
      <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>~/.claude/commands/{cmd.id}.md</Mono>
    </div>
    <HudPanel accent={accent} title="prompt template">
      <div style={{ padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, fontFamily: Z.mono, fontSize: 12, color: Z.inkDim, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{cmd.prompt}</div>
    </HudPanel>
    <HudPanel accent={accent} title="konfigurace">
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>MODEL</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{cmd.model}</Mono></div>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>NÁSTROJE</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{(cmd.tools || []).join(', ') || '—'}</Mono></div>
        <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>SPUŠTĚNO</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{cmd.runs}× · naposled {cmd.lastRun}</Mono></div>
      </div>
    </HudPanel>
  </div>
);

const CommandsScreen = ({ accent }) => {
  const [list, setList] = useStateCmd(COMMANDS_DATA);
  const [selId, setSelId] = useStateCmd(COMMANDS_DATA[0].id);
  const [editing, setEditing] = useStateCmd(null);
  const [creating, setCreating] = useStateCmd(false);
  const sel = list.find((c) => c.id === selId) || list[0];

  const update = (next) => setList((prev) => prev.map((c) => c.id === next.id ? next : c));
  const saveEdit = (next) => { update(next); setEditing(null); };
  const del = (id) => { setList((prev) => prev.filter((c) => c.id !== id)); setEditing(null); if (selId === id) setSelId((list.find((c) => c.id !== id) || {}).id); };
  const create = (draft) => {
    const id = draft.name.replace(/^\//, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-') || ('cmd-' + Date.now());
    const next = { id, name: draft.name, desc: draft.desc, argHint: draft.argHint, prompt: draft.prompt, tools: draft.tools, model: draft.model, runs: 0, lastRun: '—' };
    setList((prev) => [...prev, next]); setSelId(id); setCreating(false);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ flex: '0 0 320px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>Commands</div>
            <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>Vlastní slash-příkazy pro Claude Code.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((c) => <CmdCard key={c.id} c={c} accent={accent} active={c.id === sel.id} onOpen={setSelId} />)}
          </div>
          <div style={{ marginTop: 16 }}><RunBtn accent={accent} label="Nový příkaz" icon="plus" onClick={() => setCreating(true)} /></div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {sel && <CommandDetailScreen key={sel.id} cmd={sel} accent={accent} onEdit={() => setEditing(sel)} />}
        </div>
      </div>
      {editing && <CommandFormModal cmd={editing} isNew={false} accent={accent} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={del} />}
      {creating && <CommandFormModal cmd={{ name: '/', desc: '', argHint: '', prompt: '', tools: [], model: 'sonnet' }} isNew={true} accent={accent} onClose={() => setCreating(false)} onSave={create} onDelete={() => {}} />}
    </div>
  );
};

Object.assign(window, { CommandsScreen, CmdCard, CommandFormModal, CommandDetailScreen });

// ZIBBY velín — Signály: výběr druhu signálu + create/detail (net-new, P0 #5).
// Systém: /signals, /signals/new, /signals/[id].
const { useState: useStateSig } = React;

const SIGNAL_KINDS = [
  { id: 'event', label: 'Událost', glyph: 'bolt', c: '#f0b429', desc: 'Reaguje na konkrétní událost v systému (PR otevřen, soubor přibyl…)' },
  { id: 'threshold', label: 'Práh', glyph: 'pulse', c: '#ff6b6b', desc: 'Spustí se, když metrika překročí zadaný práh' },
  { id: 'schedule', label: 'Rozvrh', glyph: 'clock', c: '#5b8def', desc: 'Pravidelný časový puls, který mohou naslouchat automatizace' },
  { id: 'webhook', label: 'Webhook', glyph: 'link', c: '#56c4d6', desc: 'Externí systém pošle payload na endpoint' },
  { id: 'manual', label: 'Ruční', glyph: 'terminal', c: '#b07cff', desc: 'Vyvoláš ho ty sám — tlačítkem nebo příkazem' },
];
const kindOf = (id) => SIGNAL_KINDS.find((k) => k.id === id) || SIGNAL_KINDS[0];

const SIGNALS_DATA = [
  { id: 'sig-pr-opened', name: 'PR otevřen', kind: 'event', source: 'GitHub · zibby-core', desc: 'Nový pull request otevřen v repozitáři', status: 'active', lastFired: '11m', subscribers: 2 },
  { id: 'sig-ci-red', name: 'CI selhalo', kind: 'event', source: 'GitHub Actions', desc: 'Pipeline CI skončila s chybou na main', status: 'active', lastFired: '2h', subscribers: 3 },
  { id: 'sig-cost-cap', name: 'Rozpočet nad 80 %', kind: 'threshold', source: 'Agent SDK kredit', desc: 'Měsíční čerpání překročilo 80 % stropu', status: 'active', lastFired: '—', subscribers: 1 },
  { id: 'sig-morning', name: 'Ranní puls 08:00', kind: 'schedule', source: 'interní scheduler', desc: 'Denní puls pro ranní briefing a standup', status: 'active', lastFired: 'dnes 08:00', subscribers: 4 },
  { id: 'sig-sentry-spike', name: 'Sentry error spike', kind: 'webhook', source: 'sentry.io', desc: 'Sentry pošle webhook při nárůstu chybovosti', status: 'paused', lastFired: '3 dny', subscribers: 1 },
  { id: 'sig-manual-deploy', name: 'Deploy ruční spuštění', kind: 'manual', source: 'velín', desc: 'Operátor ručně vyvolá signál před deploy sekvencí', status: 'active', lastFired: 'včera 17:40', subscribers: 1 },
];

const SigStatusDot = ({ status }) => <Dot color={status === 'active' ? Z.ok : Z.inkFaint} pulse={false} size={7} />;

const SigCard = ({ s, accent, active, onOpen }) => {
  const k = kindOf(s.kind);
  return (
    <div onClick={() => onOpen(s.id)} style={{
      display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 15px', cursor: 'pointer', opacity: s.status === 'active' ? 1 : 0.6,
      background: active ? Z.panelHi : Z.panel, border: `1px solid ${active ? accent + '66' : Z.line}`, borderRadius: Z.rPanel,
      boxShadow: active ? `0 0 0 1px ${accent}22` : 'none', transition: 'all .14s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 28, height: 28, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${k.c}1c`, color: k.c }}><Icon name={k.glyph} size={14} /></div>
        <div style={{ fontSize: 13, fontWeight: 600, color: Z.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
        <SigStatusDot status={s.status} />
      </div>
      <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{s.source}</Mono>
    </div>
  );
};

// ── krok 1: výběr druhu signálu ────────────────────────────────────────────
const KindPicker = ({ selected, onSelect }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {SIGNAL_KINDS.map((k) => (
      <div key={k.id} onClick={() => onSelect(k.id)} style={{
        display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px', cursor: 'pointer',
        background: selected === k.id ? `${k.c}12` : Z.bg0, border: `1px solid ${selected === k.id ? k.c + '77' : Z.line}`, borderRadius: Z.rCtl, transition: 'all .12s',
      }}>
        <div style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${k.c}1c`, color: k.c }}><Icon name={k.glyph} size={15} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: Z.ink }}>{k.label}</div>
          <div style={{ fontSize: 11, color: Z.inkDim, marginTop: 3, lineHeight: 1.4 }}>{k.desc}</div>
        </div>
      </div>
    ))}
  </div>
);

const SignalFormModal = ({ sig, isNew, accent, onClose, onSave, onDelete }) => {
  const [step, setStep] = useStateSig(isNew ? 1 : 2);
  const [kind, setKind] = useStateSig(sig.kind || 'event');
  const [name, setName] = useStateSig(sig.name || '');
  const [source, setSource] = useStateSig(sig.source || '');
  const [desc, setDesc] = useStateSig(sig.desc || '');
  const [confirm, setConfirm] = useStateSig(false);
  const k = kindOf(kind);
  const valid = name.trim() && source.trim();
  const KIND_FIELD_LABEL = { event: 'Zdroj události', threshold: 'Sledovaná metrika', schedule: 'Zdroj pulsu', webhook: 'Endpoint / odesílatel', manual: 'Kde se vyvolává' };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '100%', maxHeight: '90%', overflow: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${k.c}1c`, color: k.c, border: `1px solid ${k.c}44` }}><Icon name={k.glyph} size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>{isNew ? (step === 1 ? 'Nový signál — druh' : 'Nový signál — detail') : 'Upravit signál'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>{isNew ? `krok ${step}/2` : k.label}</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isNew && step === 1 ? (
            <KindPicker selected={kind} onSelect={setKind} />
          ) : (
            <React.Fragment>
              <div><FieldLabel>Název signálu</FieldLabel><TextInput value={name} onChange={setName} placeholder="např. PR otevřen" /></div>
              <div><FieldLabel>{KIND_FIELD_LABEL[kind]}</FieldLabel><TextInput mono value={source} onChange={setSource} placeholder="GitHub · repozitář, metrika, endpoint…" /></div>
              <div><FieldLabel>Popis</FieldLabel><TextInput value={desc} onChange={setDesc} placeholder="Kdy signál nastane, jednou větou" /></div>
            </React.Fragment>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew ? <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}><Icon name="trash" size={13} /> Smazat</button>
            : (step === 2 ? <button onClick={() => setStep(1)} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>← zpět</button> : <div></div>)}
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            {isNew && step === 1
              ? <RunBtn accent={accent} label="Pokračovat" icon="arrow" onClick={() => setStep(2)} />
              : <RunBtn accent={accent} icon={isNew ? 'plus' : 'check'} label={isNew ? 'Vytvořit signál' : 'Uložit změny'}
                  onClick={() => valid && onSave({ ...sig, name: name.trim(), kind, source: source.trim(), desc: desc.trim() })} />}
          </div>
        </div>
      </div>
      {confirm && <ConfirmDialog title="Smazat signál?" message={<span>Opravdu smazat <Mono style={{ color: Z.ink }}>{sig.name}</Mono>? Automatizace a handoff pravidla napojená na tento signál přestanou fungovat.</span>} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDelete(sig.id); }} />}
    </div>
  );
};

const SignalDetailScreen = ({ sig, accent, onEdit }) => {
  const k = kindOf(sig.kind);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: Z.rPanel, display: 'grid', placeItems: 'center', background: `${k.c}1c`, color: k.c, border: `1px solid ${k.c}33` }}><Icon name={k.glyph} size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: Z.sans, fontSize: 19, fontWeight: 600, color: Z.ink }}>{sig.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}>
            <span style={{ fontFamily: Z.mono, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: Z.rCtl, color: k.c, background: `${k.c}16`, border: `1px solid ${k.c}44` }}>{k.label}</span>
            <SigStatusDot status={sig.status} />
            <Mono style={{ fontSize: 11, color: Z.inkFaint }}>{sig.status === 'active' ? 'aktivní' : 'pozastaveno'}</Mono>
          </div>
        </div>
        <GhostBtn icon="edit" onClick={onEdit}>Upravit</GhostBtn>
      </div>
      <div style={{ fontSize: 13, color: Z.inkDim, lineHeight: 1.5 }}>{sig.desc}</div>
      <HudPanel accent={accent} title="zdroj">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
          <Icon name="link" size={13} style={{ color: Z.inkFaint }} />
          <Mono style={{ fontSize: 11.5, color: Z.ink }}>{sig.source}</Mono>
        </div>
      </HudPanel>
      <HudPanel accent={accent} title="statistiky">
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>NAPOSLED VYVOLÁN</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{sig.lastFired}</Mono></div>
          <div><Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>ODBĚRATELÉ</Mono><Mono style={{ fontSize: 13, color: Z.ink, marginTop: 4, display: 'block' }}>{sig.subscribers}× handoff pravidlo</Mono></div>
        </div>
      </HudPanel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: `${Z.run}0e`, border: `1px solid ${Z.run}33`, borderRadius: Z.rCtl }}>
        <Icon name="flow" size={14} style={{ color: Z.run }} />
        <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>Signály se napojují na handoff pravidla — viz <a href="ZIBBY Handoff.html" style={{ color: Z.run }}>Handoff</a>.</Mono>
      </div>
    </div>
  );
};

const SignalsScreen = ({ accent }) => {
  const [list, setList] = useStateSig(SIGNALS_DATA);
  const [selId, setSelId] = useStateSig(SIGNALS_DATA[0].id);
  const [editing, setEditing] = useStateSig(null);
  const [creating, setCreating] = useStateSig(false);
  const sel = list.find((s) => s.id === selId) || list[0];

  const update = (next) => setList((prev) => prev.map((s) => s.id === next.id ? next : s));
  const saveEdit = (next) => { update(next); setEditing(null); };
  const del = (id) => { setList((prev) => prev.filter((s) => s.id !== id)); setEditing(null); if (selId === id) setSelId((list.find((s) => s.id !== id) || {}).id); };
  const create = (draft) => {
    const id = 'sig-' + (draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now());
    const next = { id, ...draft, status: 'active', lastFired: '—', subscribers: 0 };
    setList((prev) => [...prev, next]); setSelId(id); setCreating(false);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ flex: '0 0 320px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>Signály</div>
            <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>Vstupy pro handoff a automatizace — pětice druhů signálu.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((s) => <SigCard key={s.id} s={s} accent={accent} active={s.id === sel.id} onOpen={setSelId} />)}
          </div>
          <div style={{ marginTop: 16 }}><RunBtn accent={accent} label="Nový signál" icon="plus" onClick={() => setCreating(true)} /></div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {sel && <SignalDetailScreen key={sel.id} sig={sel} accent={accent} onEdit={() => setEditing(sel)} />}
        </div>
      </div>
      {editing && <SignalFormModal sig={editing} isNew={false} accent={accent} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={del} />}
      {creating && <SignalFormModal sig={{ name: '', kind: 'event', source: '', desc: '' }} isNew={true} accent={accent} onClose={() => setCreating(false)} onSave={create} onDelete={() => {}} />}
    </div>
  );
};

Object.assign(window, { SignalsScreen, SIGNAL_KINDS, kindOf, SigCard, SignalFormModal, SignalDetailScreen });

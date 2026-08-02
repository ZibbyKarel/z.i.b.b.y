// ZIBBY velín — Handoff: inline mad-libs editor pravidel předávání (net-new, P0 #6).
// Řádkový editor „signál → cíl → tier" přímo v drawer podsystému (ne modal).
const { useState: useStateHo } = React;

const SUBSYSTEMS = ['Forge', 'Puls', 'Sentinel', 'Maestro', 'Beacon', 'Scout', 'Herald', 'Loom', 'Codex', 'Ledger', 'Hearth'];
const SUBSYS_GLYPH = { Forge: 'code', Puls: 'pulse', Sentinel: 'shield', Maestro: 'flow', Beacon: 'bolt', Scout: 'search', Herald: 'chat', Loom: 'doc', Codex: 'brain', Ledger: 'dollar', Hearth: 'server' };

const HO_SIGNALS = ['PR otevřen', 'CI selhalo', 'Rozpočet nad 80 %', 'Ranní puls 08:00', 'Sentry error spike', 'Deploy ruční spuštění', 'Test selhal', 'Nový issue'];
const HO_TARGETS = [...SUBSYSTEMS, 'Kodér (agent)', 'Reviewer (agent)', 'PR Guard (pipeline)', 'Ranní briefing'];
const HO_TIERS = { auto: { label: 'automaticky', c: Z.ok, desc: 'proběhne bez čekání na tebe' }, notify: { label: 'jen oznámit', c: Z.run, desc: 'proběhne a zaloguje se do aktivity' }, approve: { label: 'čeká na schválení', c: Z.warn, desc: 'zastaví se ve frontě, dokud nerozhodneš' } };

const mkRules = (owner) => ([
  { id: owner + '-1', signal: 'PR otevřen', target: 'Reviewer (agent)', tier: 'auto' },
  { id: owner + '-2', signal: 'CI selhalo', target: owner === 'Sentinel' ? 'Forge' : 'Sentinel', tier: 'notify' },
  { id: owner + '-3', signal: 'Rozpočet nad 80 %', target: 'Ledger', tier: 'approve' },
]);

const HANDOFF_RULES_BY_SUBSYSTEM = Object.fromEntries(SUBSYSTEMS.map((s) => [s, mkRules(s)]));

// ── inline "mad-libs" select — vypadá jako text, chová se jako dropdown ────
const InlineSelect = ({ value, options, color, onChange, mono = true }) => {
  const [open, setOpen] = useStateHo(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, background: `${color}14`, border: `1px solid ${color}44`,
        borderRadius: Z.rCtl, padding: '3px 9px', cursor: 'pointer', color, fontFamily: mono ? Z.mono : Z.sans, fontSize: 13, fontWeight: 600,
      }}>
        {value}<Icon name="chevron" size={11} style={{ transform: 'rotate(90deg)', opacity: 0.7 }} />
      </button>
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}></div>
          <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 50, minWidth: 190, maxHeight: 260, overflowY: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rCtl, boxShadow: '0 18px 44px rgba(0,0,0,0.55)', padding: 4 }}>
            {options.map((opt) => (
              <div key={opt} onClick={() => { onChange(opt); setOpen(false); }} style={{ padding: '7px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: Z.mono, fontSize: 12, color: opt === value ? color : Z.inkDim, background: opt === value ? `${color}14` : 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.background = opt === value ? `${color}14` : 'rgba(255,255,255,0.04)'}
                onMouseLeave={(e) => e.currentTarget.style.background = opt === value ? `${color}14` : 'transparent'}>{opt}</div>
            ))}
          </div>
        </React.Fragment>
      )}
    </span>
  );
};

const RuleRow = ({ rule, accent, onChange, onDelete }) => {
  const tier = HO_TIERS[rule.tier];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13.5, color: Z.inkDim, lineHeight: 2.1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Když</span>
        <InlineSelect value={rule.signal} options={HO_SIGNALS} color={Z.run} onChange={(v) => onChange({ ...rule, signal: v })} />
        <span>→ předej</span>
        <InlineSelect value={rule.target} options={HO_TARGETS} color={accent} onChange={(v) => onChange({ ...rule, target: v })} />
        <span>jako</span>
        <InlineSelect value={tier.label} options={Object.values(HO_TIERS).map((t) => t.label)} color={tier.c} onChange={(v) => { const id = Object.keys(HO_TIERS).find((k) => HO_TIERS[k].label === v); onChange({ ...rule, tier: id }); }} />
      </div>
      <button onClick={() => onDelete(rule.id)} title="Smazat pravidlo" style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4, flex: '0 0 auto' }}><Icon name="x" size={15} /></button>
    </div>
  );
};

// ── simulace drawer podsystému ─────────────────────────────────────────────
const SubsystemTab = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{ fontFamily: Z.mono, fontSize: 11.5, fontWeight: 600, padding: '8px 14px', cursor: 'pointer', color: active ? Z.ink : Z.inkFaint, background: 'transparent', border: 'none', borderBottom: active ? `2px solid ${Z.work}` : '2px solid transparent' }}>{children}</button>
);

const SubsystemDrawer = ({ name, accent }) => {
  const [tab, setTab] = useStateHo('handoff');
  const [rules, setRules] = useStateHo(HANDOFF_RULES_BY_SUBSYSTEM[name]);
  React.useEffect(() => { setRules(HANDOFF_RULES_BY_SUBSYSTEM[name]); setTab('handoff'); }, [name]);

  const update = (next) => setRules((prev) => prev.map((r) => r.id === next.id ? next : r));
  const del = (id) => setRules((prev) => prev.filter((r) => r.id !== id));
  const add = () => setRules((prev) => [...prev, { id: name + '-' + Date.now(), signal: HO_SIGNALS[0], target: HO_TARGETS[0], tier: 'notify' }]);

  return (
    <div style={{ background: Z.panel, border: `1px solid ${Z.line}`, borderRadius: Z.rPanel, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${Z.line}` }}>
        <div style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}><Icon name={SUBSYS_GLYPH[name] || 'flow'} size={18} /></div>
        <div>
          <div style={{ fontFamily: Z.sans, fontSize: 16, fontWeight: 600, color: Z.ink }}>{name}</div>
          <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>podsystém · drawer</Mono>
        </div>
      </div>
      <div style={{ display: 'flex', padding: '0 16px', borderBottom: `1px solid ${Z.line}` }}>
        <SubsystemTab active={tab === 'overview'} onClick={() => setTab('overview')}>Přehled</SubsystemTab>
        <SubsystemTab active={tab === 'gates'} onClick={() => setTab('gates')}>Gates</SubsystemTab>
        <SubsystemTab active={tab === 'handoff'} onClick={() => setTab('handoff')}>Handoff</SubsystemTab>
      </div>
      <div style={{ padding: 20 }}>
        {tab === 'handoff' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Mono style={{ fontSize: 10.5, color: Z.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pravidla předávání · {rules.length}</Mono>
              <GhostBtn icon="plus" accent={accent} onClick={add}>Přidat pravidlo</GhostBtn>
            </div>
            {rules.map((r) => <RuleRow key={r.id} rule={r} accent={accent} onChange={update} onDelete={del} />)}
            {!rules.length && <div style={{ padding: '18px 12px', border: `1px dashed ${Z.line}`, borderRadius: Z.rCtl, textAlign: 'center' }}><Mono style={{ fontSize: 11, color: Z.inkFaint }}>Žádná pravidla — přidej první výše.</Mono></div>}
          </div>
        )}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: Z.inkDim, lineHeight: 1.6 }}>Podsystém {name} — přehled zdraví, aktivních běhů a poslední aktivity by se zobrazoval zde.</div>
            <div style={{ padding: '16px', border: `1px dashed ${Z.line}`, borderRadius: Z.rCtl, textAlign: 'center' }}><Mono style={{ fontSize: 11, color: Z.inkFaint }}>Mimo rozsah tohoto mockupu — viz Handoff tab.</Mono></div>
          </div>
        )}
        {tab === 'gates' && (
          <div style={{ padding: '16px', border: `1px dashed ${Z.line}`, borderRadius: Z.rCtl, textAlign: 'center' }}><Mono style={{ fontSize: 11, color: Z.inkFaint }}>Gates tab — subsystémová pravidla schvalování, viz P1 #11.</Mono></div>
        )}
      </div>
    </div>
  );
};

const HandoffScreen = ({ accent }) => {
  const [active, setActive] = useStateHo(SUBSYSTEMS[0]);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ flex: '0 0 220px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>Handoff</div>
            <div style={{ fontSize: 12.5, color: Z.inkDim, marginTop: 4, lineHeight: 1.5 }}>Mad-libs editor pravidel „signál → cíl → tier" uvnitř drawer podsystému.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {SUBSYSTEMS.map((s) => (
              <div key={s} onClick={() => setActive(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: Z.rCtl, cursor: 'pointer', color: active === s ? Z.ink : Z.inkDim, background: active === s ? Z.workDim : 'transparent' }}>
                <Icon name={SUBSYS_GLYPH[s] || 'flow'} size={14} style={{ color: active === s ? accent : Z.inkFaint }} />
                <span style={{ fontSize: 13, fontWeight: active === s ? 600 : 500 }}>{s}</span>
                <Mono style={{ fontSize: 9.5, color: Z.inkFaint, marginLeft: 'auto' }}>{HANDOFF_RULES_BY_SUBSYSTEM[s].length}</Mono>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <SubsystemDrawer key={active} name={active} accent={accent} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { HandoffScreen, SUBSYSTEMS, HANDOFF_RULES_BY_SUBSYSTEM, RuleRow, InlineSelect, SubsystemDrawer });

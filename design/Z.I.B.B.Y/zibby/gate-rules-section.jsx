// ZIBBY velín — Pravidla schvalování (Gate Rules) · card, sekce, modal, rámec
// Loads after gate-rules-core.jsx. Reuses: Z, Icon, Mono, FieldLabel, TextInput,
// ChipToggle, GhostBtn, RunBtn, Corners, SectionLabel, GatedBadge, ModelBadge, ThinkBadge.
const { useState: useStateGR2 } = React;
let RID = 100;
const newRid = () => 'r' + (++RID);

// ---- karta pravidla -------------------------------------------------------
const RuleCard = ({ rule, locked = false, index, onEdit, onDelete, onReorder, dragState }) => {
  const [h, setH] = useStateGR2(false);
  const [menu, setMenu] = useStateGR2(false);
  const d = DECISION[rule.decision] || DECISION.ask;
  const mt = MATCHER[rule.type] || MATCHER.action;
  const dragging = dragState && dragState.from === index;
  const over = dragState && dragState.over === index && dragState.from !== index;

  return (
    <div
      draggable={!locked}
      onDragEnd={() => onReorder('end', index)}
      onDragOver={(e) => { if (locked) return; e.preventDefault(); onReorder('over', index); }}
      onDragStart={(e) => { if (locked) return; e.dataTransfer.effectAllowed = 'move'; onReorder('start', index); }}
      onDrop={(e) => { if (locked) return; e.preventDefault(); onReorder('drop', index); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => { setH(false); setMenu(false); }}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 9,
        background: locked ? 'rgba(255,255,255,0.015)' : (h ? Z.panelHi : Z.panel),
        border: `1px solid ${over ? d.c + '88' : (h && !locked ? d.c + '44' : Z.line)}`,
        borderLeft: `3px solid ${d.c}${locked ? '88' : 'ff'}`,
        borderRadius: 2, padding: '11px 12px 11px 13px', transition: 'background .14s, border-color .14s',
        cursor: locked ? 'default' : 'grab', opacity: dragging ? 0.4 : 1,
      }}>

      {/* line 1: handle / lock · matcher · menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 16, color: locked ? Z.warn : (h ? Z.inkDim : Z.inkFaint) }} title={locked ? 'systémové pravidlo' : (mt.label + ' — táhni pro pořadí')}>
          {locked ? <Icon name="shield" size={13} /> : (h ? <Icon name="dots" size={15} /> : <Icon name={mt.icon} size={14} />)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}><MatcherText rule={rule} /></div>

        {locked ? (
          <span style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', color: Z.inkFaint }} title="Zděděno ze systémové politiky — nelze upravit">
            <Icon name="link" size={13} style={{ opacity: 0 }} />
          </span>
        ) : (
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} style={{ display: h || menu ? 'grid' : 'none', placeItems: 'center', width: 24, height: 24, cursor: 'pointer', borderRadius: 2, background: menu ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${menu ? Z.line : 'transparent'}`, color: Z.inkDim }}
              title="Možnosti">
              <Icon name="dots" size={15} />
            </button>
            {menu && (
              <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 28, right: 0, zIndex: 30, minWidth: 140, background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 3, boxShadow: '0 12px 34px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4 }}>
                <MenuItem icon="edit" onClick={() => { setMenu(false); onEdit(rule); }}>Upravit</MenuItem>
                <MenuItem danger icon="trash" onClick={() => { setMenu(false); onDelete(rule.id); }}>Smazat</MenuItem>
              </div>
            )}
          </div>
        )}
      </div>

      {/* line 2: decision + resolution */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', paddingLeft: 25 }}>
        <DecisionBadge decision={rule.decision} />
        {rule.decision === 'ask' && <ResolutionChips mode={rule.mode} resolution={rule.resolution} />}
        {rule.decision === 'notify' && <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>→ activity feed</Mono>}
      </div>
    </div>
  );
};

const MenuItem = ({ icon, children, onClick, danger }) => {
  const [h, setH] = useStateGR2(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', cursor: 'pointer', borderRadius: 2, border: 'none', fontFamily: Z.mono, fontSize: 12, color: danger ? Z.bad : (h ? Z.ink : Z.inkDim), background: h ? (danger ? 'rgba(255,107,107,0.1)' : 'rgba(255,255,255,0.05)') : 'transparent' }}>
      <Icon name={icon} size={13} /> {children}
    </button>
  );
};

// ---- detailní sekce: PRAVIDLA SCHVALOVÁNÍ --------------------------------
const SYSTEM_RULES = [
  { id: 'sys-purchase', type: 'action', label: 'purchase', sub: 'Rohlík · Tesco', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all' },
  { id: 'sys-payment', type: 'action', label: 'payment', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all' },
  { id: 'sys-delete', type: 'action', label: 'delete', pattern: 'mimo /tmp', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all' },
];
const DEFAULT_AGENT_RULES = [
  { id: 'r-rmrf', type: 'tool', tool: 'bash', pattern: 'rm -rf*', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all' },
  { id: 'r-pushmain', type: 'tool', tool: 'git', verb: 'push', pattern: 'main', decision: 'ask', resolution: [{ kind: 'human' }], mode: 'all' },
  { id: 'r-merge', type: 'action', label: 'merge', sub: 'PR', decision: 'ask', resolution: [{ kind: 'check', name: 'ci_green' }, { kind: 'human' }], mode: 'all' },
  { id: 'r-pushfeat', type: 'tool', tool: 'git', verb: 'push', pattern: 'feature/*', decision: 'allow', resolution: [] },
];

const GroupHeading = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
    <Mono style={{ fontSize: 9.5, letterSpacing: '0.16em', color: Z.inkFaint, textTransform: 'uppercase' }}>{children}</Mono>
    <div style={{ flex: 1, height: 1, background: Z.line }} />
    {right}
  </div>
);

// ---- picker globálních pravidel (inline dropdown) -------------------------
const GlobalRulePicker = ({ globalRules, linkedIds, accent, onLink, onClose }) => {
  const available = (globalRules || []).filter(r => !(linkedIds || []).includes(r.id));
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 210,
        background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 3,
        boxShadow: '0 12px 34px rgba(0,0,0,0.55)', maxHeight: 260, overflowY: 'auto', padding: 4,
      }}>
        {available.length === 0 && (
          <div style={{ padding: '12px 11px', textAlign: 'center' }}>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>Všechna globální pravidla jsou přilinkována.</Mono>
          </div>
        )}
        {available.map(r => {
          const d = DECISION[r.decision] || DECISION.ask;
          return (
            <button key={r.id} onClick={() => { onLink(r.id); onClose(); }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '9px 11px',
              cursor: 'pointer', background: 'transparent', border: 'none', borderLeft: `3px solid ${d.c}`,
              borderRadius: 2, marginBottom: 2, textAlign: 'left', transition: 'background .12s',
            }}>
              <Icon name={(MATCHER[r.type] || MATCHER.action).icon} size={13} style={{ flex: '0 0 auto', color: Z.inkFaint, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.name && <Mono style={{ fontSize: 11.5, fontWeight: 600, color: Z.ink }}>{r.name}</Mono>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><MatcherText rule={r} /></div>
              </div>
              <DecisionBadge decision={r.decision} />
            </button>
          );
        })}
      </div>
    </>
  );
};

// ---- detailní sekce: PRAVIDLA SCHVALOVÁNÍ --------------------------------
const ApprovalRulesSection = ({ accent, agentName = 'Tester', globalRules = [], linkedRuleIds = [], onLinkedChange }) => {
  const [rules, setRules] = useStateGR2(DEFAULT_AGENT_RULES);
  const [editing, setEditing] = useStateGR2(null);
  const [drag, setDrag] = useStateGR2(null);
  const [pickerOpen, setPickerOpen] = useStateGR2(false);

  const linkedRules = (globalRules || []).filter(r => (linkedRuleIds || []).includes(r.id));

  const onReorder = (phase, index) => {
    if (phase === 'start') setDrag({ from: index, over: index });
    else if (phase === 'over') setDrag((s) => (s ? { ...s, over: index } : s));
    else if (phase === 'drop') setDrag((s) => {
      if (!s || s.from === index) return null;
      setRules((prev) => { const a = [...prev]; const [m] = a.splice(s.from, 1); a.splice(index, 0, m); return a; });
      return null;
    });
    else setDrag(null);
  };
  const save = (rule) => {
    setRules((prev) => prev.some((r) => r.id === rule.id) ? prev.map((r) => r.id === rule.id ? rule : r) : [...prev, rule]);
    setEditing(null);
  };
  const del = (id) => setRules((prev) => prev.filter((r) => r.id !== id));

  return (
    <div>
      <SectionLabel right={<Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{linkedRules.length + rules.length} pravidel</Mono>}>Pravidla schvalování</SectionLabel>
      <Mono style={{ fontSize: 10.5, color: Z.inkDim, display: 'block', marginTop: -6, marginBottom: 16, lineHeight: 1.5 }}>
        Pravidlo = <span style={{ color: Z.ink }}>matcher</span> <span style={{ color: Z.inkFaint }}>→</span> <span style={{ color: Z.ink }}>rozhodnutí</span> <span style={{ color: Z.inkFaint }}>(→ vyřešení u</span> <span style={{ color: Z.warn }}>ask</span><span style={{ color: Z.inkFaint }}>)</span>. Vyhodnocuje se shora; <span style={{ color: Z.inkDim }}>první shoda vyhrává</span>.
      </Mono>

      {/* 1) Zděděná systémová pravidla (locked) */}
      <div style={{ border: `1px solid ${Z.line}`, borderRadius: 3, background: 'rgba(240,180,41,0.03)', padding: '12px 12px 13px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
          <Icon name="shield" size={13} style={{ color: Z.warn }} />
          <Mono style={{ fontSize: 9.5, letterSpacing: '0.12em', color: Z.warn, textTransform: 'uppercase', fontWeight: 700 }}>Zděděná systémová pravidla</Mono>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: Z.inkFaint, padding: '2px 7px', borderRadius: 2, border: `1px solid ${Z.line}` }}>
            <Icon name="link" size={10} /> read-only
          </span>
        </div>
        <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginBottom: 11, lineHeight: 1.5 }}>
          Bezpečnostní floor z <span style={{ color: Z.inkDim }}>POLICY.md</span> — agent je smí jen <span style={{ color: Z.ink }}>přitvrdit</span>, ne povolit.
        </Mono>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.82 }}>
          {SYSTEM_RULES.map((r) => <RuleCard locked key={r.id} rule={r} />)}
        </div>
      </div>

      {/* 2) Přilinkovaná globální pravidla */}
      <div style={{ border: `1px solid ${accent}33`, borderRadius: 3, background: `${accent}04`, padding: '12px 12px 13px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="link" size={13} style={{ color: accent }} />
          <Mono style={{ fontSize: 9.5, letterSpacing: '0.12em', color: accent, textTransform: 'uppercase', fontWeight: 700 }}>Globální pravidla</Mono>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: Z.inkFaint, padding: '2px 7px', borderRadius: 2, border: `1px solid ${Z.line}` }}>
            sdílená · read-only
          </span>
        </div>
        <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginBottom: linkedRules.length > 0 ? 11 : 0, lineHeight: 1.5 }}>
          Ze stránky <span style={{ color: Z.inkDim }}>Pravidla schvalování</span> — edituj je tam, platí všude kde jsou přilinkovaná.
        </Mono>
        {linkedRules.length === 0 && (
          <Mono style={{ fontSize: 10.5, color: Z.inkFaint, display: 'block', marginTop: 6, marginBottom: onLinkedChange ? 9 : 0 }}>{
            onLinkedChange ? 'Žádná globální pravidla přilinkována.' : 'Žádná globální pravidla.'
          }</Mono>
        )}
        {linkedRules.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: onLinkedChange ? 10 : 0 }}>
            {linkedRules.map(r => {
              const d = DECISION[r.decision] || DECISION.ask;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${Z.line}`, borderLeft: `3px solid ${d.c}`, borderRadius: 2 }}>
                  <Icon name={(MATCHER[r.type] || MATCHER.action).icon} size={13} style={{ flex: '0 0 auto', color: Z.inkFaint }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.name && <Mono style={{ fontSize: 11, fontWeight: 600, color: Z.inkDim }}>{r.name}</Mono>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <MatcherText rule={r} />
                      <DecisionBadge decision={r.decision} />
                      {r.decision === 'ask' && <ResolutionChips mode={r.mode} resolution={r.resolution || []} />}
                    </div>
                  </div>
                  {onLinkedChange && (
                    <button onClick={() => onLinkedChange((linkedRuleIds || []).filter(x => x !== r.id))} style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 26, height: 26, cursor: 'pointer', borderRadius: 2, background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkFaint }}
                      title="Odlinkovat">
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {onLinkedChange && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setPickerOpen(o => !o)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', cursor: 'pointer', borderRadius: 2,
              fontFamily: Z.mono, fontSize: 11, fontWeight: 600, color: accent,
              background: `${accent}0e`, border: `1px dashed ${accent}55`, transition: 'all .12s',
            }}>
              <Icon name="plus" size={12} stroke={2} /> Přilinkovat globální pravidlo
            </button>
            {pickerOpen && (
              <GlobalRulePicker accent={accent} globalRules={globalRules} linkedIds={linkedRuleIds}
                onClose={() => setPickerOpen(false)}
                onLink={id => onLinkedChange([...(linkedRuleIds || []), id])} />
            )}
          </div>
        )}
      </div>

      {/* 3) Vlastní pravidla agenta/skillu */}
      <GroupHeading>Vlastní pravidla · {agentName}</GroupHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map((r, i) => (
          <RuleCard dragState={drag} index={i} key={r.id} onDelete={del}
            onEdit={(rule) => setEditing(rule)} onReorder={onReorder} rule={r} />
        ))}
      </div>

      <button onClick={() => setEditing('new')} onMouseEnter={(e) => { e.currentTarget.style.background = `${accent}1c`; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${accent}0e`; }}
        style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 11,
        padding: '10px 12px', cursor: 'pointer', borderRadius: 2, fontFamily: Z.mono, fontSize: 12, fontWeight: 600,
        color: accent, background: `${accent}0e`, border: `1px dashed ${accent}55`, transition: 'all .14s', whiteSpace: 'nowrap',
      }}>
        <Icon name="plus" size={14} stroke={2} /> Přidat vlastní pravidlo
      </button>

      {editing && (
        <RuleModal accent={accent} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
};

Object.assign(window, { RuleCard, MenuItem, GlobalRulePicker, ApprovalRulesSection, SYSTEM_RULES, DEFAULT_AGENT_RULES, newRid });

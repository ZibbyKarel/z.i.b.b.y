// ZIBBY velín — Pravidla schvalování: globální katalog pravidel
const { useState: useStateGRP } = React;

// ── Karta globálního pravidla ────────────────────────────────────────────
const GlobalRuleCard = ({ rule, index, accent, onEdit, onDelete, onReorder, dragState, agents, skills }) => {
  const [h, setH] = useStateGRP(false);
  const [menu, setMenu] = useStateGRP(false);
  const d = DECISION[rule.decision] || DECISION.ask;
  const dragging = dragState && dragState.from === index;
  const over = dragState && dragState.over === index && dragState.from !== index;
  const usedAgents = (agents || []).filter(a => (a.gateRuleIds || []).includes(rule.id));
  const usedSkills = (skills || []).filter(s => (s.gateRuleIds || []).includes(rule.id));
  const total = usedAgents.length + usedSkills.length;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onReorder('start', index); }}
      onDragOver={e => { e.preventDefault(); onReorder('over', index); }}
      onDrop={e => { e.preventDefault(); onReorder('drop', index); }}
      onDragEnd={() => onReorder('end', index)}
      onMouseEnter={() => setH(true)} onMouseLeave={() => { setH(false); setMenu(false); }}
      style={{
        position: 'relative', background: h ? Z.panelHi : Z.panel, opacity: dragging ? 0.4 : 1,
        border: `1px solid ${over ? d.c + '88' : (h ? d.c + '44' : Z.line)}`,
        borderLeft: `3px solid ${d.c}`, borderRadius: 2,
        transition: 'background .14s, border-color .14s', cursor: 'grab', display: 'flex', flexDirection: 'column',
      }}>

      {/* main row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px 11px' }}>
        <span style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 18, marginTop: 1, color: h ? Z.inkDim : Z.inkFaint }}>
          {h ? <Icon name="dots" size={15} /> : <Icon name={(MATCHER[rule.type] || MATCHER.action).icon} size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rule.name && <div style={{ fontSize: 13, fontWeight: 600, color: Z.ink }}>{rule.name}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <MatcherText rule={rule} />
            <span style={{ color: Z.inkFaint, fontFamily: Z.mono, fontSize: 11 }}>→</span>
            <DecisionBadge decision={rule.decision} />
            {rule.decision === 'ask' && <ResolutionChips resolution={rule.resolution || []} mode={rule.mode} />}
            {rule.decision === 'notify' && <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>→ activity feed</Mono>}
          </div>
          {rule.desc && <div style={{ fontSize: 11, color: Z.inkFaint, lineHeight: 1.4 }}>{rule.desc}</div>}
        </div>
        {/* usage + menu */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
          {total > 0
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: `${accent}10`, border: `1px solid ${accent}33`, borderRadius: 2 }}>
                <Icon name="bot" size={11} style={{ color: accent }} />
                <Mono style={{ fontSize: 10.5, color: accent, fontWeight: 600 }}>{total}</Mono>
              </div>
            : <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>nepoužito</Mono>
          }
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setMenu(m => !m); }}
              style={{ display: h || menu ? 'grid' : 'none', placeItems: 'center', width: 26, height: 26, cursor: 'pointer', borderRadius: 2, background: menu ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${menu ? Z.line : 'transparent'}`, color: Z.inkDim }}>
              <Icon name="dots" size={15} />
            </button>
            {menu && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 30, right: 0, zIndex: 30, minWidth: 140, background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 3, boxShadow: '0 12px 34px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4 }}>
                <MenuItem icon="edit" onClick={() => { setMenu(false); onEdit(rule); }}>Upravit</MenuItem>
                <MenuItem icon="trash" danger onClick={() => { setMenu(false); onDelete(rule.id); }}>Smazat</MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* usage strip */}
      {total > 0 && (
        <div style={{ padding: '7px 14px 9px 43px', borderTop: `1px solid ${Z.line}`, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {usedAgents.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Mono style={{ fontSize: 8.5, letterSpacing: '0.1em', color: Z.inkFaint, textTransform: 'uppercase' }}>agenti</Mono>
              {usedAgents.map(a => (
                <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 10.5, padding: '2px 8px', borderRadius: 2, color: Z.inkDim, border: `1px solid ${Z.line}`, background: 'rgba(255,255,255,0.02)' }}>
                  <Icon name={a.glyph || 'bot'} size={10} style={{ color: accent }} /> {a.name}
                </span>
              ))}
            </span>
          )}
          {usedSkills.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Mono style={{ fontSize: 8.5, letterSpacing: '0.1em', color: Z.inkFaint, textTransform: 'uppercase' }}>skilly</Mono>
              {usedSkills.map(s => (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 10.5, padding: '2px 8px', borderRadius: 2, color: Z.inkDim, border: `1px solid ${Z.line}`, background: 'rgba(255,255,255,0.02)' }}>
                  <Icon name={s.glyph || 'spark'} size={10} style={{ color: accent }} /> {s.name}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── GateRulesBody ────────────────────────────────────────────────────────
const GateRulesBody = ({ accent, gateRules, setGateRules, agents = [], skills = [], cats = [], setCats }) => {
  const [editing, setEditing] = useStateGRP(null);
  const [filterDec, setFilterDec] = useStateGRP(null);
  const [drag, setDrag] = useStateGRP(null);
  const rules = gateRules || [];

  const bydec = DECISION_ORDER.reduce((acc, k) => { acc[k] = rules.filter(r => r.decision === k).length; return acc; }, {});
  const filtered = filterDec ? rules.filter(r => r.decision === filterDec) : rules;

  const onReorder = (phase, index) => {
    if (phase === 'start') setDrag({ from: index, over: index });
    else if (phase === 'over') setDrag(s => s ? { ...s, over: index } : s);
    else if (phase === 'drop') {
      setDrag(s => {
        if (!s || s.from === index) return null;
        setGateRules(prev => { const a = [...prev]; const [m] = a.splice(s.from, 1); a.splice(index, 0, m); return a; });
        return null;
      });
    } else setDrag(null);
  };

  const save = rule => {
    setGateRules(prev => prev.some(r => r.id === rule.id) ? prev.map(r => r.id === rule.id ? rule : r) : [...prev, rule]);
    setEditing(null);
  };
  const del = id => setGateRules(prev => prev.filter(r => r.id !== id));

  const addCat = name => setCats && setCats(prev => prev.includes(name) ? prev : [...prev, name]);
  const delCat = name => {
    if (rules.some(r => r.category === name)) return;
    setCats && setCats(prev => prev.filter(c => c !== name));
  };

  // flat index across all categories (for drag reorder)
  const ruleIndex = (rule) => filtered.indexOf(rule);

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Pravidla schvalování</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7, lineHeight: 1.6 }}>
              Globální katalog — pravidla odsud přilinkuješ ke konkrétním agentům nebo skillům při jejich editaci.
              <br />Systémová pravidla (POLICY.md) jsou neměnný floor; tato jsou prostřední vrstva.
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CatAdder accent={accent} existing={cats} onAdd={addCat} />
            <RunBtn accent={accent} icon="plus" label="Nové pravidlo" onClick={() => setEditing('new')} />
          </div>
        </div>
        {/* decision filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {DECISION_ORDER.map(k => {
            const d = DECISION[k]; const count = bydec[k] || 0; const on = filterDec === k;
            return (
              <button key={k} onClick={() => setFilterDec(on ? null : k)} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', cursor: 'pointer', borderRadius: 3,
                background: on ? `${d.c}18` : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? d.c + '88' : Z.line}`,
                boxShadow: on ? `0 0 10px ${d.c}22` : 'none', transition: 'all .14s',
              }}>
                <Icon name={d.icon} size={12} style={{ color: d.c }} />
                <Mono style={{ fontSize: 11, color: d.c, fontWeight: 700 }}>{d.token}</Mono>
                <span style={{ fontFamily: Z.mono, fontSize: 13, fontWeight: 700, color: on ? Z.ink : Z.inkDim, minWidth: 16 }}>{count}</span>
              </button>
            );
          })}
          <Mono style={{ marginLeft: 'auto', fontSize: 10, color: Z.inkFaint }}>{rules.length} celkem</Mono>
        </div>
      </HudPanel>

      {/* hierarchy note */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 15px', background: `${accent}08`, border: `1px solid ${accent}22`, borderRadius: 3 }}>
        <Icon name="bolt" size={13} style={{ color: accent, flex: '0 0 auto', marginTop: 1 }} />
        <Mono style={{ fontSize: 10.5, color: Z.inkDim, lineHeight: 1.6 }}>
          <span style={{ color: Z.ink }}>Hierarchie:</span>{' '}
          systémová pravidla (POLICY.md) <span style={{ color: Z.inkFaint }}>→</span>{' '}
          tato globální pravidla <span style={{ color: Z.inkFaint }}>→</span>{' '}
          pravidla konkrétního agenta/skillu. Při každé akci se prochází seshora —{' '}
          <span style={{ color: Z.ink }}>první shoda rozhodne</span>.
          Přilinkování probíhá v editoru agenta nebo skillu.
        </Mono>
      </div>

      {/* category sections */}
      {cats.map(cat => {
        const catRules = filtered.filter(r => r.category === cat);
        const empty = rules.filter(r => r.category === cat).length === 0;
        return (
          <div key={cat}>
            <SectionLabel right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{catRules.length}</Mono>
                {empty && (
                  <button onClick={() => delCat(cat)} title="Smazat prázdnou kategorii" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 10, padding: '4px 9px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}44` }}>
                    <Icon name="trash" size={12} /> Smazat
                  </button>
                )}
              </div>
            }>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="bolt" size={13} style={{ color: accent }} /> {cat}
              </span>
            </SectionLabel>
            {catRules.length > 0
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {catRules.map((rule) => {
                    const i = ruleIndex(rule);
                    return (
                      <GlobalRuleCard key={rule.id} rule={rule} index={i} accent={accent}
                        onEdit={r => setEditing(r)} onDelete={del} onReorder={onReorder}
                        dragState={drag} agents={agents} skills={skills} />
                    );
                  })}
                </div>
              : <div style={{ padding: '18px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}>
                  <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Prázdná kategorie — přidej sem pravidlo, nebo ji smaž.</Mono>
                </div>
            }
          </div>
        );
      })}

      {/* uncategorized */}
      {(() => {
        const uncatRules = filtered.filter(r => !cats.includes(r.category));
        if (uncatRules.length === 0) return null;
        return (
          <div>
            <SectionLabel right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{uncatRules.length}</Mono>}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="bolt" size={13} style={{ color: Z.inkFaint }} />
                <span style={{ color: Z.inkFaint }}>bez kategorie</span>
              </span>
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uncatRules.map(rule => {
                const i = ruleIndex(rule);
                return (
                  <GlobalRuleCard key={rule.id} rule={rule} index={i} accent={accent}
                    onEdit={r => setEditing(r)} onDelete={del} onReorder={onReorder}
                    dragState={drag} agents={agents} skills={skills} />
                );
              })}
            </div>
          </div>
        );
      })()}

      {filtered.length === 0 && (
        <div style={{ padding: '36px 20px', textAlign: 'center', border: `1px dashed ${Z.line}`, borderRadius: 3 }}>
          <Mono style={{ fontSize: 11.5, color: Z.inkFaint }}>
            {filterDec ? `Žádná pravidla s rozhodnutím „${filterDec}".` : 'Zatím žádná globální pravidla.'}
          </Mono>
        </div>
      )}

      <button onClick={() => setEditing('new')} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer',
        borderRadius: 2, fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color: accent,
        background: `${accent}0e`, border: `1px dashed ${accent}55`, transition: 'all .14s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = `${accent}1c`; }}
        onMouseLeave={e => { e.currentTarget.style.background = `${accent}0e`; }}>
        <Icon name="plus" size={14} stroke={2} /> Přidat globální pravidlo
      </button>

      {editing && (
        <RuleModal accent={accent} initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
};

Object.assign(window, { GateRulesBody, GlobalRuleCard });

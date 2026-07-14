// ZIBBY velín — Agenti: katalog sdílených agentů po kategoriích, detail/editor, pozastavení, mazání
// Reuses (loaded earlier): ConfirmDialog, FieldLabel, TextInput, ChipToggle, ToolChip, ALL_TOOLS (skills.jsx);
//                          ModelBadge, ThinkBadge, Pill (pipelines.jsx)
const { useState: useStateAg } = React;

const AG_MODELS = ['opus', 'sonnet', 'haiku'];
const AG_THINK = ['high', 'medium', 'low'];
const agNext = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];

const agentStateMeta = {
  pipeline: { c: Z.run, label: 'v pipeline', pulse: true },
  running: { c: Z.run, label: 'běží', pulse: true },
  idle: { c: Z.inkFaint, label: 'idle', pulse: false },
};
const stateOf = (a) => a.enabled === false ? { c: Z.warn, label: 'pozastaveno', pulse: false } : (agentStateMeta[a.state] || agentStateMeta.idle);

// ---- catalog tile --------------------------------------------------------
const AgentCard = ({ agent, accent, onOpen, onRun, onToggleEnabled }) => {
  const [h, setH] = useStateAg(false);
  const sm = stateOf(agent);
  const used = pipelinesUsingAgent(agent.name).length;
  const off = agent.enabled === false;
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => onOpen(agent.id)}
      style={{
        position: 'relative', background: h ? Z.panelHi : Z.panel, border: `1px solid ${off ? Z.warn + '44' : (h ? accent + '55' : Z.line)}`,
        borderRadius: Z.rPanel, padding: 15, cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column',
        boxShadow: h ? '0 8px 26px rgba(0,0,0,0.4)' : 'none', opacity: off ? 0.62 : 1,
      }}>
      {(h && !off) && <Corners color={accent} inset={5} />}

      {/* pause / activate — top-right */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleEnabled(agent.id); }}
        title={off ? 'Aktivovat agenta' : 'Pozastavit agenta'}
        style={{
          position: 'absolute', top: 9, right: 9, width: 26, height: 26, display: (h || off) ? 'grid' : 'none',
          placeItems: 'center', borderRadius: 2, cursor: 'pointer', transition: 'all .14s',
          color: off ? Z.bg0 : accent, background: off ? Z.warn : 'rgba(255,255,255,0.04)',
          border: `1px solid ${off ? Z.warn : Z.line}`, boxShadow: off ? `0 0 12px ${Z.warn}66` : 'none',
        }}>
        <Icon name={off ? 'play' : 'pause'} size={12} stroke={1.8} />
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, paddingRight: 24 }}>
        <Avatar src={agent.avatar} glyph={agent.glyph} size={36} radius={2} accent={accent} dim={accentDimOf(agent.ctx)} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</div>
          <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{agent.role}</div>
        </div>
      </div>

      {/* model / thinking / pipeline usage */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
        <ModelBadge model={agent.model} />
        <ThinkBadge level={agent.thinking} />
        {used > 0 && <Pill color={accent}><Icon name="flow" size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> {used} pipeline</Pill>}
      </div>

      {/* tools */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
        {riskyToolsOf(agent.tools).length > 0 && <GatedBadge tip={`Rizikové nástroje: ${riskyToolsOf(agent.tools).join(', ')}`} />}
        {agent.tools.map((t) => <ToolChip key={t} t={t} />)}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTop: `1px solid ${Z.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Dot color={sm.c} pulse={sm.pulse} size={6} />
          <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{sm.label} · {agent.runs}×</Mono>
        </div>
        <RunBtn accent={accent} size="sm" onClick={(e) => { e && e.stopPropagation && e.stopPropagation(); onRun(agent); }} />
      </div>
    </div>
  );
};

// ---- detail / editor modal ----------------------------------------------
const AgentModal = ({ agent, mode: initialMode, accent, cats = [], onClose, onSave, onDelete, onToggleEnabled, gateRules = [], projects = [] }) => {
  const isNew = initialMode === 'new';
  const [mode, setMode] = useStateAg(isNew ? 'edit' : 'view');
  const [draft, setDraft] = useStateAg(agent);
  const [confirm, setConfirm] = useStateAg(false);
  const [editTab, setEditTab] = useStateAg('basics'); // 'basics' | 'rules'
  if (!agent) return null;

  const accentFor = accent;
  const editing = mode === 'edit' || isNew;
  const riskyTools = riskyToolsOf(draft.tools);
  const gated = riskyTools.length > 0;
  // Frontmatter se needituje v editoru — generuje se z polí v levém sloupci.
  // Gating (requires_approval / risky_tools) je odvozen z povolených nástrojů.
  const agentFront = (d) => {
    const rt = riskyToolsOf(d.tools);
    const fm = [
      `name: ${d.id || (d.name || 'novy-agent').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      `category: ${d.category}`,
      `model: ${d.model || 'sonnet'}`,
      `thinking: ${d.thinking || 'medium'}`,
      `tools: [${(d.tools || []).join(', ')}]`,
    ];
    if (rt.length) { fm.push('requires_approval: true'); fm.push(`risky_tools: [${rt.join(', ')}]`); }
    return `---\n${fm.join('\n')}\n---`;
  };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTool = (t) => set({ tools: draft.tools.includes(t) ? draft.tools.filter((x) => x !== t) : [...draft.tools, t] });

  const sm = stateOf(agent);
  const usedBy = pipelinesUsingAgent(agent.name);
  const off = agent.enabled === false;

  const header = (
    <div style={{ position: 'relative' }}>
      <EntityHero
        image={draft.avatar} glyph={draft.glyph || 'bot'} accent={accentFor} height={168}
        name={isNew ? 'Nový agent' : draft.name}
        tag={<div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><Pill color={Z.inkDim}>{draft.category}</Pill>{gated && <GatedBadge tip={`Rizikové nástroje: ${riskyTools.join(', ')}`} />}</div>}
        desc={draft.role}
        editable
        controlsSide="left"
        placeholder="Avatar agenta"
        onUpload={(url) => set({ avatar: url })}
        onRemove={() => set({ avatar: null })}
        extraControls={<>
          {!isNew && mode === 'view' && (
            <button onClick={() => onToggleEnabled(agent.id)} title={off ? 'Aktivovat' : 'Pozastavit agenta'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', cursor: 'pointer', borderRadius: 2,
                fontFamily: Z.mono, fontSize: 11, fontWeight: 600,
                color: off ? Z.bg0 : '#e6edf3', background: off ? Z.warn : 'rgba(9,12,17,0.72)',
                border: `1px solid ${off ? Z.warn : 'rgba(255,255,255,0.18)'}`, backdropFilter: 'blur(3px)',
              }}>
              <Icon name={off ? 'play' : 'pause'} size={13} stroke={1.8} /> {off ? 'Pozastaveno' : 'Aktivní'}
            </button>
          )}
          <HeroIconBtn icon="x" title="Zavřít" onClick={onClose} />
        </>}
      />
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: editing ? 1000 : 600, maxWidth: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column',
        background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4,
        boxShadow: `0 0 0 1px ${accentFor}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden',
      }}>
        {header}

        {/* ---- VIEW MODE ---- */}
        {mode === 'view' && !isNew && (
          <>
            <div style={{ padding: 20, overflow: 'auto' }}>
              {/* stat strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot color={sm.c} pulse={sm.pulse} size={7} /><Mono style={{ fontSize: 11, color: Z.inkDim }}>{sm.label}</Mono></div>
                <div style={{ width: 1, height: 22, background: Z.line }} />
                <ModelBadge model={agent.model} />
                <ThinkBadge level={agent.thinking} />
                <div style={{ width: 1, height: 22, background: Z.line }} />
                <Mono style={{ fontSize: 11, color: Z.inkDim }}>{agent.runs}× spuštěno</Mono>
              </div>

              {/* used in pipelines */}
              <FieldLabel style={{ marginTop: 18 }}>Použito v pipeline</FieldLabel>
              {usedBy.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {usedBy.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3 }}>
                      <Icon name="flow" size={14} style={{ color: accent }} />
                      <Mono style={{ fontSize: 11.5, color: Z.ink, flex: 1 }}>{p.name}</Mono>
                      <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{p.phases.length} fází</Mono>
                    </div>
                  ))}
                </div>
              ) : (
                <Mono style={{ fontSize: 11, color: Z.inkFaint, display: 'block', marginTop: 8 }}>Zatím v žádné pipeline — volný k použití.</Mono>
              )}

              {/* file-level gating */}
              {gated && (
                <div style={{ marginTop: 16 }}>
                  <GatePanel tools={riskyTools} />
                </div>
              )}

              {/* .agent.md preview */}
              <FieldLabel style={{ marginTop: 18 }}>agent.md</FieldLabel>
              <div style={{
                margin: '8px 0 0', padding: '14px 16px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 4,
                maxHeight: 280, overflow: 'auto',
              }}>
                <MarkdownView source={agent.body} accent={accentFor} />
              </div>
            </div>

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
              <button onClick={() => setConfirm(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px',
                cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55`,
              }}><Icon name="trash" size={13} /> Smazat</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <GhostBtn icon="edit" accent={accentFor} onClick={() => { setDraft(agent); setMode('edit'); }}>Editovat</GhostBtn>
                <RunBtn accent={accentFor} label="Spustit ad-hoc" onClick={onClose} />
              </div>
            </div>
          </>
        )}

        {/* ---- EDIT / NEW MODE ---- */}
        {(mode === 'edit' || isNew) && (
          <>
            {/* tab bar */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${Z.line}`, padding: '0 20px' }}>
              {[['basics', 'Základy'], ['rules', 'Pravidla']].map(([id, label]) => {
                const on = editTab === id;
                return (
                  <button key={id} onClick={() => setEditTab(id)} style={{
                    fontFamily: Z.mono, fontSize: 12, fontWeight: on ? 700 : 500,
                    padding: '11px 16px', cursor: 'pointer', background: 'transparent', border: 'none',
                    color: on ? accentFor : Z.inkDim,
                    borderBottom: on ? `2px solid ${accentFor}` : '2px solid transparent',
                    marginBottom: -1, transition: 'all .12s',
                  }}>{label}</button>
                );
              })}
            </div>

            {editTab === 'basics' && <div style={{ padding: 20, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)', gap: 22, alignItems: 'start' }}>
              {/* left column — meta */}
              <div>
                <FieldLabel>Jméno</FieldLabel>
                <TextInput value={draft.name} onChange={(v) => set({ name: v })} placeholder="jméno agenta" mono />

                <FieldLabel style={{ marginTop: 16 }}>Role</FieldLabel>
                <TextInput value={draft.role} onChange={(v) => set({ role: v })} placeholder="co agent dělá (jedna věta)" />

                <FieldLabel style={{ marginTop: 16 }}>Kategorie</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
                  {cats.map((c) => <ChipToggle key={c} active={draft.category === c} accent={accentFor} onClick={() => set({ category: c })}>{c}</ChipToggle>)}
                </div>

                {/* model + thinking */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
                      <ModelBadge model={draft.model} onClick={() => set({ model: agNext(AG_MODELS, draft.model) })} />
                      <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>klikni pro změnu</Mono>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Thinking</FieldLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
                      <ThinkBadge level={draft.thinking} onClick={() => set({ thinking: agNext(AG_THINK, draft.thinking) })} />
                      <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>klikni pro změnu</Mono>
                    </div>
                  </div>
                </div>

                <FieldLabel style={{ marginTop: 16 }}>Záložní ikona <span style={{ color: Z.inkFaint, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· použije se, dokud nemá agent obrázek</span></FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {AGENT_GLYPHS.map((g) => {
                    const on = draft.glyph === g;
                    return (
                      <button key={g} onClick={() => set({ glyph: g })} title={g} style={{
                        width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2,
                        color: on ? Z.bg0 : Z.inkDim, background: on ? accentFor : 'transparent',
                        border: `1px solid ${on ? accentFor : Z.line}`, transition: 'all .12s',
                      }}><Icon name={g} size={17} /></button>
                    );
                  })}
                </div>

                <FieldLabel style={{ marginTop: 16 }}>Povolené nástroje</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {ALL_TOOLS.map((t) => <ChipToggle key={t} active={draft.tools.includes(t)} accent={accentFor} onClick={() => toggleTool(t)}>{t}</ChipToggle>)}
                </div>

                {gated && (
                  <React.Fragment>
                    <FieldLabel style={{ marginTop: 16 }}>Approval gate</FieldLabel>
                    <GatePanel tools={riskyTools} style={{ marginTop: 8 }} />
                    <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 7, lineHeight: 1.5 }}>
                      Odvozeno z povolených nástrojů, které umí rizikovou akci. Risk je vlastnost nástroje.
                    </Mono>
                  </React.Fragment>
                )}
              </div>

              {/* right column — markdown editor */}
              <div>
                <FieldLabel>agent.md</FieldLabel>
                <MarkdownEditor value={splitFrontmatter(draft.body).content} onChange={(v) => setDraft((d) => ({ ...d, body: agentFront(d) + '\n\n' + v }))} accent={accentFor} minHeight={380} placeholder="Markdown popis agenta…" />
              </div>
            </div>}

            {editTab === 'rules' && <div style={{ padding: 20, overflow: 'auto' }}>
              <ApprovalRulesSection
                accent={accentFor}
                agentName={draft.name || 'agent'}
                globalRules={gateRules}
                linkedRuleIds={draft.gateRuleIds || []}
                onLinkedChange={ids => set({ gateRuleIds: ids })}
              />
            </div>}

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
              <button onClick={() => { if (isNew) { onClose(); } else { setDraft(agent); setMode('view'); } }} style={{
                fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2,
                color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`,
              }}>Zrušit</button>
              <RunBtn accent={accentFor} label={isNew ? 'Vytvořit agenta' : 'Uložit změny'}
                onClick={() => onSave({ ...draft, body: agentFront(draft) + '\n\n' + splitFrontmatter(draft.body).content }, isNew)} />
            </div>
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title="Smazat agenta?"
          message={
            <span>
              Opravdu smazat agenta <Mono style={{ color: Z.ink }}>{agent.name}</Mono>?
              {usedBy.length > 0 && <> Je použit v <span style={{ color: Z.warn }}>{usedBy.length} pipeline</span> ({usedBy.map((p) => p.name).join(', ')}) — odebere se z nich.</>}
              {' '}Smaže se i soubor <Mono style={{ color: Z.inkDim }}>{agent.file}</Mono>. Tuto akci nelze vrátit.
            </span>
          }
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); onDelete(agent.id); }}
        />
      )}
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const AgentsBody = ({ accent, agents, setAgents, cats = [], setCats, gateRules = [], projects = [] }) => {
  const [openId, setOpenId] = useStateAg(null);
  const [newDraft, setNewDraft] = useStateAg(null);
  const [runAgent, setRunAgent] = useStateAg(null);
  const [q, setQ] = useStateAg('');

  const list = agents;
  const query = q.trim().toLowerCase();
  const filtered = query ? list.filter((a) => (a.name + ' ' + a.role + ' ' + a.category).toLowerCase().includes(query)) : list;
  const activeCount = list.filter((a) => a.enabled !== false).length;

  const toggleEnabled = (id) => setAgents((prev) => prev.map((a) => a.id === id ? { ...a, enabled: a.enabled === false ? true : false } : a));
  const addCat = (name, glyph) => { if (glyph) AGENT_CATEGORY_GLYPH[name] = glyph; setCats((prev) => prev.includes(name) ? prev : [...prev, name]); };
  const delCat = (name) => { if (list.some((a) => a.category === name)) return; setCats((prev) => prev.filter((c) => c !== name)); };
  const save = (draft, isNew) => {
    if (isNew) {
      const id = (draft.name || 'agent').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('agent-' + Date.now());
      const final = { ...draft, id, file: `~/zibby/agents/${id}.agent.md`, runs: 0, state: 'idle', enabled: true };
      setAgents((prev) => [...prev, final]);
      setNewDraft(null);
      setOpenId(id);
    } else {
      setAgents((prev) => prev.map((a) => a.id === draft.id ? draft : a));
    }
  };
  const del = (id) => { setAgents((prev) => prev.filter((a) => a.id !== id)); setOpenId(null); };

  const openAgent = agents.find((a) => a.id === openId) || null;
  const runSkillObj = runAgent ? { name: runAgent.name, desc: runAgent.role, glyph: runAgent.glyph, file: runAgent.file, ctx: runAgent.ctx } : null;

  const startNew = () => setNewDraft({
    id: '', name: '', glyph: 'bot', category: cats[0] || '', role: '',
    model: 'sonnet', thinking: 'medium', tools: ['read'], state: 'idle', enabled: true, runs: 0,
    body: `---\nname: novy-agent\ncategory: ${cats[0] || ''}\nmodel: sonnet\nthinking: medium\ntools: [read]\n---\n\n# Nový agent\n\nPopiš roli agenta.\n\n## Systémový prompt\n…\n`,
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 600 }}>Agenti</div>
            </div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {list.length} agent{list.length === 1 ? '' : (list.length >= 2 && list.length <= 4 ? 'i' : 'ů')} · <span style={{ color: accent }}>{activeCount} aktivních</span> · sdílený pool pro pipeline
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CatAdder accent={accent} existing={cats} onAdd={addCat} />
            <RunBtn accent={accent} label="Přidat agenta" onClick={startNew} icon="plus" />
          </div>
        </div>
      </HudPanel>

      {/* category sections */}
      {cats.map((cat) => {
        const all = list.filter((a) => a.category === cat);
        const items = query ? filtered.filter((a) => a.category === cat) : all;
        if (query && items.length === 0) return null;
        const empty = all.length === 0;
        return (
          <div key={cat}>
            <SectionLabel right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{all.length}</Mono>
                {empty && !query && (
                  <button onClick={() => delCat(cat)} title="Smazat prázdnou kategorii" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 10, padding: '4px 9px',
                    cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}44`,
                  }}><Icon name="trash" size={12} /> Smazat</button>
                )}
              </div>
            }>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name={AGENT_CATEGORY_GLYPH[cat] || 'bot'} size={13} style={{ color: accent }} /> {cat}
              </span>
            </SectionLabel>
            {items.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 13 }}>
                {items.map((a) => (
                  <AgentCard key={a.id} agent={a} accent={accent} onOpen={setOpenId} onRun={setRunAgent} onToggleEnabled={toggleEnabled} />
                ))}
              </div>
            ) : (
              <div style={{ padding: '18px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}>
                <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Prázdná kategorie — přidej sem agenta, nebo ji smaž.</Mono>
              </div>
            )}
          </div>
        );
      })}

      {/* empty search */}
      {query && filtered.length === 0 && (
        <HudPanel accent={accent} pad={40}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <Icon name="search" size={26} style={{ color: Z.inkFaint }} />
            <Mono style={{ fontSize: 12, color: Z.inkDim }}>Nic nenalezeno pro „{q}“.</Mono>
          </div>
        </HudPanel>
      )}

      {/* detail / editor */}
      {openAgent && (
        <AgentModal key={openAgent.id} agent={openAgent} mode="view" accent={accent} cats={cats}
          onClose={() => setOpenId(null)} onSave={save} onDelete={del} onToggleEnabled={toggleEnabled} gateRules={gateRules} projects={projects} />
      )}
      {newDraft && (
        <AgentModal key="new" agent={newDraft} mode="new" accent={accent} cats={cats}
          onClose={() => setNewDraft(null)} onSave={save} onDelete={del} onToggleEnabled={toggleEnabled} gateRules={gateRules} projects={projects} />
      )}

      {/* run modal (reuse) */}
      <RunModal skill={runSkillObj} accent={accent} onClose={() => setRunAgent(null)} projects={projects} />
    </div>
  );
};

Object.assign(window, { AgentsBody, AgentCard, AgentModal });

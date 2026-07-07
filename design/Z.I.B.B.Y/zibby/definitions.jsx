// ZIBBY velín — Definice: unified browse + edit surface for agents and pipelines
// Left: agent list + pipeline list (with phase chips). Right: file editor (YAML + markdown body).
const { useState: useStateDef, useCallback: useCallbackDef } = React;

// ── Local field primitives ────────────────────────────────────────────────
const DLabel = ({ children, style }) => (
  <div style={{ fontFamily: Z.mono, fontSize: 8.5, letterSpacing: '0.16em', color: Z.inkFaint, textTransform: 'uppercase', marginBottom: 6, ...style }}>
    {children}
  </div>
);

const DInput = ({ value, onChange, placeholder, mono, accent, multiline, rows = 3 }) => {
  const base = {
    width: '100%', padding: '8px 10px', background: Z.bg0, border: `1px solid ${Z.line}`,
    borderRadius: 2, color: Z.ink, fontFamily: mono ? Z.mono : Z.sans, fontSize: mono ? 11 : 13,
    lineHeight: 1.55, outline: 'none', boxSizing: 'border-box', resize: multiline ? 'vertical' : 'none',
  };
  const focus = (e) => e.target.style.borderColor = `${accent}66`;
  const blur  = (e) => e.target.style.borderColor = Z.line;
  return multiline
    ? <textarea onBlur={blur} onChange={e => onChange(e.target.value)} onFocus={focus} placeholder={placeholder} rows={rows} spellCheck={false} style={base} value={value} />
    : <input onBlur={blur} onChange={e => onChange(e.target.value)} onFocus={focus} placeholder={placeholder} spellCheck={false} style={base} value={value} />;
};

// ── Sidebar list item ─────────────────────────────────────────────────────
const DefItem = ({ item, selected, onSelect, accent }) => {
  const [h, setH] = useStateDef(false);
  return (
    <div
      onClick={() => onSelect(item)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: '9px 11px', borderRadius: 2, cursor: 'pointer',
        background: selected ? `${accent}14` : (h ? 'rgba(255,255,255,0.03)' : 'transparent'),
        border: `1px solid ${selected ? `${accent}44` : 'transparent'}`,
        transition: 'all .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name={item.glyph} size={14} style={{ color: selected ? accent : Z.inkFaint, flexShrink: 0 }} />
        <Mono style={{ fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? Z.ink : Z.inkDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </Mono>
        {item.kind === 'pipeline' && item.phases && (
          <Mono style={{ fontSize: 8.5, color: Z.inkFaint, flexShrink: 0 }}>{item.phases.length}× fáze</Mono>
        )}
        {item.kind === 'agent' && item.model && (
          <Mono style={{ fontSize: 8.5, color: Z.inkFaint, flexShrink: 0 }}>{item.model}</Mono>
        )}
      </div>
      {/* Pipeline phase chips */}
      {item.kind === 'pipeline' && item.phases && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
          {item.phases.map((ph, i) => (
            <React.Fragment key={i}>
              <Mono style={{ fontSize: 8.5, color: selected ? `${accent}cc` : Z.inkFaint }}>{ph.agent}</Mono>
              {ph.loop && <Icon name="retry" size={8} style={{ color: Z.bad }} />}
              {i < item.phases.length - 1 && !ph.loop && (
                <Icon name="arrow" size={8} style={{ color: Z.inkFaint }} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

// ── YAML frontmatter editor for an agent ──────────────────────────────────
const AgentEditor = ({ item, accent, onSave }) => {
  const [draft, setDraft] = useStateDef({ ...item });
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);

  const MODEL_C = { opus: '#b07cff', sonnet: '#56c4d6', haiku: '#7fd98a' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* File path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
        <Icon name="file" size={13} style={{ color: Z.inkFaint }} />
        <Mono style={{ fontSize: 10.5, color: Z.inkFaint, flex: 1 }}>{draft.file || `~/zibby/agents/${draft.id}.agent.md`}</Mono>
        {dirty && <Mono style={{ fontSize: 9.5, color: Z.warn }}>upraveno</Mono>}
      </div>

      {/* YAML frontmatter section */}
      <HudPanel accent={accent} pad={18} title="yaml frontmatter">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <DLabel>name</DLabel>
            <DInput mono accent={accent} onChange={v => set({ id: v })} value={draft.id || ''} />
          </div>
          <div>
            <DLabel>category</DLabel>
            <DInput mono accent={accent} onChange={v => set({ category: v })} value={draft.category || ''} />
          </div>
          <div>
            <DLabel>model</DLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {['opus', 'sonnet', 'haiku'].map(m => (
                <button key={m} onClick={() => set({ model: m })} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 10px', cursor: 'pointer', borderRadius: 2, color: draft.model === m ? Z.bg0 : (MODEL_C[m] || Z.inkDim), background: draft.model === m ? (MODEL_C[m] || accent) : 'transparent', border: `1px solid ${MODEL_C[m] || Z.line}55` }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <DLabel>thinking</DLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {['high', 'medium', 'low'].map(t => {
                const tc = { high: '#f0883e', medium: '#5b8def', low: '#5d6b7a' }[t];
                return (
                  <button key={t} onClick={() => set({ thinking: t })} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 10px', cursor: 'pointer', borderRadius: 2, color: draft.thinking === t ? Z.bg0 : tc, background: draft.thinking === t ? tc : 'transparent', border: `1px solid ${tc}55` }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <DLabel>tools</DLabel>
          <DInput mono accent={accent} onChange={v => set({ tools: v.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="read, write, bash…" value={(draft.tools || []).join(', ')} />
        </div>
        <div style={{ marginTop: 14 }}>
          <DLabel>role (systémový prompt — první věta)</DLabel>
          <DInput accent={accent} onChange={v => set({ role: v })} placeholder="Co agent dělá…" value={draft.role || ''} />
        </div>
      </HudPanel>

      {/* Markdown body */}
      <HudPanel accent={accent} pad={18} title="markdown body">
        <DInput
          mono
          multiline
          accent={accent} onChange={v => set({ body: v })}
          placeholder={`# ${draft.name}\n\n${draft.role}\n\n## Systémový prompt\n…`} rows={16}
          value={draft.body || ''}
        />
      </HudPanel>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'flex-end' }}>
        {dirty && (
          <GhostBtn onClick={() => setDraft({ ...item })}>Zahodit změny</GhostBtn>
        )}
        <RunBtn
          accent={dirty ? accent : Z.inkFaint}
          icon="check"
          label="Uložit agent.md"
          onClick={() => dirty && onSave(draft)}
        />
      </div>
    </div>
  );
};

// ── YAML frontmatter editor for a pipeline ────────────────────────────────
const PipelineEditor = ({ item, accent, onSave }) => {
  const [draft, setDraft] = useStateDef({ ...item, phases: item.phases.map(p => ({ ...p })) });
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* File path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
        <Icon name="file" size={13} style={{ color: Z.inkFaint }} />
        <Mono style={{ fontSize: 10.5, color: Z.inkFaint, flex: 1 }}>{draft.file || `~/zibby/pipelines/${draft.id}.pipeline.md`}</Mono>
        {dirty && <Mono style={{ fontSize: 9.5, color: Z.warn }}>upraveno</Mono>}
      </div>

      {/* YAML frontmatter */}
      <HudPanel accent={accent} pad={18} title="yaml frontmatter">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14 }}>
          <div>
            <DLabel>name</DLabel>
            <DInput mono accent={accent} onChange={v => set({ name: v })} value={draft.name || ''} />
          </div>
          <div>
            <DLabel>strop</DLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {[10, 25, 50].map(b => (
                <button key={b} onClick={() => set({ budget: b })} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 10px', cursor: 'pointer', borderRadius: 2, color: draft.budget === b ? Z.bg0 : Z.inkDim, background: draft.budget === b ? accent : 'transparent', border: `1px solid ${draft.budget === b ? accent : Z.line}` }}>${b}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <DLabel>popis</DLabel>
          <DInput accent={accent} onChange={v => set({ desc: v })} placeholder="co pipeline dělá (jedna věta)" value={draft.desc || ''} />
        </div>

        {/* Phase sequence (read-only display) */}
        <div style={{ marginTop: 16 }}>
          <DLabel>phase sequence</DLabel>
          <div style={{ padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
            {draft.phases.map((ph, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < draft.phases.length - 1 ? `1px solid ${Z.line}` : 'none' }}>
                <Mono style={{ fontSize: 9, color: Z.inkFaint, width: 44, flexShrink: 0 }}>FÁZE {i + 1}</Mono>
                <Icon name={agentByName(ph.agent).glyph} size={13} style={{ color: accent, flexShrink: 0 }} />
                <Mono style={{ fontSize: 12, fontWeight: 600, color: Z.ink, flex: 1 }}>{ph.agent}</Mono>
                <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{ph.consumes}</Mono>
                <Icon name="arrow" size={11} style={{ color: Z.inkFaint }} />
                <Mono style={{ fontSize: 9.5, color: accent }}>{ph.produces}</Mono>
                {ph.loop && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 9, color: Z.bad, background: `${Z.bad}14`, border: `1px solid ${Z.bad}44`, borderRadius: 2, padding: '1px 6px' }}>
                    <Icon name="retry" size={9} /> loop→{ph.loop.to} max {ph.loop.maxRetries}
                  </span>
                )}
              </div>
            ))}
          </div>
          <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 7 }}>
            Upravit fáze v sekci <span style={{ color: accent }}>Orchestrace</span> → vizuální editor
          </Mono>
        </div>
      </HudPanel>

      {/* Generated markdown preview */}
      <HudPanel accent={accent} pad={18} title="markdown body (vygenerováno)">
        <div style={{ padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2, fontFamily: Z.mono, fontSize: 11, color: Z.inkDim, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
{`---
name: ${draft.name || ''}
budget: ${draft.budget || 25}
phases: [${draft.phases.map(p => p.agent).join(', ')}]
---

# ${draft.name || ''}

${draft.desc || ''}

## Fáze
${draft.phases.map((p, i) => `${i + 1}. **${p.agent}** — ${p.consumes} → ${p.produces}${p.loop ? ` (retry→${p.loop.to}, max ${p.loop.maxRetries})` : ''}`).join('\n')}

## Eskalace
Po vyčerpání retry smyčky → park_for_review.`}
        </div>
      </HudPanel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'flex-end' }}>
        {dirty && <GhostBtn onClick={() => setDraft({ ...item, phases: item.phases.map(p => ({ ...p })) })}>Zahodit změny</GhostBtn>}
        <RunBtn accent={dirty ? accent : Z.inkFaint} icon="check" label="Uložit pipeline.md" onClick={() => dirty && onSave(draft)} />
      </div>
    </div>
  );
};

// ── Main Definitions body ────────────────────────────────────────────────
const DefinitionsBody = ({ accent, agents = AGENTS, pipelines = PIPELINES, onSaveAgent, onSavePipeline }) => {
  // Combine into a single selectable list
  const agentItems = agents.map(a => ({ ...a, kind: 'agent' }));
  const pipeItems  = (pipelines || PIPELINES).map(p => ({ ...p, kind: 'pipeline' }));
  const [sel, setSel] = useStateDef(agentItems[0] || null);

  const handleSave = (updated) => {
    if (updated.kind === 'agent' && onSaveAgent) onSaveAgent(updated);
    if (updated.kind === 'pipeline' && onSavePipeline) onSavePipeline(updated);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Definice</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {agentItems.length} agentů · {pipeItems.length} pipeline · editovatelné .md soubory
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>~/zibby/agents/ · ~/zibby/pipelines/</Mono>
          </div>
        </div>
      </HudPanel>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left: sidebar list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${Z.line}`, borderRadius: 3, overflow: 'hidden', background: Z.panel }}>
          {/* Agents section */}
          <div style={{ padding: '10px 12px 6px', borderBottom: `1px solid ${Z.line}`, background: Z.bg0 }}>
            <Mono style={{ fontSize: 8.5, letterSpacing: '0.18em', color: Z.inkFaint, textTransform: 'uppercase' }}>
              <span style={{ color: accent, opacity: 0.7 }}>//</span> agenti · {agentItems.length}
            </Mono>
          </div>
          <div style={{ padding: '6px 8px' }}>
            {agentItems.map(item => (
              <DefItem accent={accent} item={item} key={item.id} onSelect={setSel} selected={sel?.id === item.id && sel?.kind === 'agent'} />
            ))}
          </div>

          {/* Pipelines section */}
          <div style={{ padding: '10px 12px 6px', borderTop: `1px solid ${Z.line}`, borderBottom: `1px solid ${Z.line}`, background: Z.bg0 }}>
            <Mono style={{ fontSize: 8.5, letterSpacing: '0.18em', color: Z.inkFaint, textTransform: 'uppercase' }}>
              <span style={{ color: accent, opacity: 0.7 }}>//</span> pipeline · {pipeItems.length}
            </Mono>
          </div>
          <div style={{ padding: '6px 8px' }}>
            {pipeItems.map(item => (
              <DefItem accent={accent} item={item} key={item.id} onSelect={setSel} selected={sel?.id === item.id && sel?.kind === 'pipeline'} />
            ))}
          </div>
        </div>

        {/* Right: editor */}
        {sel
          ? (sel.kind === 'agent'
              ? <AgentEditor    accent={accent}    item={sel} key={sel.id + '-agent'} onSave={handleSave} />
              : <PipelineEditor accent={accent} item={sel} key={sel.id + '-pipeline'} onSave={handleSave} />)
          : (
            <HudPanel accent={accent} pad={56}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <Icon name="doc" size={26} style={{ color: Z.inkFaint }} />
                <Mono style={{ fontSize: 12, color: Z.inkDim }}>Vyber agenta nebo pipeline vlevo pro editor souboru</Mono>
              </div>
            </HudPanel>
          )}
      </div>
    </div>
  );
};

Object.assign(window, { DefinitionsBody, DefItem, AgentEditor, PipelineEditor, DLabel, DInput });

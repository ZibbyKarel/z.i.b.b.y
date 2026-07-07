// ZIBBY velín — Skilly: katalog skillů po kategoriích, detail/editor, připnutí, mazání
const { useState: useStateS } = React;

const ALL_TOOLS = ['read', 'write', 'web', 'bash', 'git'];
const TOOL_C = { read: '#56c4d6', write: '#7fd98a', web: '#5b8def', bash: '#f0883e', git: '#b07cff' };
const SKILL_MODEL_C = { opus: '#b07cff', sonnet: '#56c4d6', haiku: '#7fd98a' };

const skillStateMeta = {
  running: { c: Z.run, label: 'běží', pulse: true },
  wait: { c: Z.warn, label: 'čeká', pulse: true },
  idle: { c: Z.inkFaint, label: 'idle', pulse: false }
};

// small tool chip
const ToolChip = ({ t }) => {
  const c = TOOL_C[t] || Z.inkDim;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 9.5, fontWeight: 600,
      padding: '2px 7px', borderRadius: 2, color: c, background: `${c}1c`, border: `1px solid ${c}44`, whiteSpace: 'nowrap'
    }}>{t}</span>);

};

// ---- gating: "gated" odznak + panel rizikových nástrojů ------------------
// Skill/agent je „gated", pokud volá rizikový nástroj → každé jeho volání
// projde approval frontou. Risk je vlastnost nástroje; tohle to zviditelňuje.
const GatedBadge = ({ tip }) =>
  <span title={tip || 'Volá rizikový nástroj — akce projde frontou schválení'} style={{
    display: 'inline-flex', alignItems: 'center', gap: 3, flex: '0 0 auto', fontFamily: Z.mono, fontSize: 8.5,
    fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2,
    color: Z.warn, background: `${Z.warn}1c`, border: `1px solid ${Z.warn}55`, whiteSpace: 'nowrap'
  }}><Icon name="shield" size={10} /> gated</span>;

// Panel: které nástroje jsou rizikové + jejich typ a závažnost. Zviditelňuje
// frontmatter (requires_approval / risky_tools) v editoru i v detailu.
const GatePanel = ({ tools = [], style }) => {
  if (!tools.length) return null;
  return (
    <div style={{ border: `1px solid ${Z.warn}44`, borderRadius: 4, overflow: 'hidden', background: `${Z.warn}0a`, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderBottom: `1px solid ${Z.warn}22` }}>
        <Icon name="shield" size={14} style={{ color: Z.warn, flex: '0 0 auto' }} />
        <Mono style={{ fontSize: 10, color: Z.warn, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Approval gate · úroveň souboru</Mono>
        <span style={{ marginLeft: 'auto' }}><GatedBadge /></span>
      </div>
      <div style={{ padding: '11px 13px' }}>
        <Mono style={{ fontSize: 10.5, color: Z.inkDim, display: 'block', marginBottom: 11, lineHeight: 1.5 }}>
          Frontmatter nese <span style={{ color: Z.warn }}>requires_approval: true</span> — každé volání těchto nástrojů se zastaví a počká na tvé schválení.
        </Mono>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tools.map((t) => {
            const rk = riskTypeOfTool(t);
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono style={{ fontSize: 11.5, color: Z.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</Mono>
                {rk && <RiskBadge risk={rk} />}
                {rk && <SeverityMeter level={(RISK[rk] || {}).sev} />}
              </div>);
          })}
        </div>
      </div>
    </div>);
};

// ---- catalog tile --------------------------------------------------------
const SkillCard = ({ skill, accent, onOpen, onRun, onTogglePin }) => {
  const [h, setH] = useStateS(false);
  const sm = skillStateMeta[skill.state] || skillStateMeta.idle;
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={() => onOpen(skill.id)}
      style={{
        position: 'relative', background: h ? Z.panelHi : Z.panel, border: `1px solid ${h ? accent + '55' : Z.line}`,
        borderRadius: Z.rPanel, padding: 15, cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column',
        boxShadow: h ? '0 8px 26px rgba(0,0,0,0.4)' : 'none'
      }}>
      {h && <Corners color={accent} inset={6} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: accentDimOf(skill.ctx), color: accent, border: `1px solid ${accent}33` }}>
          <Icon name={skill.glyph} size={18} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.name}</div>
          <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{skill.desc}</div>
        </div>
      </div>

      {/* tools */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
        {(skill.riskyTools || []).length > 0 && <GatedBadge tip={`Rizikové nástroje: ${skill.riskyTools.join(', ')}`} />}
        {skill.tools.map((t) => <ToolChip key={t} t={t} />)}
      </div>


    </div>);

};

// Action boundary: i jinak bezpečná akce projde approval frontou, dokud
// nenastane čas/podmínka `action_safe_after`. Modře (≠ amber gating nástrojů).
const ActionBoundaryNote = ({ value, style }) => {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: `${Z.run}0e`, border: `1px solid ${Z.run}33`, borderRadius: 3, ...style }}>
      <Icon name="clock" size={13} style={{ color: Z.run, flex: '0 0 auto' }} />
      <Mono style={{ fontSize: 10.5, color: Z.inkDim, lineHeight: 1.45 }}>akce bezpečná až <span style={{ color: Z.run }}>{value}</span> — do té doby i bezpečná akce projde frontou schválení</Mono>
    </div>);
};

// ---- confirm dialog ------------------------------------------------------
const ConfirmDialog = ({ title, message, confirmLabel = 'Smazat', onConfirm, onCancel }) =>
<div onClick={onCancel} style={{
  position: 'absolute', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(5,7,10,0.78)', backdropFilter: 'blur(4px)', padding: 24
}}>
    <div onClick={(e) => e.stopPropagation()} style={{
    width: 420, maxWidth: '100%', background: Z.panelHi, border: `1px solid ${Z.bad}55`, borderRadius: 4,
    boxShadow: `0 0 0 1px ${Z.bad}22, 0 30px 80px rgba(0,0,0,0.7)`, padding: 22
  }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', color: Z.bad, background: 'rgba(255,107,107,0.12)', border: `1px solid ${Z.bad}44` }}>
          <Icon name="warn" size={19} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      </div>
      <div style={{ fontSize: 13, color: Z.inkDim, lineHeight: 1.55, marginTop: 13 }}>{message}</div>
      <div style={{ display: 'flex', gap: 9, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
        fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2,
        color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`
      }}>Zrušit</button>
        <button onClick={onConfirm} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 600,
        padding: '8px 15px', cursor: 'pointer', borderRadius: 2, color: Z.bg0, background: Z.bad, border: 'none',
        boxShadow: `0 0 14px ${Z.bad}55`
      }}><Icon name="trash" size={13} stroke={2} /> {confirmLabel}</button>
      </div>
    </div>
  </div>;


// ---- form primitives -----------------------------------------------------
const FieldLabel = ({ children, style }) =>
<label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase', display: 'block', ...style }}>{children}</label>;

const TextInput = ({ value, onChange, placeholder, mono = false }) =>
<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
style={{
  width: '100%', marginTop: 7, padding: '9px 12px', background: Z.bg0, border: `1px solid ${Z.line}`,
  borderRadius: 3, color: Z.ink, fontFamily: mono ? Z.mono : Z.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box'
}} />;

const ChipToggle = ({ active, accent, onClick, children }) =>
<button onClick={onClick} style={{
  fontFamily: Z.mono, fontSize: 11, padding: '6px 11px', cursor: 'pointer', borderRadius: 2,
  color: active ? Z.bg0 : Z.inkDim, background: active ? accent : 'transparent',
  border: `1px solid ${active ? accent : Z.line}`, transition: 'all .12s'
}}>{children}</button>;

// ---- shared: "add category" control + dialog (used by Skilly + Agenti) ----
// Nabídka glyphů, které lze přiřadit nové kategorii.
const CAT_GLYPH_CHOICES = [
'spark', 'film', 'cart', 'server', 'doc', 'code', 'shield', 'search',
'brain', 'bolt', 'flask', 'compass', 'branch', 'link', 'grid', 'flow',
'bot', 'dollar', 'coffee', 'pin', 'gear', 'pulse', 'clock', 'file'];


const CatDialog = ({ accent, existing = [], onClose, onAdd }) => {
  const [val, setVal] = useStateS('');
  const [glyph, setGlyph] = useStateS('spark');
  const name = val.trim();
  const dup = name && existing.includes(name);
  const valid = name && !dup;
  const submit = () => {if (!valid) return;onAdd(name, glyph);onClose();};

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center',
      background: 'rgba(3,6,12,0.72)', backdropFilter: 'blur(2px)', padding: 20
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(460px, 94vw)', background: Z.bg1, border: `1px solid ${accent}55`, borderRadius: 4,
        boxShadow: `0 0 0 1px ${accent}22, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden'
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '17px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: accentDimOf(), color: accent, border: `1px solid ${accent}44` }}>
            <Icon name={glyph} size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: Z.ink }}>Nová kategorie</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>název + glyph</Mono>
          </div>
          <button onClick={onClose} style={{ display: 'flex', padding: 6, cursor: 'pointer', color: Z.inkDim, background: 'transparent', border: 'none' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 20px' }}>
          <FieldLabel>Název kategorie</FieldLabel>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {if (e.key === 'Enter') submit();if (e.key === 'Escape') onClose();}}
          placeholder="např. Finance" style={{
            width: '100%', marginTop: 7, padding: '10px 12px', background: Z.bg0,
            border: `1px solid ${dup ? Z.bad : name ? accent + '88' : Z.line}`, borderRadius: 3,
            color: Z.ink, fontFamily: Z.sans, fontSize: 14, outline: 'none', boxSizing: 'border-box'
          }} />
          {dup && <Mono style={{ fontSize: 10.5, color: Z.bad, display: 'block', marginTop: 6 }}>Kategorie „{name}" už existuje.</Mono>}

          <FieldLabel style={{ marginTop: 18 }}>Glyph</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 7, marginTop: 9 }}>
            {CAT_GLYPH_CHOICES.map((g) => {
              const on = glyph === g;
              return (
                <button key={g} onClick={() => setGlyph(g)} title={g} style={{
                  aspectRatio: '1', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 3,
                  color: on ? Z.bg0 : Z.inkDim, background: on ? accent : Z.bg0,
                  border: `1px solid ${on ? accent : Z.line}`, transition: 'all .12s'
                }}>
                  <Icon name={g} size={17} />
                </button>);

            })}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}`, background: Z.bg0 }}>
          <button onClick={onClose} style={{
            fontFamily: Z.mono, fontSize: 12, padding: '9px 15px', cursor: 'pointer', borderRadius: 2,
            color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`
          }}>Zrušit</button>
          <button onClick={submit} disabled={!valid} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 600,
            padding: '9px 16px', cursor: valid ? 'pointer' : 'not-allowed', borderRadius: 2,
            color: Z.bg0, background: accent, border: 'none', opacity: valid ? 1 : 0.4
          }}><Icon name="check" size={14} stroke={2} /> Přidat kategorii</button>
        </div>
      </div>
    </div>);

};

const CatAdder = ({ accent, existing = [], onAdd }) => {
  const [open, setOpen] = useStateS(false);
  return (
    <React.Fragment>
      <button onClick={() => setOpen(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', fontFamily: Z.mono, fontSize: 11.5,
        padding: '9px 14px', cursor: 'pointer', borderRadius: 2, color: accent, background: 'transparent', border: `1px dashed ${accent}66`
      }}><Icon name="plus" size={14} /> Přidat kategorii</button>
      {open && <CatDialog accent={accent} existing={existing} onClose={() => setOpen(false)} onAdd={onAdd} />}
    </React.Fragment>);

};

// ---- skill detail / editor modal ----------------------------------------
const SkillModal = ({ skill, mode: initialMode, accent, cats = [], onClose, onSave, onDelete, onTogglePin, gateRules = [] }) => {
  const isNew = initialMode === 'new';
  const [mode, setMode] = useStateS(isNew ? 'edit' : 'view');
  const [draft, setDraft] = useStateS(skill);
  const [confirm, setConfirm] = useStateS(false);
  const [contentMode, setContentMode] = useStateS('editor'); // 'editor' | 'folder'
  const [folderFiles, setFolderFiles] = useStateS([]);
  const [folderDrag, setFolderDrag] = useStateS(false);
  const folderInputRef = React.useRef(null);

  const handleFolderSelect = (rawFiles) => {
    const mdFiles = Array.from(rawFiles).filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (!mdFiles.length) return;
    Promise.all(mdFiles.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res({ path: f.webkitRelativePath || f.name, name: f.name, content: ev.target.result, checked: true, size: f.size });
      r.readAsText(f);
    }))).then(results => setFolderFiles(results.sort((a, b) => a.path.localeCompare(b.path))));
  };

  const importToEditor = () => {
    const checked = folderFiles.filter(f => f.checked);
    if (!checked.length) return;
    const merged = checked.map(f => f.content).join('\n\n---\n\n');
    setDraft(d => ({ ...d, body: skillFront(d) + '\n\n' + merged }));
    setContentMode('editor');
  };

  const toggleFileCheck = (path) => setFolderFiles(prev => prev.map(f => f.path === path ? { ...f, checked: !f.checked } : f));
  if (!skill) return null;

  const accentFor = accent;
  const editing = mode === 'edit' || isNew;
  const riskyTools = draft.riskyTools || [];
  const gated = riskyTools.length > 0;
  // Frontmatter se needituje v editoru — generuje se z polí v levém sloupci.
  // Gating (requires_approval / risky_tools) je odvozen z Integrací → jen se promítá.
  const skillFront = (d) => {
    const rt = d.riskyTools || [];
    const fm = [
      `name: ${d.id || (d.name || 'novy-skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      `category: ${d.category}`,
      `tools: [${(d.tools || []).join(', ')}]`,
      `model: ${d.model || 'sonnet'}`,
    ];
    if (rt.length) { fm.push('requires_approval: true'); fm.push(`risky_tools: [${rt.join(', ')}]`); }
    if (d.safeAfter) fm.push(`action_safe_after: ${d.safeAfter}`);
    return `---\n${fm.join('\n')}\n---`;
  };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleTool = (t) => set({ tools: draft.tools.includes(t) ? draft.tools.filter((x) => x !== t) : [...draft.tools, t] });

  const sm = skillStateMeta[skill.state] || skillStateMeta.idle;

  const header =
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
      <div style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: accentDimOf(draft.ctx), color: accentFor, border: `1px solid ${accentFor}44` }}>
        <Icon name={draft.glyph || 'spark'} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: Z.mono, fontSize: 15, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isNew ? 'Nový skill' : skill.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <Pill color={Z.inkDim}>{draft.category}</Pill>
          {gated && <GatedBadge tip={`Rizikové nástroje: ${riskyTools.join(', ')}`} />}
        </div>
      </div>

      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
    </div>;


  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: editing ? 1000 : 600, maxWidth: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column',
        background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4,
        boxShadow: `0 0 0 1px ${accentFor}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden'
      }}>
        {header}

        {/* ---- VIEW MODE ---- */}
        {mode === 'view' && !isNew &&
        <>
            <div style={{ padding: 20, overflow: 'auto' }}>
              <div style={{ fontSize: 14, color: Z.ink, lineHeight: 1.5 }}>{skill.desc}.</div>

              {/* stat strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16, padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Dot color={sm.c} pulse={sm.pulse} size={7} /><Mono style={{ fontSize: 11, color: Z.inkDim }}>{sm.label}</Mono></div>
                <div style={{ width: 1, height: 22, background: Z.line }} />
                <Mono style={{ fontSize: 11, color: Z.inkDim }}>{skill.runs}× spuštěno</Mono>
                <div style={{ width: 1, height: 22, background: Z.line }} />
                <Mono style={{ fontSize: 11, color: Z.inkDim }}>poslední {skill.lastRun}</Mono>
                <div style={{ width: 1, height: 22, background: Z.line }} />
                <Pill color={SKILL_MODEL_C[skill.model] || Z.inkDim}>{skill.model}</Pill>
              </div>

              {/* file-level gating */}
              {gated &&
              <div style={{ marginTop: 16 }}>
                  <GatePanel tools={riskyTools} />
                </div>
              }
              {skill.safeAfter && <ActionBoundaryNote value={skill.safeAfter} style={{ marginTop: 12 }} />}

              {/* SKILL.md preview */}
              <FieldLabel style={{ marginTop: 18 }}>SKILL.md</FieldLabel>
              <div style={{
              margin: '8px 0 0', padding: '14px 16px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 4,
              maxHeight: 280, overflow: 'auto'
            }}>
                <MarkdownView source={skill.body} accent={accentFor} />
              </div>
            </div>

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
              <button onClick={() => setConfirm(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px',
              cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55`
            }}><Icon name="trash" size={13} /> Smazat</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <GhostBtn icon="edit" accent={accentFor} onClick={() => {setDraft(skill);setMode('edit');}}>Editovat</GhostBtn>
                <RunBtn accent={accentFor} label="Spustit" onClick={onClose} />
              </div>
            </div>
          </>
        }

        {/* ---- EDIT / NEW MODE ---- */}
        {(mode === 'edit' || isNew) &&
        <>
            <div style={{ padding: 20, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)', gap: 22, alignItems: 'start' }}>
              {/* left column — meta */}
              <div>
                <FieldLabel>Název</FieldLabel>
                <TextInput value={draft.name} onChange={(v) => set({ name: v })} placeholder="název skillu" mono />

                <FieldLabel style={{ marginTop: 16 }}>Popis</FieldLabel>
                <TextInput value={draft.desc} onChange={(v) => set({ desc: v })} placeholder="co skill dělá (jedna věta)" />

                <FieldLabel style={{ marginTop: 16 }}>Kategorie</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
                  {cats.map((c) => <ChipToggle key={c} active={draft.category === c} accent={accentFor} onClick={() => set({ category: c })}>{c}</ChipToggle>)}
                </div>

                <FieldLabel style={{ marginTop: 16 }}>Ikona</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {SKILL_GLYPHS.map((g) => {
                  const on = draft.glyph === g;
                  return (
                    <button key={g} onClick={() => set({ glyph: g })} title={g} style={{
                      width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2,
                      color: on ? Z.bg0 : Z.inkDim, background: on ? accentFor : 'transparent',
                      border: `1px solid ${on ? accentFor : Z.line}`, transition: 'all .12s'
                    }}><Icon name={g} size={17} /></button>);

                })}
                </div>

                <FieldLabel style={{ marginTop: 16 }}>Povolené nástroje</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {ALL_TOOLS.map((t) => <ChipToggle key={t} active={draft.tools.includes(t)} accent={accentFor} onClick={() => toggleTool(t)}>{t}</ChipToggle>)}
                </div>

                {gated &&
                <React.Fragment>
                  <FieldLabel style={{ marginTop: 16 }}>Approval gate</FieldLabel>
                  <GatePanel tools={riskyTools} style={{ marginTop: 8 }} />
                  <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 7, lineHeight: 1.5 }}>
                    Odvozeno z Integrací (rizikové nástroje připojených služeb). Risk je vlastnost nástroje — needituje se tady.
                  </Mono>
                </React.Fragment>
                }

                <FieldLabel style={{ marginTop: 16 }}>Akce bezpečná až po <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· čas nebo podmínka</span></FieldLabel>
                <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                  <ChipToggle active={(draft.safeAfterKind || 'time') === 'time'} accent={accentFor} onClick={() => set({ safeAfterKind: 'time' })}>čas</ChipToggle>
                  <ChipToggle active={draft.safeAfterKind === 'cond'} accent={accentFor} onClick={() => set({ safeAfterKind: 'cond' })}>podmínka</ChipToggle>
                </div>
                <TextInput value={draft.safeAfter || ''} onChange={(v) => set({ safeAfter: v })}
                  placeholder={draft.safeAfterKind === 'cond' ? 'např. CI je zelené' : 'např. po 09:00'} mono />
                <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 7, lineHeight: 1.5 }}>
                  Volitelné. Dokud nenastane, projde i jinak bezpečná akce frontou schválení.
                </Mono>
              </div>

              {/* right column — content source */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <FieldLabel style={{ marginBottom: 0, flex: 1 }}>Obsah skillu</FieldLabel>
                  <div style={{ display: 'inline-flex', border: `1px solid ${Z.line}`, borderRadius: 3, overflow: 'hidden' }}>
                    {[['folder', 'Složka'], ['editor', 'Editor']].map(([id, label]) => {
                      const on = contentMode === id;
                      return (
                        <button key={id} onClick={() => setContentMode(id)} style={{
                          fontFamily: Z.mono, fontSize: 11, fontWeight: 600, padding: '6px 14px', cursor: 'pointer',
                          border: 'none', color: on ? Z.bg0 : Z.inkDim, background: on ? accentFor : 'transparent', transition: 'all .12s'
                        }}>{label}</button>
                      );
                    })}
                  </div>
                </div>

                {contentMode === 'folder' &&
                  <div>
                    <div
                      onDragOver={e => { e.preventDefault(); setFolderDrag(true); }}
                      onDragLeave={() => setFolderDrag(false)}
                      onDrop={e => { e.preventDefault(); setFolderDrag(false); handleFolderSelect(e.dataTransfer.files); }}
                      onClick={() => folderInputRef.current && folderInputRef.current.click()}
                      style={{
                        border: `1.5px dashed ${folderDrag ? accentFor : Z.line}`,
                        borderRadius: 4, padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
                        background: folderDrag ? `${accentFor}0a` : Z.bg0, transition: 'all .15s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
                      }}
                    >
                      <div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 4, background: folderDrag ? `${accentFor}18` : Z.bg1, border: `1px solid ${folderDrag ? accentFor + '66' : Z.line}`, transition: 'all .15s' }}>
                        <Icon name="folder" size={26} style={{ color: folderDrag ? accentFor : Z.inkFaint }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, color: Z.ink, fontWeight: 500 }}>Přetáhni složku nebo klikni pro výběr</div>
                        <Mono style={{ fontSize: 11, color: Z.inkFaint, display: 'block', marginTop: 5 }}>
                          Načtou se <span style={{ color: accentFor }}>.md</span> · .markdown · .txt · podsložky
                        </Mono>
                      </div>
                      <input
                        ref={el => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('multiple', ''); } folderInputRef.current = el; }}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={e => handleFolderSelect(e.target.files)}
                      />
                    </div>

                    {folderFiles.length > 0 &&
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                          <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>
                            {folderFiles.length} souborů · <span style={{ color: accentFor }}>{folderFiles.filter(f => f.checked).length} vybráno</span>
                          </Mono>
                          <button onClick={importToEditor} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: Z.mono, fontSize: 11,
                            fontWeight: 600, padding: '7px 14px', cursor: 'pointer', borderRadius: 2,
                            color: Z.bg0, background: accentFor, border: 'none', boxShadow: `0 0 14px ${accentFor}44`
                          }}><Icon name="check" size={13} stroke={2} /> Import do editoru</button>
                        </div>
                        <div style={{ border: `1px solid ${Z.line}`, borderRadius: 4, overflow: 'hidden', maxHeight: 290, overflowY: 'auto', background: Z.bg0 }}>
                          {folderFiles.map((f, i) => {
                            const depth = (f.path.match(/\//g) || []).length;
                            const sizeKb = (f.size / 1024).toFixed(1);
                            return (
                              <div
                                key={f.path}
                                onClick={() => toggleFileCheck(f.path)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 9,
                                  padding: `9px 14px 9px ${14 + depth * 18}px`,
                                  borderBottom: i < folderFiles.length - 1 ? `1px solid ${Z.line}` : 'none',
                                  cursor: 'pointer', background: f.checked ? `${accentFor}09` : 'transparent', transition: 'background .1s'
                                }}
                              >
                                <div style={{
                                  width: 15, height: 15, flex: '0 0 auto', borderRadius: 2,
                                  border: `1.5px solid ${f.checked ? accentFor : Z.line}`,
                                  background: f.checked ? accentFor : 'transparent',
                                  display: 'grid', placeItems: 'center', transition: 'all .12s'
                                }}>
                                  {f.checked && <Icon name="check" size={10} stroke={2.5} style={{ color: Z.bg0 }} />}
                                </div>
                                <Icon name="doc" size={13} style={{ color: f.checked ? accentFor : Z.inkFaint, flex: '0 0 auto' }} />
                                <Mono style={{ fontSize: 11.5, color: f.checked ? Z.ink : Z.inkDim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Mono>
                                {depth > 0 && <Mono style={{ fontSize: 9.5, color: Z.inkFaint, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').slice(0, -1).join('/')}</Mono>}
                                <Mono style={{ fontSize: 10, color: Z.inkFaint, flex: '0 0 auto' }}>{sizeKb} kB</Mono>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    }
                  </div>
                }

                {contentMode === 'editor' &&
                  <MarkdownEditor value={splitFrontmatter(draft.body).content} onChange={(v) => setDraft((d) => ({ ...d, body: skillFront(d) + '\n\n' + v }))} accent={accentFor} minHeight={380} placeholder="Markdown obsah skillu…" />
                }
              </div>
            </div>

            {/* footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
              <button onClick={() => {if (isNew) {onClose();} else {setDraft(skill);setMode('view');}}} style={{
              fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2,
              color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`
            }}>Zrušit</button>
              <RunBtn accent={accentFor} label={isNew ? 'Vytvořit skill' : 'Uložit změny'}
            onClick={() => onSave({ ...draft, body: skillFront(draft) + '\n\n' + splitFrontmatter(draft.body).content }, isNew)} />
            </div>
          </>
        }
      </div>

      {confirm &&
      <ConfirmDialog
        title="Smazat skill?"
        message={<span>Opravdu smazat skill <Mono style={{ color: Z.ink }}>{skill.name}</Mono>? Smaže se i soubor <Mono style={{ color: Z.inkDim }}>{skill.file}</Mono>. Tuto akci nelze vrátit.</span>}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {setConfirm(false);onDelete(skill.id);}} />

      }
    </div>);

};

// ---- main body -----------------------------------------------------------
const SkillsBody = ({ accent, skills, setSkills, cats = [], setCats, gateRules = [], projects = [] }) => {
  const [openId, setOpenId] = useStateS(null);
  const [newDraft, setNewDraft] = useStateS(null);
  const [runSkill, setRunSkill] = useStateS(null);
  const [q, setQ] = useStateS('');

  const list = skills;
  const query = q.trim().toLowerCase();
  const filtered = query ? list.filter((s) => (s.name + ' ' + s.desc + ' ' + s.category).toLowerCase().includes(query)) : list;
  const pinnedCount = list.filter((s) => s.pinned).length;

  const togglePin = (id) => setSkills((prev) => prev.map((s) => s.id === id ? { ...s, pinned: !s.pinned } : s));
  const addCat = (name, glyph) => {if (glyph) CATEGORY_GLYPH[name] = glyph;setCats((prev) => prev.includes(name) ? prev : [...prev, name]);};
  const delCat = (name) => {if (list.some((s) => s.category === name)) return;setCats((prev) => prev.filter((c) => c !== name));};
  const save = (draft, isNew) => {
    if (isNew) {
      const id = (draft.name || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill-' + Date.now();
      const final = { ...draft, id, file: `~/zibby/skills/${id}/SKILL.md`, runs: 0, lastRun: '—', gateRuleIds: [], state: 'idle' };
      setSkills((prev) => [...prev, final]);
      setNewDraft(null);
      setOpenId(id);
    } else {
      setSkills((prev) => prev.map((s) => s.id === draft.id ? draft : s));
    }
  };
  const del = (id) => {setSkills((prev) => prev.filter((s) => s.id !== id));setOpenId(null);};

  const openSkill = skills.find((s) => s.id === openId) || null;

  const startNew = () => setNewDraft({
    id: '', name: '', glyph: 'spark', category: cats[0] || '', desc: '',
    tools: ['read'], model: 'sonnet', pinned: false, state: 'idle', runs: 0, lastRun: '—', gateRuleIds: [],
    body: `---\nname: novy-skill\ncategory: ${cats[0] || ''}\ntools: [read]\n---\n\n# Nový skill\n\nPopiš, co skill dělá.\n\n## Kdy použít\n…\n\n## Postup\n1. …\n`
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 600 }}>Skilly</div>
            </div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {list.length} skill{list.length === 1 ? '' : list.length >= 2 && list.length <= 4 ? 'y' : 'ů'} · <span style={{ color: accent }}>{pinnedCount} připnuto</span> · {cats.length} kategorií
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CatAdder accent={accent} existing={cats} onAdd={addCat} />
            <RunBtn accent={accent} label="Přidat skill" onClick={startNew} icon="plus" />
          </div>
        </div>
      </HudPanel>

      {/* category sections */}
      {cats.map((cat) => {
        const all = list.filter((s) => s.category === cat);
        const items = query ? filtered.filter((s) => s.category === cat) : all;
        if (query && items.length === 0) return null;
        const empty = all.length === 0;
        return (
          <div key={cat}>
            <SectionLabel right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{all.length}</Mono>
                {empty && !query &&
              <button onClick={() => delCat(cat)} title="Smazat prázdnou kategorii" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 10, padding: '4px 9px',
                cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}44`
              }}><Icon name="trash" size={12} /> Smazat</button>
              }
              </div>
            }>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name={CATEGORY_GLYPH[cat] || 'spark'} size={13} style={{ color: accent }} /> {cat}
              </span>
            </SectionLabel>
            {items.length > 0 ?
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(266px, 1fr))', gap: 13 }}>
                {items.map((s) =>
              <SkillCard key={s.id} skill={s} accent={accent} onOpen={setOpenId} onRun={setRunSkill} onTogglePin={togglePin} />
              )}
              </div> :

            <div style={{ padding: '18px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}>
                <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Prázdná kategorie — přidej sem skill, nebo ji smaž.</Mono>
              </div>
            }
          </div>);

      })}

      {/* empty search */}
      {query && filtered.length === 0 &&
      <HudPanel accent={accent} pad={40}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <Icon name="search" size={26} style={{ color: Z.inkFaint }} />
            <Mono style={{ fontSize: 12, color: Z.inkDim }}>Nic nenalezeno pro „{q}“.</Mono>
          </div>
        </HudPanel>
      }

      {/* detail / editor */}
      {openSkill &&
      <SkillModal key={openSkill.id} skill={openSkill} mode="view" accent={accent} cats={cats}
      onClose={() => setOpenId(null)} onSave={save} onDelete={del} onTogglePin={togglePin} gateRules={gateRules} />
      }
      {newDraft &&
      <SkillModal key="new" skill={newDraft} mode="new" accent={accent} cats={cats}
      onClose={() => setNewDraft(null)} onSave={save} onDelete={del} onTogglePin={togglePin} gateRules={gateRules} />
      }

      {/* run modal (reuse) */}
      <RunModal skill={runSkill} accent={accent} onClose={() => setRunSkill(null)} projects={projects} />
    </div>);

};

Object.assign(window, { SkillsBody, SkillCard, SkillModal, ConfirmDialog, CatAdder, GatedBadge, GatePanel, ActionBoundaryNote });
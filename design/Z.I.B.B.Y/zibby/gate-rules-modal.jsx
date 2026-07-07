// ZIBBY velín — Pravidla schvalování · modal "Přidat / upravit pravidlo"
const { useState: useStateGR3 } = React;

const grInput = {
  width: '100%', marginTop: 8, padding: '9px 12px', background: Z.bg0, border: `1px solid ${Z.line}`,
  borderRadius: 3, color: Z.ink, fontFamily: Z.mono, fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const GRSelect = ({ value, onChange, options, accent }) => (
  <div style={{ position: 'relative', marginTop: 8 }}>
    <select onChange={(e) => onChange(e.target.value)} style={{
      width: '100%', padding: '9px 34px 9px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3,
      color: Z.ink, fontFamily: Z.mono, fontSize: 13, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box',
    }} value={value}>
      {options.map((o) => Array.isArray(o) ? <option key={o[0]} style={{ background: Z.bg1 }} value={o[0]}>{o[1]}</option> : <option key={o} style={{ background: Z.bg1 }} value={o}>{o}</option>)}
    </select>
    <Icon name="chevron" size={14} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: Z.inkFaint, pointerEvents: 'none' }} />
  </div>
);
const SegRow = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>{children}</div>;
const Seg = ({ active, accent, onClick, children, title }) => (
  <button onClick={onClick} style={{
    fontFamily: Z.mono, fontSize: 11.5, padding: '7px 12px', cursor: 'pointer', borderRadius: 2,
    color: active ? Z.bg0 : Z.inkDim, background: active ? accent : 'transparent',
    border: `1px solid ${active ? accent : Z.line}`, transition: 'all .12s', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
  }} title={title}>{children}</button>
);

// ---- decision: 4 velká tlačítka ------------------------------------------
const DecisionPick = ({ value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9, marginTop: 9 }}>
    {DECISION_ORDER.map((k) => {
      const d = DECISION[k]; const on = value === k;
      return (
        <button key={k} onClick={() => onChange(k)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '13px 13px', cursor: 'pointer', borderRadius: 3, textAlign: 'left',
          background: on ? `${d.c}1f` : 'transparent', border: `1px solid ${on ? d.c : Z.line}`,
          boxShadow: on ? `0 0 0 1px ${d.c}55, 0 0 18px ${d.c}22` : 'none', transition: 'all .14s',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: d.c }}>
            <Icon name={d.icon} size={15} stroke={1.8} />
            <Mono style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>{d.token}</Mono>
          </span>
          <span style={{ fontSize: 10, color: on ? Z.inkDim : Z.inkFaint, lineHeight: 1.35, fontFamily: Z.mono }}>{d.cz}</span>
        </button>
      );
    })}
  </div>
);

// ---- resolution editor (jen u ask) ---------------------------------------
const ResolutionEditor = ({ resolution, mode, onChange, onMode, accent }) => {
  const setRes = (i, patch) => onChange(resolution.map((r, j) => j === i ? { ...r, ...patch } : r));
  const add = () => onChange([...resolution, { kind: 'human' }]);
  const remove = (i) => onChange(resolution.filter((_, j) => j !== i));
  return (
    <div style={{ marginTop: 9, padding: 14, background: `${Z.warn}0a`, border: `1px solid ${Z.warn}33`, borderRadius: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="shield" size={13} style={{ color: Z.warn }} />
        <Mono style={{ fontSize: 10, color: Z.warn, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vyřešení — jak se gate vyčistí</Mono>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {resolution.map((r, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 8px' }}>
                <Seg accent={accent} active={mode === 'all'} onClick={() => onMode('all')}>Všechny · AND</Seg>
                <Seg accent={accent} active={mode === 'any'} onClick={() => onMode('any')}>Kterákoli · OR</Seg>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['human', 'Ty'], ['check', 'check'], ['agent', 'agent']].map(([k, lbl]) => (
                  <Seg accent={accent} active={r.kind === k} key={k}
                    onClick={() => setRes(i, k === 'check' ? { kind: 'check', name: 'ci_green' } : k === 'agent' ? { kind: 'agent', name: 'reviewer' } : { kind: 'human' })}>{lbl}</Seg>
                ))}
              </div>
              {r.kind === 'check' && <div style={{ flex: 1, minWidth: 0 }}><GRSelect onChange={(v) => setRes(i, { name: v })} options={CHECK_NAMES.map((c) => [c[0], 'check.' + c[0]])} value={r.name} /></div>}
              {r.kind === 'agent' && <div style={{ flex: 1, minWidth: 0 }}><GRSelect onChange={(v) => setRes(i, { name: v })} options={RESOLVE_AGENTS.map((a) => [a, 'agent: ' + a])} value={r.name} /></div>}
              {r.kind === 'human' && <Mono style={{ flex: 1, fontSize: 10.5, color: Z.inkFaint }}>tvůj tap ve frontě schválení</Mono>}
              {resolution.length > 1 && (
                <button onClick={() => remove(i)} style={{ flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 28, height: 28, cursor: 'pointer', borderRadius: 2, background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkFaint }} title="Odebrat podmínku"><Icon name="x" size={13} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 11, padding: '6px 10px', cursor: 'pointer', borderRadius: 2, fontFamily: Z.mono, fontSize: 11, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`, whiteSpace: 'nowrap' }}>
        <Icon name="plus" size={12} /> Přidat podmínku
      </button>
    </div>
  );
};

// ---- modal ----------------------------------------------------------------
const RuleModal = ({ accent, initial, onClose, onSave }) => {
  const ini = initial || {};
  const [type, setType] = useStateGR3(ini.type || 'tool');
  const [tool, setTool] = useStateGR3(ini.tool || 'bash');
  const [verb, setVerb] = useStateGR3(ini.verb || 'push');
  const [pattern, setPattern] = useStateGR3(ini.pattern || '');
  const [label, setLabel] = useStateGR3(ini.type === 'action' ? ini.label : 'purchase');
  const [metric, setMetric] = useStateGR3(ini.metric || 'purchase.amount');
  const [op, setOp] = useStateGR3(ini.op || '>');
  const [val, setVal] = useStateGR3(ini.value || '500');
  const [scopeKind, setScopeKind] = useStateGR3(ini.scopeKind || 'branch');
  const [decision, setDecision] = useStateGR3(ini.decision || 'ask');
  const [resolution, setResolution] = useStateGR3(ini.resolution && ini.resolution.length ? ini.resolution : [{ kind: 'human' }]);
  const [mode, setMode] = useStateGR3(ini.mode || 'all');

  const draft = () => {
    const r = { id: ini.id || newRid(), type, decision };
    if (type === 'tool') { r.tool = tool; if (tool === 'git') r.verb = verb; r.pattern = pattern || (tool === 'git' ? 'main' : 'rm -rf*'); }
    else if (type === 'action') { r.label = label; }
    else if (type === 'threshold') { r.metric = metric; r.op = op; r.value = val; }
    else if (type === 'scope') { r.scopeKind = scopeKind; r.pattern = pattern || 'feature/*'; }
    r.resolution = decision === 'ask' ? resolution : [];
    r.mode = mode;
    return r;
  };
  const preview = draft();

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.78)', backdropFilter: 'blur(4px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}><Icon name="shield" size={17} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 14.5, fontWeight: 700, color: Z.ink }}>{initial ? 'Upravit pravidlo' : 'Přidat pravidlo'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>matcher → rozhodnutí → vyřešení</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: 20, overflow: 'auto' }}>
          {/* 1) Spouštěč */}
          <FieldLabel><span style={{ color: accent }}>1</span> · Spouštěč — matcher</FieldLabel>
          <SegRow>
            {MATCHER_ORDER.map((k) => <Seg accent={accent} active={type === k} key={k} onClick={() => setType(k)} title={MATCHER[k].hint}>{MATCHER[k].label}</Seg>)}
          </SegRow>
          <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 8 }}>{MATCHER[type].hint}</Mono>

          <div style={{ marginTop: 12 }}>
            {type === 'tool' && (<>
              <SegRow>{['bash', 'git', 'web', 'read', 'write'].map((t) => <Seg accent={accent} active={tool === t} key={t} onClick={() => setTool(t)}>{t}</Seg>)}</SegRow>
              {tool === 'git' && <SegRow>{['push', 'merge', 'fetch', 'reset'].map((v) => <Seg accent={accent} active={verb === v} key={v} onClick={() => setVerb(v)}>{v}</Seg>)}</SegRow>}
              <input onChange={(e) => setPattern(e.target.value)} placeholder={tool === 'git' ? 'main' : 'rm -rf*'} style={grInput} value={pattern} />
            </>)}
            {type === 'action' && (<>
              <SegRow>{ACTION_VERBS.map((v) => <Seg accent={accent} active={label === v} key={v} onClick={() => setLabel(v)}>{v}</Seg>)}</SegRow>
            </>)}
            {type === 'threshold' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 1fr', gap: 9 }}>
                <GRSelect onChange={setMetric} options={THRESHOLD_METRICS} value={metric} />
                <GRSelect onChange={setOp} options={['>', '>=', '<', '<=', '==']} value={op} />
                <input onChange={(e) => setVal(e.target.value)} placeholder="500" style={{ ...grInput, marginTop: 8 }} value={val} />
              </div>
            )}
            {type === 'scope' && (<>
              <SegRow>{SCOPE_KINDS.map(([k, l]) => <Seg accent={accent} active={scopeKind === k} key={k} onClick={() => setScopeKind(k)}>{l}</Seg>)}</SegRow>
              <input onChange={(e) => setPattern(e.target.value)} placeholder="feature/*" style={grInput} value={pattern} />
            </>)}

          </div>

          {/* 2) Rozhodnutí */}
          <FieldLabel style={{ marginTop: 22 }}><span style={{ color: accent }}>2</span> · Rozhodnutí</FieldLabel>
          <DecisionPick onChange={setDecision} value={decision} />

          {/* 3) Vyřešení */}
          {decision === 'ask' && (<>
            <FieldLabel style={{ marginTop: 22 }}><span style={{ color: accent }}>3</span> · Vyřešení</FieldLabel>
            <ResolutionEditor accent={accent} mode={mode} onChange={setResolution} onMode={setMode} resolution={resolution} />
          </>)}

          {/* live náhled */}
          <FieldLabel style={{ marginTop: 22 }}>Náhled pravidla</FieldLabel>
          <div style={{ marginTop: 8 }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9, background: Z.panel, border: `1px solid ${Z.line}`, borderLeft: `3px solid ${(DECISION[decision] || DECISION.ask).c}`, borderRadius: 2, padding: '11px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={MATCHER[type].icon} size={14} style={{ flex: '0 0 auto', color: Z.inkFaint }} />
                <div style={{ flex: 1, minWidth: 0 }}><MatcherText rule={preview} /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', paddingLeft: 23 }}>
                <DecisionBadge decision={decision} />
                {decision === 'ask' && <ResolutionChips mode={mode} resolution={resolution} />}
                {decision === 'notify' && <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>→ activity feed</Mono>}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
          <RunBtn accent={accent} label={<span style={{ whiteSpace: 'nowrap' }}>Uložit pravidlo</span>} onClick={() => onSave(draft())} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { RuleModal, DecisionPick, ResolutionEditor, GRSelect, Seg, SegRow });

// ZIBBY Velín-C — Pipelines uvnitř detailu subsystému. Bez dialogu-v-dialogu:
// klik na pipelinu sbalí levou (hlavní) část do úzkého pruhu a napravo od
// seznamu pipeline se vykreslí její detail — styl převzatý z Velínu-B
// (záložka Orchestrace: zřetězení fází, retry smyčka), portovaný na ZT tokeny.
const { useState: useStatePl, useRef: useRefPl, useEffect: useEffectPl } = React;

const vcPipeSlug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const vcAgentNames = () => AGENTS.filter((a) => a.ctx === 'work' || !a.ctx).map((a) => a.name);

// ── seznam pipeline (karty) ────────────────────────────────────────────────
const VcPipelineListCard = ({ p, hue, activeCount, selected, onSelect }) => (
  <div onClick={onSelect} style={{
    padding: '11px 12px', borderRadius: ZT.rCtl, cursor: 'pointer', transition: 'border-color .14s, background .14s',
    background: selected ? `${hue}14` : ZT.bg, border: `1px solid ${selected ? hue : ZT.line}`,
  }} onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = `${hue}55`; }} onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = ZT.line; }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 26, height: 26, flex: '0 0 auto', borderRadius: ZT.rCtl, display: 'grid', placeItems: 'center', background: `${hue}1e`, color: hue, border: `1px solid ${hue}44` }}>
        <Icon name="flow" size={13} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
        <div style={{ ...T.micro, fontSize: 9.5, marginTop: 1 }}>{p.phases.length} fází{activeCount ? ` · ${activeCount} běží` : ''}</div>
      </div>
      <Icon name="chevron" size={13} style={{ color: selected ? hue : ZT.ink3, flex: '0 0 auto' }} />
    </div>
    {p.routing && <div style={{ ...T.micro, fontSize: 9, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${ZT.line}`, color: ZT.ink3, fontFamily: ZT.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.routing}</div>}
  </div>
);

const VcPipelineList = ({ pipelines, hue, tasks, selectedId, onSelect, onNew }) => {
  const countFor = (p) => tasks.filter((t) => t.kind === p.name).length;
  return (
    <VcBlock title="Pipelines" right={
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.ink3 }}>{pipelines.length}</span>
        <button onClick={onNew} title="Nová pipeline" style={{ background: 'none', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink2, cursor: 'pointer', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 5, fontFamily: ZT.mono, fontSize: 10.5 }}>
          <Icon name="plus" size={11} /> Nová
        </button>
      </div>
    }>
      {pipelines.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {pipelines.map((p) => (
            <VcPipelineListCard key={p.id} p={p} hue={hue} activeCount={countFor(p)} selected={p.id === selectedId} onSelect={() => onSelect(p.id)} />
          ))}
        </div>
      ) : <VcMuted>Zatím žádná pipeline — nové úlohy poputují přímo na posádku.</VcMuted>}
    </VcBlock>
  );
};

// ── uzel fáze (editovatelný) ───────────────────────────────────────────────
const VcPhaseNode = ({ ph, idx, isFirst, isLast, hue, agentNames, onChange, onRemove, onMove }) => {
  const a = agentByName(ph.agent);
  return (
    <div style={{ position: 'relative', flex: '1 0 172px', minWidth: 172, background: ph.loop ? `${hue}0a` : ZT.bg, border: `1px solid ${ph.loop ? hue + '66' : ZT.line}`, borderRadius: ZT.rCtl, padding: '12px 12px 11px', boxShadow: ph.loop ? `0 0 0 1px ${hue}33` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 26, height: 26, flex: '0 0 auto', borderRadius: ZT.rCtl, display: 'grid', placeItems: 'center', background: `${hue}1e`, color: hue, border: `1px solid ${hue}44`, marginTop: 1 }}>
          <Icon name={a.glyph || 'bot'} size={13} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ ...T.micro, fontSize: 8.5, letterSpacing: '0.1em', display: 'block' }}>FÁZE {idx + 1}</span>
          <select value={ph.agent} onChange={(e) => onChange({ ...ph, agent: e.target.value })}
            style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: ZT.ink, fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 600, padding: 0, outline: 'none', cursor: 'pointer' }}>
            {agentNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 1, flex: '0 0 auto' }}>
          <button disabled={isFirst} onClick={() => onMove(-1)} style={{ background: 'none', border: 'none', cursor: isFirst ? 'default' : 'pointer', opacity: isFirst ? 0.25 : 1, color: ZT.ink3, padding: 3, display: 'flex' }}><Icon name="chevron" size={11} style={{ transform: 'rotate(-90deg)' }} /></button>
          <button disabled={isLast} onClick={() => onMove(1)} style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', opacity: isLast ? 0.25 : 1, color: ZT.ink3, padding: 3, display: 'flex' }}><Icon name="chevron" size={11} style={{ transform: 'rotate(90deg)' }} /></button>
          <button onClick={onRemove} title="Smazat fázi" style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 3, display: 'flex' }}><Icon name="x" size={11} /></button>
        </div>
      </div>
      {(a.model || a.thinking) && (
        <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
          {a.model && <span style={{ fontFamily: ZT.mono, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 999, color: hue, background: `${hue}14`, border: `1px solid ${hue}44` }}>{a.model}</span>}
          {a.thinking && <span style={{ fontFamily: ZT.mono, fontSize: 9, padding: '2px 6px', borderRadius: 999, color: ZT.ink3, background: ZT.surface, border: `1px solid ${ZT.line}` }}>◇ {a.thinking}</span>}
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!ph.loop} onChange={(e) => onChange({ ...ph, loop: e.target.checked ? { to: agentNames[0], maxRetries: 2 } : undefined })} />
        <span style={{ ...T.micro, fontSize: 10 }}>retry smyčka</span>
      </label>
      {ph.loop && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{ ...T.micro, fontSize: 9.5 }}>zpět na</span>
          <select value={ph.loop.to} onChange={(e) => onChange({ ...ph, loop: { ...ph.loop, to: e.target.value } })}
            style={{ background: ZT.surface, color: ZT.ink, border: `1px solid ${ZT.line}`, borderRadius: 6, fontFamily: ZT.mono, fontSize: 10.5, padding: '2px 6px', outline: 'none' }}>
            {agentNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span style={{ ...T.micro, fontSize: 9.5 }}>max</span>
          <input type="number" min={1} max={9} value={ph.loop.maxRetries} onChange={(e) => onChange({ ...ph, loop: { ...ph.loop, maxRetries: Math.max(1, Math.min(9, +e.target.value || 1)) } })}
            style={{ width: 32, background: ZT.surface, color: ZT.ink, border: `1px solid ${ZT.line}`, borderRadius: 6, fontFamily: ZT.mono, fontSize: 10.5, padding: '2px 5px', outline: 'none' }} />
        </div>
      )}
    </div>
  );
};

const VcEdge = () => (
  <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', alignSelf: 'center', padding: '0 3px' }}>
    <Icon name="arrow" size={15} style={{ color: ZT.ink3 }} />
  </div>
);

// ── zřetězení fází s vizuálem retry smyčky (styl Velín-B) ──────────────────
const VcPhaseChain = ({ phases, hue, agentNames, onChange }) => {
  const n = phases.length;
  const loopIdx = phases.findIndex((p) => p.loop);
  const loopPhase = loopIdx >= 0 ? phases[loopIdx] : null;
  const cx = (i) => (i + 0.5) / Math.max(n, 1) * 100;
  let targetIdx = loopPhase ? phases.findIndex((p) => p.agent === loopPhase.loop.to) : -1;
  if (loopPhase && targetIdx < 0) targetIdx = Math.max(loopIdx - 1, 0);
  const x1 = loopPhase ? cx(loopIdx) : 0;
  const x2 = loopPhase ? cx(targetIdx) : 0;
  const nextName = loopPhase ? (phases[loopIdx + 1] ? phases[loopIdx + 1].agent : 'konec pipeline') : null;

  const setPhase = (i, next) => onChange(phases.map((p, j) => j === i ? next : p));
  const removePhase = (i) => onChange(phases.filter((_, j) => j !== i));
  const movePhase = (i, dir) => onChange((() => {
    const j = i + dir; if (j < 0 || j >= phases.length) return phases;
    const copy = phases.slice(); const [x] = copy.splice(i, 1); copy.splice(j, 0, x); return copy;
  })());
  const addPhase = () => onChange([...phases, { agent: agentNames[0] }]);

  return (
    <div>
      {loopPhase && (
        <div style={{ position: 'relative', height: 30 }}>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <path d={`M${x1} 26 L ${x1} 6 L ${x2} 6 L ${x2} 26`} fill="none" stroke={ZT.bad} strokeWidth="1.2" strokeDasharray="3 3" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
            <path d={`M${x2} 26 l 2.6 -5 l -5.2 0 z`} fill={ZT.bad} />
          </svg>
          <div style={{ position: 'absolute', left: `${(x1 + x2) / 2}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Icon name="retry" size={11} style={{ color: ZT.bad }} />
            <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.bad }}>retry · max {loopPhase.loop.maxRetries}</span>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 2, minWidth: 'fit-content' }}>
          {phases.map((ph, i) => (
            <React.Fragment key={i}>
              <VcPhaseNode ph={ph} idx={i} isFirst={i === 0} isLast={i === phases.length - 1} hue={hue} agentNames={agentNames}
                onChange={(next) => setPhase(i, next)} onRemove={() => removePhase(i)} onMove={(dir) => movePhase(i, dir)} />
              {i < phases.length - 1 && <VcEdge />}
            </React.Fragment>
          ))}
          <button onClick={addPhase} style={{ flex: '0 0 96px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: `1px dashed ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink2, cursor: 'pointer', minHeight: 84 }}>
            <Icon name="plus" size={14} /><span style={{ ...T.micro, fontSize: 9.5 }}>fáze</span>
          </button>
        </div>
      </div>
      {loopPhase && (
        <div style={{ display: 'flex', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: `${ZT.ok}0d`, border: `1px solid ${ZT.ok}3a`, borderRadius: ZT.rCtl }}>
            <Icon name="check" size={14} style={{ color: ZT.ok }} />
            <div>
              <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.ok, fontWeight: 600, display: 'block' }}>kontrola prošla</span>
              <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3 }}>→ pokračuje na {nextName}</span>
            </div>
          </div>
          <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: `${ZT.bad}0d`, border: `1px solid ${ZT.bad}3a`, borderRadius: ZT.rCtl }}>
            <Icon name="retry" size={14} style={{ color: ZT.bad }} />
            <div>
              <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.bad, fontWeight: 600, display: 'block' }}>kontrola selhala</span>
              <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3 }}>→ zpět na {loopPhase.loop.to} · po {loopPhase.loop.maxRetries} pokusech park</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── detail pipeline (napravo od seznamu, žádný dialog-v-dialogu) ──────────
const VcPipelineDetail = ({ pipeline, hue, agentNames, activeCount, isNew, onChange, onSave, onDelete, onCancel }) => {
  const valid = pipeline.name.trim() && pipeline.phases.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <input value={pipeline.name} onChange={(e) => onChange({ ...pipeline, name: e.target.value })} placeholder="Název pipeline"
          style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', borderBottom: `1px solid ${ZT.line}`, color: ZT.ink, fontFamily: ZT.sans, fontSize: 20, fontWeight: 600, padding: '2px 0 8px', outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ ...T.micro, fontSize: 10 }}>ROUTOVÁNÍ</span>
          <input value={pipeline.routing || ''} onChange={(e) => onChange({ ...pipeline, routing: e.target.value })} placeholder="např. bugfix, feature → tato pipeline"
            style={{ flex: 1, minWidth: 0, background: ZT.bg, border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink2, fontFamily: ZT.mono, fontSize: 11.5, padding: '6px 10px', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <span style={{ ...T.micro, fontSize: 10.5 }}>{pipeline.phases.length} fází</span>
          <span style={{ ...T.micro, fontSize: 10.5 }}>{activeCount ? `${activeCount} úloh běží` : 'nic právě neběží'}</span>
        </div>
      </div>

      <div>
        <span style={{ ...T.label, display: 'block', marginBottom: 12 }}>Zřetězení fází</span>
        <VcPhaseChain phases={pipeline.phases} hue={hue} agentNames={agentNames} onChange={(phases) => onChange({ ...pipeline, phases })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 14, borderTop: `1px solid ${ZT.line}` }}>
        {!isNew && <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.bad, fontFamily: ZT.mono, fontSize: 11.5, padding: '7px 4px' }}>Smazat pipeline</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 9 }}>
          <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink2, fontFamily: ZT.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer' }}>Zpět</button>
          <button disabled={!valid} onClick={onSave} style={{ background: hue, border: 'none', borderRadius: ZT.rCtl, color: ZT.bg, fontFamily: ZT.mono, fontSize: 12, fontWeight: 600, padding: '8px 15px', cursor: valid ? 'pointer' : 'default', opacity: valid ? 1 : 0.4 }}>Uložit</button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { VcPipelineList, VcPipelineDetail, VcPhaseChain, vcPipeSlug, vcAgentNames });

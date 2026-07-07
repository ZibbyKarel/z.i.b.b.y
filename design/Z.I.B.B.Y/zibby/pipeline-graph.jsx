// ZIBBY velín — Orchestrace · vizuální node-graph editor pipeline.
// Agenti se přetahují z palety na canvas → uzly grafu. Mezi uzly se táhnou šipky:
//   • výstup (pravý port) → vstup (levý port) dalšího agenta  = I/O hrana (předání souboru)
//   • horní port → některý z předchozích agentů               = vrácení k přepracování (rework)
// Source of truth editoru je graf; při uložení se z něj odvodí lineární phases[] (kompatibilita).
const { useState: useStateG, useRef: useRefG, useEffect: useEffectG } = React;

// ---- geometrie ------------------------------------------------------------
const NODE_W = 188;
const NODE_H = 64;
const GAP_X = 84;
const CANVAS_W = 1680;
const CANVAS_H = 940;

const PG_MODEL_C = { opus: '#b07cff', sonnet: '#56c4d6', haiku: '#7fd98a' };
const PG_THINK_C = { high: '#f0883e', medium: '#5b8def', low: '#5d6b7a' };

let _gid = 0;
const guid = (p) => `${p}${++_gid}${Date.now().toString(36).slice(-3)}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const docSlug = (s) => (s || 'agent').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- graf ⟷ phases --------------------------------------------------------
function graphToPhases(graph) {
  const { nodes = [], edges = [], rework = [] } = graph || {};
  if (!nodes.length) return [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const incoming = {}, outgoing = {};
  edges.forEach((e) => { outgoing[e.from] = e; incoming[e.to] = e; });
  let start = nodes.find((n) => !incoming[n.id]) || nodes[0];
  const order = []; const seen = new Set();
  let cur = start;
  while (cur && !seen.has(cur.id)) { order.push(cur); seen.add(cur.id); const oe = outgoing[cur.id]; cur = oe ? byId[oe.to] : null; }
  nodes.forEach((n) => { if (!seen.has(n.id)) { order.push(n); seen.add(n.id); } });
  return order.map((n) => {
    const inE = incoming[n.id], outE = outgoing[n.id];
    const rw = rework.find((r) => r.from === n.id);
    const ph = {
      agent: n.agent, model: n.model, thinking: n.thinking,
      consumes: inE ? inE.file : 'vstup.md',
      produces: outE ? outE.file : 'výstup.md',
    };
    if (rw) { const t = byId[rw.to]; ph.loop = { to: t ? t.agent : n.agent, maxRetries: rw.maxRetries, escalate: !!rw.escalate, then: 'park_for_review' }; }
    return ph;
  });
}

function phasesToGraph(p) {
  const phases = (p && p.phases) || [];
  const nodes = phases.map((ph, i) => ({ id: 'n' + (i + 1), agent: ph.agent, x: 56 + i * (NODE_W + GAP_X), y: 200, model: ph.model, thinking: ph.thinking }));
  const edges = [];
  for (let i = 0; i < phases.length - 1; i++) edges.push({ id: 'e' + i, from: nodes[i].id, to: nodes[i + 1].id, file: phases[i + 1].consumes || phases[i].produces || 'soubor.md' });
  const rework = [];
  phases.forEach((ph, i) => {
    if (!ph.loop) return;
    let t = -1;
    for (let j = i - 1; j >= 0; j--) { if (phases[j].agent === ph.loop.to) { t = j; break; } }
    if (t < 0) t = Math.max(0, i - 1);
    rework.push({ id: 'w' + i, from: nodes[i].id, to: nodes[t].id, maxRetries: ph.loop.maxRetries || 3, escalate: !!ph.loop.escalate });
  });
  return { nodes, edges, rework };
}

const ensureGraph = (p) => {
  if (!p) return { nodes: [], edges: [], rework: [] };
  if (p.graph) return { nodes: p.graph.nodes.map((n) => ({ ...n })), edges: p.graph.edges.map((e) => ({ ...e })), rework: p.graph.rework.map((r) => ({ ...r })) };
  return phasesToGraph(p);
};

// ---- port geometrie -------------------------------------------------------
const portPt = (n, which) => {
  if (!n) return { x: 0, y: 0 };
  if (which === 'in') return { x: n.x, y: n.y + NODE_H / 2 };
  if (which === 'out') return { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
  return { x: n.x + NODE_W / 2, y: n.y }; // top
};
const flowPath = (a, b) => { const dx = Math.max(46, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
const reworkPath = (a, b) => { const peak = Math.min(a.y, b.y) - 56; const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${a.x},${peak} ${mx},${peak} ${mx},${peak} S${b.x},${peak} ${b.x},${b.y}`; };

// ---- jeden uzel (zjednodušená karta agenta) -------------------------------
const GNode = ({ n, accent, pending, hover, dragging, onPortDown, onNodeDown, onDelete, onCycleModel, onCycleThink, onPortEnter, onPortLeave, onNodeEnter, onNodeLeave }) => {
  const a = agentByName(n.agent);
  const flowTarget = pending && pending.kind === 'flow' && pending.from !== n.id;
  const reworkTarget = pending && pending.kind === 'rework' && pending.from !== n.id;
  const inLit = flowTarget && hover && hover.type === 'in' && hover.node === n.id;
  const nodeLit = reworkTarget && hover && hover.type === 'node' && hover.node === n.id;

  const port = (which, extra) => {
    const dim = 14;
    const isTop = which === 'top';
    const c = isTop ? Z.bad : accent;
    const lit = (which === 'in' && inLit);
    return (
      <div
        onMouseDown={which === 'in' ? undefined : (e) => onPortDown(which, n.id, e)}
        onMouseEnter={which === 'in' ? () => onPortEnter('in', n.id) : undefined}
        onMouseLeave={which === 'in' ? () => onPortLeave('in', n.id) : undefined}
        style={{
          position: 'absolute', width: dim, height: dim, borderRadius: 3, boxSizing: 'border-box',
          background: lit ? c : (which === 'out' || isTop ? `${c}2a` : Z.bg0),
          border: `1.5px solid ${lit ? c : c + 'aa'}`,
          cursor: which === 'in' ? 'default' : 'crosshair',
          display: 'grid', placeItems: 'center', zIndex: 4,
          boxShadow: lit ? `0 0 0 4px ${c}33` : 'none', transition: 'background .1s, box-shadow .1s',
          ...extra,
        }}
        title={which === 'in' ? 'vstup — sem připoj výstup jiného agenta' : which === 'out' ? 'výstup — táhni do vstupu dalšího agenta' : 'při chybě vrátit práci — táhni na předchozího agenta'}>
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: lit ? Z.bg0 : c }} />
      </div>
    );
  };

  return (
    <div
      onMouseDown={(e) => onNodeDown(n.id, e)}
      onMouseEnter={() => onNodeEnter(n.id)}
      onMouseLeave={() => onNodeLeave(n.id)}
      style={{
        position: 'absolute', left: n.x, top: n.y, width: NODE_W, height: NODE_H,
        background: nodeLit ? Z.panelHi : Z.panel,
        border: `1px solid ${nodeLit ? Z.bad : (reworkTarget ? Z.bad + '55' : accent + '55')}`,
        borderRadius: 4, padding: '9px 11px', boxSizing: 'border-box', cursor: dragging ? 'grabbing' : 'grab',
        boxShadow: dragging ? `0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px ${accent}66` : (nodeLit ? `0 0 0 1px ${Z.bad}66, 0 0 18px ${Z.bad}33` : '0 2px 10px rgba(0,0,0,0.3)'),
        userSelect: 'none', transition: 'box-shadow .12s, border-color .12s',
      }}>
      {/* delete */}
      <button onClick={(e) => { e.stopPropagation(); onDelete(n.id); }} onMouseDown={(e) => { e.stopPropagation(); }}
        style={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', background: Z.bg0, border: `1px solid ${Z.line}`, color: Z.inkFaint, zIndex: 5, padding: 0 }} title="Odebrat uzel">
        <Icon name="x" size={10} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar accent={accent} dim={`${accent}1f`} glyph={a.glyph} radius={2} size={24} src={a.avatar} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 11.5, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.agent}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
        <span onClick={(e) => { e.stopPropagation(); onCycleModel(n.id); }} onMouseDown={(e) => e.stopPropagation()} style={{ cursor: 'pointer', fontFamily: Z.mono, fontSize: 8.5, fontWeight: 600, padding: '2px 6px', borderRadius: 2, color: PG_MODEL_C[n.model] || Z.inkDim, background: `${PG_MODEL_C[n.model] || Z.inkDim}1f`, border: `1px solid ${PG_MODEL_C[n.model] || Z.inkDim}55` }} title="model">{n.model}</span>
        <span onClick={(e) => { e.stopPropagation(); onCycleThink(n.id); }} onMouseDown={(e) => e.stopPropagation()} style={{ cursor: 'pointer', fontFamily: Z.mono, fontSize: 8.5, fontWeight: 600, padding: '2px 6px', borderRadius: 2, color: PG_THINK_C[n.thinking] || Z.inkDim, background: `${PG_THINK_C[n.thinking] || Z.inkDim}1f`, border: `1px solid ${PG_THINK_C[n.thinking] || Z.inkDim}55` }} title="thinking">◇ {n.thinking}</span>
      </div>

      {port('in', { left: -7, top: NODE_H / 2 - 7 })}
      {port('out', { left: NODE_W - 7, top: NODE_H / 2 - 7 })}
      {port('top', { left: NODE_W / 2 - 7, top: -7 })}
    </div>
  );
};

// ---- paleta agentů --------------------------------------------------------
const PaletteItem = ({ a, accent, onAdd }) => {
  const [h, setH] = useStateG(false);
  return (
    <div
      draggable
      onClick={() => onAdd(a.name)}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/agent', a.name); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 3, cursor: 'grab', background: h ? 'rgba(255,255,255,0.04)' : 'transparent', border: `1px solid ${h ? accent + '44' : 'transparent'}`, transition: 'all .12s' }}
      title="Přetáhni na plátno nebo klikni pro přidání">
      <Avatar accent={accent} dim={`${accent}1c`} glyph={a.glyph} radius={2} size={26} src={a.avatar} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Mono style={{ fontSize: 11.5, fontWeight: 600, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{a.name}</Mono>
        <Mono style={{ fontSize: 9, color: Z.inkFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{a.category}</Mono>
      </div>
      <Icon name="plus" size={12} style={{ color: h ? accent : Z.inkFaint, flex: '0 0 auto' }} />
    </div>
  );
};

// ---- editor ---------------------------------------------------------------
const PipelineGraphEditor = ({ pipeline, mode, accent, onClose, onSave }) => {
  const isNew = mode === 'new';
  const [name, setName] = useStateG(pipeline ? pipeline.name || '' : '');
  const [desc, setDesc] = useStateG(pipeline ? pipeline.desc || '' : '');
  const [avatar, setAvatar] = useStateG(pipeline ? pipeline.avatar || null : null);
  const [budget, setBudget] = useStateG(pipeline ? pipeline.budget || 25 : 25);
  const [graph, setGraph] = useStateG(() => ensureGraph(pipeline));
  const [pending, setPending] = useStateG(null); // { kind, from, cursor:{x,y} }
  const [nodeDrag, setNodeDrag] = useStateG(null); // { id }
  const [hover, setHoverState] = useStateG(null);  // { type:'in'|'node', node }

  const canvasRef = useRefG(null);
  const hoverRef = useRefG(null);
  const dragRef = useRefG(null);   // { id, offx, offy }
  const setHover = (v) => { hoverRef.current = v; setHoverState(v); };

  const nodeById = (id) => graph.nodes.find((n) => n.id === id);
  const toCanvas = (cx, cy) => { const r = canvasRef.current.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };

  // mutace grafu
  const addNode = (agentName, x, y) => {
    const a = agentByName(agentName);
    const nx = clamp(x == null ? 60 + graph.nodes.length * 26 : x, 8, CANVAS_W - NODE_W - 8);
    const ny = clamp(y == null ? 150 + graph.nodes.length * 18 : y, 8, CANVAS_H - NODE_H - 8);
    setGraph((g) => ({ ...g, nodes: [...g.nodes, { id: guid('n'), agent: agentName, x: nx, y: ny, model: a.model || 'sonnet', thinking: a.thinking || 'medium' }] }));
  };
  const delNode = (id) => setGraph((g) => ({ nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id), rework: g.rework.filter((r) => r.from !== id && r.to !== id) }));
  const cycleModel = (id) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => n.id === id ? { ...n, model: { opus: 'sonnet', sonnet: 'haiku', haiku: 'opus' }[n.model] || 'sonnet' } : n) }));
  const cycleThink = (id) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => n.id === id ? { ...n, thinking: { high: 'medium', medium: 'low', low: 'high' }[n.thinking] || 'medium' } : n) }));
  const setEdgeFile = (id, file) => setGraph((g) => ({ ...g, edges: g.edges.map((e) => e.id === id ? { ...e, file } : e) }));
  const delEdge = (id) => setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }));
  const setRework = (id, patch) => setGraph((g) => ({ ...g, rework: g.rework.map((r) => r.id === id ? { ...r, ...patch } : r) }));
  const delRework = (id) => setGraph((g) => ({ ...g, rework: g.rework.filter((r) => r.id !== id) }));

  const commit = (pend, tgt) => {
    if (!pend || !tgt) return;
    if (pend.kind === 'flow' && tgt.type === 'in' && tgt.node !== pend.from) {
      setGraph((g) => {
        const edges = g.edges.filter((e) => e.from !== pend.from && e.to !== tgt.node);
        const fromAgent = (g.nodes.find((n) => n.id === pend.from) || {}).agent;
        return { ...g, edges: [...edges, { id: guid('e'), from: pend.from, to: tgt.node, file: `${docSlug(fromAgent)}.md` }] };
      });
    } else if (pend.kind === 'rework' && tgt.type === 'node' && tgt.node !== pend.from) {
      setGraph((g) => ({ ...g, rework: [...g.rework.filter((r) => r.from !== pend.from), { id: guid('w'), from: pend.from, to: tgt.node, maxRetries: 3, escalate: true }] }));
    }
  };

  // port / node mouse handlers
  const onPortDown = (which, nodeId, e) => {
    e.stopPropagation(); e.preventDefault();
    const n = nodeById(nodeId);
    setPending({ kind: which === 'top' ? 'rework' : 'flow', from: nodeId, cursor: portPt(n, which) });
    setHover(null);
  };
  const onNodeDown = (nodeId, e) => {
    if (e.button !== 0) return;
    const n = nodeById(nodeId); const c = toCanvas(e.clientX, e.clientY);
    dragRef.current = { id: nodeId, offx: c.x - n.x, offy: c.y - n.y };
    setNodeDrag({ id: nodeId });
  };
  const onPortEnter = (type, node) => { if (pending && pending.kind === 'flow' && pending.from !== node) setHover({ type: 'in', node }); };
  const onPortLeave = (type, node) => { if (hoverRef.current && hoverRef.current.type === 'in' && hoverRef.current.node === node) setHover(null); };
  const onNodeEnter = (node) => { if (pending && pending.kind === 'rework' && pending.from !== node) setHover({ type: 'node', node }); };
  const onNodeLeave = (node) => { if (hoverRef.current && hoverRef.current.type === 'node' && hoverRef.current.node === node) setHover(null); };

  // global drag tracking
  useEffectG(() => {
    if (!pending && !nodeDrag) return;
    const mm = (e) => {
      const c = toCanvas(e.clientX, e.clientY);
      if (pending) setPending((p) => p ? { ...p, cursor: c } : p);
      if (nodeDrag && dragRef.current) {
        const d = dragRef.current;
        setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => n.id === d.id ? { ...n, x: clamp(c.x - d.offx, 8, CANVAS_W - NODE_W - 8), y: clamp(c.y - d.offy, 8, CANVAS_H - NODE_H - 8) } : n) }));
      }
    };
    const mu = () => {
      if (pending) { commit(pending, hoverRef.current); setPending(null); setHover(null); }
      if (nodeDrag) { dragRef.current = null; setNodeDrag(null); }
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }, [pending, nodeDrag, graph.nodes]);

  const phases = graphToPhases(graph);
  const valid = name.trim().length > 0 && graph.nodes.length > 0;
  const submit = () => { if (!valid) return; onSave({ ...(pipeline || {}), name: name.trim(), desc: desc.trim(), budget, avatar, graph, phases }, isNew); };

  const pendFrom = pending ? portPt(nodeById(pending.from), pending.kind === 'rework' ? 'top' : 'out') : null;

  return (
    <div onMouseDown={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.74)', backdropFilter: 'blur(3px)', padding: 20 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(1320px, 97vw)', height: 'min(840px, 94vh)', display: 'flex', flexDirection: 'column', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 5, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>

        {/* header + toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${Z.line}`, flex: '0 0 auto' }}>
          <AvatarSwap accent={accent} glyph="flow" image={avatar} onRemove={() => setAvatar(null)} onUpload={setAvatar} size={36} />
          <div style={{ flex: '0 0 auto' }}>
            <input onBlur={(e) => e.target.style.borderColor = Z.line} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.style.borderColor = `${accent}88`} placeholder="název pipeline…"
              spellCheck={false}
              style={{ width: 240, padding: '5px 9px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, color: Z.ink, fontFamily: Z.mono, fontSize: 14, fontWeight: 700, outline: 'none' }} value={name} />
            <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 4 }}>{isNew ? 'nová' : 'úprava'} · ~/zibby/pipelines/{docSlug(name) || 'nova-pipeline'}.pipeline.md</Mono>
          </div>
          <input onBlur={(e) => e.target.style.borderColor = Z.line} onChange={(e) => setDesc(e.target.value)} onFocus={(e) => e.target.style.borderColor = `${accent}88`} placeholder="popis — co pipeline dělá (jedna věta)"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, padding: '7px 11px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, color: Z.ink, fontFamily: Z.sans, fontSize: 13, outline: 'none' }} value={desc} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: '0 0 auto' }}>
            <Mono style={{ fontSize: 9, color: Z.inkFaint, marginRight: 2 }}>STROP</Mono>
            {[10, 25, 50, 100].map((b) => (
              <button key={b} onClick={() => setBudget(b)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '5px 9px', cursor: 'pointer', borderRadius: 2, color: budget === b ? Z.bg0 : Z.inkDim, background: budget === b ? accent : 'transparent', border: `1px solid ${budget === b ? accent : Z.line}` }}>${b}</button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4, flex: '0 0 auto' }}><Icon name="x" size={18} /></button>
        </div>

        {/* body: palette + canvas */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* palette */}
          <div style={{ width: 232, flex: '0 0 auto', borderRight: `1px solid ${Z.line}`, background: Z.bg0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 14px 8px', flex: '0 0 auto' }}>
              <Mono style={{ fontSize: 8.5, letterSpacing: '0.18em', color: Z.inkFaint, textTransform: 'uppercase' }}><span style={{ color: accent, opacity: 0.7 }}>//</span> agenti · pool</Mono>
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 6, lineHeight: 1.5 }}>Přetáhni na plátno → uzel grafu</Mono>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
              {AGENTS.map((a) => <PaletteItem a={a} accent={accent} key={a.id} onAdd={(nm) => addNode(nm)} />)}
            </div>
          </div>

          {/* canvas */}
          <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => { e.preventDefault(); const nm = e.dataTransfer.getData('text/agent'); if (!nm) return; const c = toCanvas(e.clientX, e.clientY); addNode(nm, c.x - NODE_W / 2, c.y - NODE_H / 2); }}
            style={{ flex: 1, position: 'relative', overflow: 'auto', background: Z.bg1 }}>
            <div ref={canvasRef} style={{
              position: 'relative', width: CANVAS_W, height: CANVAS_H,
              backgroundImage: `radial-gradient(${Z.line} 1px, transparent 1px)`, backgroundSize: '22px 22px', backgroundPosition: '11px 11px',
              cursor: pending ? 'crosshair' : 'default', userSelect: (pending || nodeDrag) ? 'none' : 'auto',
            }}>
              {/* SVG edges */}
              <svg height={CANVAS_H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }} width={CANVAS_W}>
                {graph.edges.map((e) => {
                  const a = portPt(nodeById(e.from), 'out'), b = portPt(nodeById(e.to), 'in');
                  if (!nodeById(e.from) || !nodeById(e.to)) return null;
                  return (
                    <g key={e.id}>
                      <path d={flowPath(a, b)} fill="none" stroke={accent} strokeWidth="1.6" />
                      <path d={`M${b.x},${b.y} L${b.x - 8},${b.y - 4.5} L${b.x - 8},${b.y + 4.5} Z`} fill={accent} />
                    </g>
                  );
                })}
                {graph.rework.map((r) => {
                  const a = portPt(nodeById(r.from), 'top'), b = portPt(nodeById(r.to), 'top');
                  if (!nodeById(r.from) || !nodeById(r.to)) return null;
                  return (
                    <g key={r.id}>
                      <path d={reworkPath(a, b)} fill="none" stroke={Z.bad} strokeDasharray="4 3" strokeWidth="1.4" />
                      <path d={`M${b.x},${b.y} L${b.x - 4.5},${b.y - 8} L${b.x + 4.5},${b.y - 8} Z`} fill={Z.bad} />
                    </g>
                  );
                })}
                {pending && pendFrom && (
                  <path d={pending.kind === 'rework' ? reworkPath(pendFrom, pending.cursor) : flowPath(pendFrom, pending.cursor)} fill="none" opacity="0.8" stroke={pending.kind === 'rework' ? Z.bad : accent} strokeDasharray="5 4" strokeWidth="1.6" />
                )}
              </svg>

              {/* nodes */}
              {graph.nodes.map((n) => (
                <GNode accent={accent} dragging={nodeDrag && nodeDrag.id === n.id} hover={hover} key={n.id} n={n} onCycleModel={cycleModel}
                  onCycleThink={cycleThink} onDelete={delNode} onNodeDown={onNodeDown} onNodeEnter={onNodeEnter} onNodeLeave={onNodeLeave}
                  onPortDown={onPortDown} onPortEnter={onPortEnter} onPortLeave={onPortLeave} pending={pending} />
              ))}

              {/* flow edge controls (filename) */}
              {graph.edges.map((e) => {
                const fa = nodeById(e.from), fb = nodeById(e.to); if (!fa || !fb) return null;
                const a = portPt(fa, 'out'), b = portPt(fb, 'in');
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                return (
                  <div key={e.id} style={{ position: 'absolute', left: mx, top: my, transform: 'translate(-50%,-50%)', zIndex: 6, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 7px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                    <Icon name="file" size={10} style={{ color: Z.inkFaint, flex: '0 0 auto' }} />
                    <input onChange={(ev) => setEdgeFile(e.id, ev.target.value)} spellCheck={false} style={{ width: 96, padding: 0, background: 'transparent', border: 'none', color: accent, fontFamily: Z.mono, fontSize: 10, outline: 'none' }} title="název souboru pro předání (výstup → vstup)"
                      value={e.file} />
                    <button onClick={() => delEdge(e.id)} style={{ width: 16, height: 16, flex: '0 0 auto', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2, background: 'transparent', border: 'none', color: Z.inkFaint, padding: 0 }} title="Odpojit"><Icon name="x" size={10} /></button>
                  </div>
                );
              })}

              {/* rework edge controls (max retries + escalate) */}
              {graph.rework.map((r) => {
                const fa = nodeById(r.from), fb = nodeById(r.to); if (!fa || !fb) return null;
                const a = portPt(fa, 'top'), b = portPt(fb, 'top');
                const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 56;
                return (
                  <div key={r.id} style={{ position: 'absolute', left: mx, top: my, transform: 'translate(-50%,-50%)', zIndex: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', background: Z.bg0, border: `1px solid ${Z.bad}55`, borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
                    <Icon name="retry" size={11} style={{ color: Z.bad, flex: '0 0 auto' }} />
                    <Mono style={{ fontSize: 9.5, color: Z.bad }}>max</Mono>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button onClick={() => setRework(r.id, { maxRetries: clamp(r.maxRetries - 1, 1, 9) })} style={{ width: 15, height: 15, display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2, background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkDim, fontFamily: Z.mono, fontSize: 11, lineHeight: 1, padding: 0 }}>−</button>
                      <Mono style={{ fontSize: 11, fontWeight: 700, color: Z.ink, width: 12, textAlign: 'center' }}>{r.maxRetries}</Mono>
                      <button onClick={() => setRework(r.id, { maxRetries: clamp(r.maxRetries + 1, 1, 9) })} style={{ width: 15, height: 15, display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2, background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkDim, fontFamily: Z.mono, fontSize: 11, lineHeight: 1, padding: 0 }}>+</button>
                    </div>
                    <button onClick={() => setRework(r.id, { escalate: !r.escalate })} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: Z.mono, fontSize: 9, fontWeight: 600, padding: '2px 6px', cursor: 'pointer', borderRadius: 2, color: r.escalate ? Z.bg0 : Z.inkDim, background: r.escalate ? Z.warn : 'transparent', border: `1px solid ${r.escalate ? Z.warn : Z.line}` }}
                      title="při přepracování zvýšit thinking effort">↑ effort</button>
                    <button onClick={() => delRework(r.id)} style={{ width: 16, height: 16, flex: '0 0 auto', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: 2, background: 'transparent', border: 'none', color: Z.inkFaint, padding: 0 }} title="Zrušit vrácení"><Icon name="x" size={10} /></button>
                  </div>
                );
              })}

              {/* empty state */}
              {graph.nodes.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  <div style={{ textAlign: 'center' }}>
                    <Icon name="flow" size={30} style={{ color: Z.inkFaint, opacity: 0.5 }} />
                    <Mono style={{ fontSize: 12, color: Z.inkFaint, display: 'block', marginTop: 12 }}>Přetáhni agenty z palety sem</Mono>
                    <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginTop: 6, opacity: 0.7 }}>táhni z <span style={{ color: accent }}>pravého portu</span> do vstupu dalšího · z <span style={{ color: Z.bad }}>horního portu</span> zpět na předchozího</Mono>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, padding: '12px 18px', borderTop: `1px solid ${Z.line}`, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mono style={{ fontSize: 10, color: Z.inkDim }}><span style={{ color: accent }}>{graph.nodes.length}</span> uzlů · <span style={{ color: accent }}>{graph.edges.length}</span> hran · <span style={{ color: Z.bad }}>{graph.rework.length}</span> vrácení</Mono>
            <Mono style={{ fontSize: 10, color: Z.inkFaint }}>výstup → izolovaná branch · PR k ranní review</Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Mono style={{ fontSize: 10, color: valid ? Z.inkFaint : Z.warn, marginRight: 4 }}>{valid ? '' : (name.trim() ? 'přidej alespoň jeden uzel' : 'doplň název')}</Mono>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            {valid
              ? <RunBtn accent={accent} label={isNew ? 'Vytvořit pipeline' : 'Uložit změny'} onClick={submit} />
              : <button disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 2, color: Z.bg0, background: accent, border: 'none', opacity: 0.4, cursor: 'not-allowed' }}><Icon name="play" size={12} stroke={2} /> {isNew ? 'Vytvořit pipeline' : 'Uložit změny'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PipelineGraphEditor, graphToPhases, phasesToGraph, ensureGraph });

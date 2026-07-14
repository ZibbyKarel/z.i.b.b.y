// ZIBBY velín — Paměť: vizualizace Obsidian vaultu.
// Interaktivní force-directed graf .md souborů (wiki-linky) · 3 vrstvy paměti ·
// náhled/editor souboru · re-anchor (obnova kontextu po kompakci). Navigace index-first.
const { useState: useStateMem, useEffect: useEffectMem, useRef: useRefMem } = React;

const nodeById = (id) => VAULT_NODES.find((n) => n.id === id);
const degreeOf = (id) => VAULT_LINKS.filter(([u, v]) => u === id || v === id).length;
const neighborsOf = (id) => {
  const set = new Set();
  VAULT_LINKS.forEach(([u, v]) => { if (u === id) set.add(v); if (v === id) set.add(u); });
  return set;
};

// ---- force-directed graf -------------------------------------------------
const VaultGraph = ({ accent, selId, onSelect, layersOn }) => {
  const nodes = VAULT_NODES, links = VAULT_LINKS;
  const wrapRef = useRefMem(null);
  const svgRef = useRefMem(null);
  const simRef = useRefMem(null);
  const dragRef = useRefMem(null);
  const alphaRef = useRefMem(1);
  const rafRef = useRefMem(null);
  const dimRef = useRefMem({ w: 860, h: 520 });
  const [dim, setDim] = useStateMem({ w: 860, h: 520 });
  const [, force] = useStateMem(0);
  const [hover, setHover] = useStateMem(null);

  const ensureSim = (w, h) => {
    if (simRef.current) return;
    const cols = { index: 0.17, long: 0.40, knowledge: 0.66, daily: 0.87 };
    const byLayer = {};
    nodes.forEach((n) => { (byLayer[n.layer] = byLayer[n.layer] || []).push(n); });
    const s = {};
    Object.keys(byLayer).forEach((layer) => {
      const arr = byLayer[layer];
      arr.forEach((n, i) => {
        const cx = (cols[layer] || 0.5) * w;
        const cy = h * 0.5 + (i - (arr.length - 1) / 2) * (h * 0.62 / Math.max(arr.length, 1));
        s[n.id] = { x: cx + (Math.random() - 0.5) * 50, y: cy + (Math.random() - 0.5) * 36, vx: 0, vy: 0, fx: 0, fy: 0 };
      });
    });
    simRef.current = s;
  };

  const step = () => {
    const s = simRef.current; if (!s) return;
    const { w, h } = dimRef.current;
    const REP = 8200, SPRING = 0.022, REST = 124, CENTER = 0.014, DAMP = 0.86;
    const ids = nodes.map((n) => n.id);
    for (let i = 0; i < ids.length; i++) {
      const a = s[ids[i]]; let fx = 0, fy = 0;
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue; const b = s[ids[j]];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01, d = Math.sqrt(d2);
        const f = REP / d2; fx += (dx / d) * f; fy += (dy / d) * f;
      }
      fx += (w / 2 - a.x) * CENTER; fy += (h / 2 - a.y) * CENTER;
      a.fx = fx; a.fy = fy;
    }
    links.forEach(([u, v]) => {
      const a = s[u], b = s[v]; if (!a || !b) return;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - REST) * SPRING, ux = dx / d, uy = dy / d;
      a.fx += ux * f; a.fy += uy * f; b.fx -= ux * f; b.fy -= uy * f;
    });
    const al = alphaRef.current;
    ids.forEach((id) => {
      const a = s[id]; if (dragRef.current === id) { a.vx = 0; a.vy = 0; return; }
      a.vx = (a.vx + a.fx * al) * DAMP; a.vy = (a.vy + a.fy * al) * DAMP;
      a.x += a.vx; a.y += a.vy;
      a.x = Math.max(30, Math.min(w - 30, a.x)); a.y = Math.max(34, Math.min(h - 34, a.y));
    });
    alphaRef.current = al * 0.986;
  };

  useEffectMem(() => {
    const measure = () => {
      if (!wrapRef.current) return;
      const w = Math.max(wrapRef.current.clientWidth, 360);
      const d = { w, h: 520 };
      dimRef.current = d; setDim(d); alphaRef.current = Math.max(alphaRef.current, 0.5);
    };
    ensureSim(dimRef.current.w, dimRef.current.h);
    measure();
    window.addEventListener('resize', measure);
    const loop = () => {
      const moving = alphaRef.current > 0.004 || dragRef.current;
      if (moving) { step(); force((t) => t + 1); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', measure); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const onMove = (e) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const a = simRef.current[dragRef.current];
    if (a) { a.x = Math.max(30, Math.min(dim.w - 30, e.clientX - rect.left)); a.y = Math.max(34, Math.min(dim.h - 34, e.clientY - rect.top)); a.vx = 0; a.vy = 0; }
    alphaRef.current = Math.max(alphaRef.current, 0.25);
  };
  const onUp = () => { dragRef.current = null; };

  const s = simRef.current || {};
  const focus = hover || selId;
  const nbr = focus ? neighborsOf(focus) : null;
  const layerVisible = (l) => layersOn[l];

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg ref={svgRef} width={dim.w} height={dim.h} style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'default', touchAction: 'none' }}
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { onUp(); setHover(null); }}>
        {/* edges */}
        {links.map(([u, v], i) => {
          const a = s[u], b = s[v]; if (!a || !b) return null;
          const vis = layerVisible(nodeById(u).layer) && layerVisible(nodeById(v).layer);
          const hot = focus && (u === focus || v === focus);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={hot ? accent : Z.inkFaint} strokeWidth={hot ? 1.6 : 1}
            opacity={!vis ? 0.05 : (focus ? (hot ? 0.85 : 0.12) : 0.28)} style={{ transition: 'opacity .2s' }} />;
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const p = s[n.id]; if (!p) return null;
          const lc = MEM_LAYER[n.layer].c;
          const deg = degreeOf(n.id);
          const r = n.anchor ? 13 : 7 + Math.min(deg, 4);
          const sel = n.id === selId;
          const vis = layerVisible(n.layer);
          const dim2 = focus && !(n.id === focus || (nbr && nbr.has(n.id)));
          const op = !vis ? 0.12 : (dim2 ? 0.32 : 1);
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: vis ? 'grab' : 'default', transition: 'opacity .2s' }} opacity={op}
              onPointerDown={(e) => { if (!vis) return; e.stopPropagation(); dragRef.current = n.id; alphaRef.current = Math.max(alphaRef.current, 0.35); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} onSelect(n.id); }}
              onPointerEnter={() => vis && setHover(n.id)} onPointerLeave={() => setHover((h) => h === n.id ? null : h)}>
              {sel && <circle r={r + 7} fill="none" stroke={lc} strokeWidth="1" opacity="0.5" />}
              {n.anchor && <circle r={r + 4} fill="none" stroke={lc} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />}
              <circle r={r} fill={Z.bg1} stroke={lc} strokeWidth={sel ? 2.4 : 1.6} style={{ filter: sel || n.anchor ? `drop-shadow(0 0 7px ${lc})` : 'none' }} />
              <circle r={r - 3.5} fill={lc} opacity={n.anchor ? 0.9 : 0.55} />
              <text y={r + 14} textAnchor="middle" fontFamily={Z.mono} fontSize="10.5" fill={sel ? Z.ink : Z.inkDim} style={{ pointerEvents: 'none', fontWeight: sel || n.anchor ? 700 : 400 }}>
                {n.label.replace(/^.*\//, '').replace(/\.md$/, '')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---- file preview / editor panel ----------------------------------------
const VaultFilePanel = ({ node, accent }) => {
  const [reanchored, setReanchored] = useStateMem(false);
  useEffectMem(() => setReanchored(false), [node && node.id]);
  if (!node) return null;
  const layer = MEM_LAYER[node.layer];
  const nbrs = [...neighborsOf(node.id)].map(nodeById).filter(Boolean);
  const path = '~/zibby/vault/' + node.label;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
      <HudPanel accent={layer.c} pad={16}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <div style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${layer.c}18`, color: layer.c, border: `1px solid ${layer.c}44` }}>
            <Icon name={node.layer === 'index' ? 'compass' : node.layer === 'long' ? 'brain' : node.layer === 'daily' ? 'clock' : 'doc'} size={18} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
              <span style={{ fontFamily: Z.mono, fontSize: 9, color: layer.c, background: `${layer.c}18`, border: `1px solid ${layer.c}44`, borderRadius: 2, padding: '1px 6px' }}>{layer.label}</span>
              {node.anchor && <span style={{ fontFamily: Z.mono, fontSize: 9, color: Z.inkFaint }}>· vstupní bod</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 10px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
          <Icon name="file" size={12} style={{ color: Z.inkFaint }} />
          <Mono style={{ fontSize: 10, color: Z.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</Mono>
        </div>
      </HudPanel>

      <HudPanel accent={layer.c} title="náhled souboru" pad={14} right={<GhostBtn icon="edit" accent={accent}>Editovat</GhostBtn>}>
        <div style={{ maxHeight: 250, overflow: 'auto', padding: '2px 2px 0' }}>
          <MarkdownView source={node.body} accent={layer.c} />
        </div>
      </HudPanel>

      {/* links out */}
      <HudPanel accent={layer.c} title={`propojeno · ${nbrs.length}`} pad={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nbrs.map((nb) => {
            const c = MEM_LAYER[nb.layer].c;
            return (
              <div key={nb.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flex: '0 0 auto' }} />
                <Mono style={{ fontSize: 10.5, color: Z.inkDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nb.label.replace(/^.*\//, '')}</Mono>
                <Icon name="link" size={12} style={{ color: Z.inkFaint }} />
              </div>
            );
          })}
        </div>
      </HudPanel>

      {/* re-anchor (jen vstupní body) */}
      {node.anchor && (
        <HudPanel accent={Z.warn} pad={14} style={{ borderColor: `${Z.warn}40` }}>
          <Mono style={{ fontSize: 9.5, color: Z.warn, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block' }}>re-anchor</Mono>
          <div style={{ fontSize: 12, color: Z.inkDim, lineHeight: 1.5, marginTop: 7 }}>
            Po kompakci kontextu vrátí tenhle soubor jako pevný kotevní bod — ZIBBY si znovu načte trvalá fakta.
          </div>
          {reanchored ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, padding: '9px 11px', background: 'rgba(57,217,138,0.1)', border: `1px solid ${Z.ok}44`, borderRadius: 2 }}>
              <Icon name="ok" size={14} style={{ color: Z.ok }} />
              <Mono style={{ fontSize: 11, color: Z.ok }}>Kontext obnoven z {node.label}</Mono>
            </div>
          ) : (
            <button onClick={() => setReanchored(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 11, fontFamily: Z.mono, fontSize: 11.5, fontWeight: 600, padding: '8px 13px', cursor: 'pointer', borderRadius: 2, color: Z.bg0, background: Z.warn, border: 'none', boxShadow: `0 0 12px ${Z.warn}44` }}>
              <Icon name="checkpoint" size={13} /> Re-anchor kontext
            </button>
          )}
        </HudPanel>
      )}
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const MemoryBody = ({ accent }) => {
  const [selId, setSelId] = useStateMem('index');
  const [layersOn, setLayersOn] = useStateMem({ index: true, long: true, knowledge: true, daily: true });
  const sel = nodeById(selId);
  const counts = VAULT_NODES.reduce((m, n) => { m[n.layer] = (m[n.layer] || 0) + 1; return m; }, {});
  const toggleLayer = (l) => setLayersOn((p) => ({ ...p, [l]: !p[l] }));

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 600 }}>Paměť</div>
              <Mono style={{ fontSize: 10, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 4, padding: '2px 8px' }}>Obsidian vault</Mono>
            </div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 8 }}>
              {VAULT_NODES.length} souborů · {VAULT_LINKS.length} wiki-linků · navigace <span style={{ color: accent }}>index-first</span> (ne vektorový RAG)
            </Mono>
          </div>
          <GhostBtn icon="search" accent={accent}>Hledat ve vaultu</GhostBtn>
        </div>

        {/* tři vrstvy paměti — legenda + filtr */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Z.line}`, flexWrap: 'wrap' }}>
          {[
            ['long', 'dlouhodobá fakta'], ['daily', 'epizodické logy'], ['knowledge', 'tematické'], ['index', 'vstupní MOC'],
          ].map(([l, note]) => {
            const lm = MEM_LAYER[l], on = layersOn[l];
            return (
              <button key={l} onClick={() => toggleLayer(l)} title="přepnout vrstvu" style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', cursor: 'pointer', borderRadius: 3,
                background: on ? Z.bg0 : 'transparent', border: `1px solid ${on ? lm.c + '44' : Z.line}`, opacity: on ? 1 : 0.45, transition: 'all .14s',
              }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: lm.c, flex: '0 0 auto', boxShadow: on ? `0 0 7px ${lm.c}` : 'none' }} />
                <div style={{ textAlign: 'left' }}>
                  <Mono style={{ fontSize: 11, color: Z.ink, fontWeight: 600, display: 'block' }}>{lm.label} <span style={{ color: Z.inkFaint, fontWeight: 400 }}>{counts[l]}</span></Mono>
                  <Mono style={{ fontSize: 8.5, color: Z.inkFaint, display: 'block', marginTop: 1 }}>{note}</Mono>
                </div>
              </button>
            );
          })}
        </div>
      </HudPanel>

      {/* graph + file panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' }}>
        <HudPanel accent={accent} title="graf vaultu · táhni uzly · klikni pro náhled" pad={12} style={{ overflow: 'hidden' }}>
          <VaultGraph accent={accent} selId={selId} onSelect={setSelId} layersOn={layersOn} />
        </HudPanel>
        <VaultFilePanel node={sel} accent={accent} />
      </div>
    </div>
  );
};

Object.assign(window, { MemoryBody, VaultGraph, VaultFilePanel });

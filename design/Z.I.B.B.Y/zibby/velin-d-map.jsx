// ZIBBY Velín-D — mapa (organismus) s WebGL orby. Střed = ZIBBY orb (drátěná
// dýchající koule), kolem 8 subsystémů, každý jako menší orb tónovaný svou
// identitou. Barva orbu = identita · haló + pohyb + orbity = STAV.
const { useState: useStateMD, useEffect: useEffectMD, useRef: useRefMD, useMemo: useMemoMD } = React;

(function injectVcCssD() {
  if (document.getElementById('vc-css-d')) return;
  const el = document.createElement('style');
  el.id = 'vc-css-d';
  el.textContent = `
@keyframes vcSpin   { to { transform: rotate(360deg); } }
@keyframes vcShadow { 0%,100% { transform: translateX(-50%) scaleX(1); opacity: .5; } 50% { transform: translateX(-50%) scaleX(.82); opacity: .32; } }
@keyframes vcRing   { 0% { transform: scale(.72); opacity: .5; } 100% { transform: scale(2.1); opacity: 0; } }
@keyframes vcHalo   { 0%,100% { opacity: .45; } 50% { opacity: .9; } }
@keyframes vcFloat  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes vcDash   { to { stroke-dashoffset: -80; } }
@keyframes vcPop    { from { transform: scale(.986); } to { transform: scale(1); } }
@keyframes vcFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes vcSlideUp{ from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes vcFlareFly   { 0% { offset-distance: 0%; opacity: 0; } 6% { opacity: 1; } 88% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes vcFlareBurstRing  { 0% { transform: translate(-50%,-50%) scale(.3); opacity: .9; } 100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; } }
@keyframes vcFlareBurstCore  { 0%,55% { transform: translate(-50%,-50%) scale(0); opacity: 0; } 68% { transform: translate(-50%,-50%) scale(1.6); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(.4); opacity: 0; } }
@keyframes vcFlareLaunch { 0% { transform: translate(-50%,-50%) scale(.4); opacity: .95; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }
.vc-node { transition: transform .5s cubic-bezier(.2,.7,.2,1), opacity .4s, filter .4s; }
.vc-node:hover .vc-orb { transform: scale(1.06); }
.vc-orb { transition: transform .3s cubic-bezier(.2,.7,.2,1); }
.vc-map-layer { transition: transform .6s cubic-bezier(.2,.7,.2,1), opacity .5s, filter .5s; }
@media (prefers-reduced-motion: reduce) {
  .vc-node, .vc-orb, [class^="vc-"] { animation: none !important; }
}
`;
  document.head.appendChild(el);
})();

// deterministický pseudo-random ze seedu (stabilní orbity mezi rendery)
const vcRand = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

// ── useMeasure — geometrie mapy ───────────────────────────────────────────
const useMeasure = () => {
  const ref = useRefMD(null);
  const [size, setSize] = useStateMD({ w: 1200, h: 720 });
  useEffectMD(() => {
    if (!ref.current) return;
    // změř hned synchronně — někteří hostitelé (headless capture) nedoručí
    // první ResizeObserver callback, takže bychom jinak zůstali na výchozích 1200×720
    const r0 = ref.current.getBoundingClientRect();
    if (r0.width && r0.height) setSize({ w: r0.width, h: r0.height });
    const ro = new ResizeObserver((e) => {
      const r = e[0].contentRect; setSize({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
};

// ── 3D orbitální pole — každé světlo = jedna zpracovávaná úloha ────────────
const VcOrbitField = ({ seed, color, count, baseR }) => {
  const orbiters = useMemoMD(() => {
    const r = vcRand(seed);
    return Array.from({ length: count }).map((_, i) => ({
      R: baseR + i * 10 + r() * 5,
      inc: 0.5 + r() * 0.7,
      rot: r() * Math.PI * 2,
      speed: (0.5 + r() * 0.5) * (r() > 0.5 ? 1 : -1),
      phase: r() * Math.PI * 2,
      size: 5 + r() * 2.5,
    }));
  }, [seed, count, baseR]);

  const dots = useRefMD([]);
  useEffectMD(() => {
    if (!orbiters.length) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf; const t0 = performance.now();
    const frame = (now) => {
      const t = reduce ? 0 : (now - t0) / 1000;
      for (let i = 0; i < orbiters.length; i++) {
        const o = orbiters[i]; const el = dots.current[i];
        if (!el) continue;
        const th = o.phase + t * o.speed * 1.5;
        const lx = o.R * Math.cos(th);
        const ly = o.R * Math.sin(th);
        const x = lx;
        const y = ly * Math.cos(o.inc);
        const z = ly * Math.sin(o.inc);
        const cr = Math.cos(o.rot), sr = Math.sin(o.rot);
        const X = x * cr - y * sr;
        const Y = x * sr + y * cr;
        const depth = (z / o.R + 1) / 2;
        const sc = 0.5 + depth * 0.95;
        el.style.transform = `translate(-50%,-50%) translate(${X.toFixed(2)}px, ${Y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
        el.style.opacity = (0.3 + depth * 0.7).toFixed(3);
        el.style.filter = `blur(${((1 - depth) * 1.4).toFixed(2)}px)`;
        el.style.zIndex = z > 0 ? 4 : 1;
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    frame(t0);
    return () => raf && cancelAnimationFrame(raf);
  }, [orbiters]);

  return (
    <React.Fragment>
      {orbiters.map((o, i) => (
        <span key={i} ref={(el) => (dots.current[i] = el)} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: o.size, height: o.size, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 32%, #ffffff, ' + color + ' 78%)',
          boxShadow: `0 0 8px 1.5px ${color}, 0 0 3px #fff`,
          pointerEvents: 'none', willChange: 'transform, opacity',
        }} />
      ))}
    </React.Fragment>
  );
};

// ── Předání úlohy mezi subsystémy — kulička se odpojí z orbity, zazáří
// výraznou barvou a přeletí obloukem na cílový orb ────────────────────────
const VC_HANDOFF_COLOR = '#ffe066';

const vcArcPath = (x1, y1, x2, y2, bend = 0.16) => {
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend;
  const my = (y1 + y2) / 2 - (x2 - x1) * bend;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
};

const VcHandoffFlare = ({ from, to, color = VC_HANDOFF_COLOR, dur = 1.3 }) => {
  const d = useMemoMD(() => vcArcPath(from.x, from.y, to.x, to.y), [from.x, from.y, to.x, to.y]);
  return (
    <React.Fragment>
      {/* odpal ze zdrojového orbu */}
      <span style={{
        position: 'absolute', left: from.x, top: from.y, width: 20, height: 20, borderRadius: '50%',
        border: `1.5px solid ${color}`, pointerEvents: 'none', zIndex: 7,
        animation: `vcFlareLaunch .5s ease-out forwards`,
      }} />
      {/* kometa — jádro + dvě dozvukové echo stopy po stejné dráze */}
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: 0, width: 13 - i * 3, height: 13 - i * 3, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 32%, #fff, ${color} 70%)`,
          boxShadow: `0 0 ${16 - i * 4}px ${4 - i}px ${color}`,
          pointerEvents: 'none', zIndex: 8 - i,
          offsetPath: `path('${d}')`, offsetRotate: '0deg',
          animation: `vcFlareFly ${dur}s cubic-bezier(.3,0,.7,1) ${(i * 0.07).toFixed(2)}s forwards`,
          opacity: 0,
        }} />
      ))}
      {/* dopadový záblesk na cílovém orbu */}
      <span style={{
        position: 'absolute', left: to.x, top: to.y, width: 30, height: 30, borderRadius: '50%',
        background: `radial-gradient(circle, #fff, ${color} 60%, transparent 76%)`, pointerEvents: 'none', zIndex: 8,
        animation: `vcFlareBurstCore ${dur}s ease-out forwards`,
      }} />
      <span style={{
        position: 'absolute', left: to.x, top: to.y, width: 46, height: 46, borderRadius: '50%',
        border: `1.5px solid ${color}`, pointerEvents: 'none', zIndex: 8,
        animation: `vcFlareBurstRing ${dur}s ease-out forwards`,
      }} />
    </React.Fragment>
  );
};

// ── Střední orb ZIBBY — WebGL drátěná koule, „přemýšlí" při odezvě ─────────
const VcCoreD = ({ intensity = 0.4, onOpen, size = 264 }) => {
  const [responding, setResponding] = useStateMD(false);
  useEffectMD(() => {
    let alive = true;
    const beat = () => {
      if (!alive) return;
      setResponding(true);
      setTimeout(() => alive && setResponding(false), 2600);
    };
    const iv = setInterval(beat, 8500);
    const t0 = setTimeout(beat, 2500);
    return () => { alive = false; clearInterval(iv); clearTimeout(t0); };
  }, []);
  const lvl = Math.min(1, intensity + (responding ? 0.5 : 0));
  const A = ZT.accent;
  const S = size;
  return (
    <div onClick={() => onOpen && onOpen()} title="ZIBBY · celkový přehled"
      style={{ position: 'relative', width: S, height: S, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
      {/* expandující tep — kadence roste s aktivitou */}
      {[0, 1].map((i) => (
        <span key={i} style={{
          position: 'absolute', width: S * 0.72, height: S * 0.72, borderRadius: '50%',
          border: `1px solid ${A}`, pointerEvents: 'none',
          animation: `vcRing ${(3.6 - lvl * 1.4).toFixed(1)}s ease-out ${(i * (1.8 - lvl * 0.7)).toFixed(1)}s infinite`,
        }} />
      ))}
      {/* měkká záře */}
      <span style={{ position: 'absolute', width: S * 1.5, height: S * 1.5, borderRadius: '50%',
        background: `radial-gradient(circle, ${A}${responding ? '3a' : '20'} 0%, transparent 66%)`,
        transition: 'background .8s', pointerEvents: 'none' }} />
      {/* 3D orbity orchestrace */}
      <VcOrbitField seed="zibby-core" color={A} count={4} baseR={S * 0.42} />
      {/* WebGL orb */}
      <ZOrb3D diameter={S * 0.66} hex={A} state={responding ? 'thinking' : 'idle'} detail={4} antialias={true} />
      {/* brand name — vycentrováno, tečky (interpunkt) zarovnané na střed řádku */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 3,
      }}>
        <span style={{
          fontFamily: ZT.mono, fontSize: Math.max(11, S * 0.083), fontWeight: 400,
          letterSpacing: '0.03em', color: '#eef3fb', textAlign: 'center',
          textShadow: '0 1px 8px rgba(0,0,0,.45)',
        }}>Z<span style={{ verticalAlign: 'middle' }}>·</span>I<span style={{ verticalAlign: 'middle' }}>·</span>B<span style={{ verticalAlign: 'middle' }}>·</span>B<span style={{ verticalAlign: 'middle' }}>·</span>Y</span>
      </div>
    </div>
  );
};

// ── Uzel subsystému — WebGL orb tónovaný identitou ─────────────────────────
const VcNodeD = ({ sys, x, y, onOpen, hidden, size = 76 }) => {
  const st = VC_STATE[sys.state] || VC_STATE.idle;
  const D = size;              // cílový průměr orbu
  const floatCfg = useMemoMD(() => { const r = vcRand(sys.id); return { dur: (5 + r() * 3).toFixed(1), delay: (r() * 4).toFixed(1) }; }, [sys.id]);
  // stav → pohyb orbu (idle/working/report/await/incident)
  return (
    <div className="vc-node" onClick={() => onOpen && onOpen(sys.id)}
      style={{
        position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
        opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : 'auto', zIndex: 2,
      }}>
      <div className="vc-anim" style={{ position: 'relative', width: D + 22, height: D + 22, display: 'grid', placeItems: 'center',
        animation: `vcFloat ${floatCfg.dur}s ease-in-out -${floatCfg.delay}s infinite` }}>
        {/* kontaktní stín — usazuje orb do 3D prostoru */}
        <span style={{ position: 'absolute', bottom: -14, left: '50%', width: D * 0.86, height: 11,
          borderRadius: '50%', background: `radial-gradient(50% 50%, ${st.c}44, transparent 72%)`,
          filter: 'blur(2px)', zIndex: 0, pointerEvents: 'none',
          animation: st.live ? 'vcShadow 4s ease-in-out infinite' : 'none',
          transform: 'translateX(-50%)', opacity: 0.45 }} />
        {/* 3D orbity úloh */}
        <VcOrbitField seed={sys.id} color={st.c} count={sys.active} baseR={D / 2 + 13} />
        {/* haló stavu (barva = STAV) */}
        <span style={{
          position: 'absolute', width: D + 16, height: D + 16, borderRadius: '50%',
          border: `1.5px solid ${st.c}`, boxShadow: `0 0 16px ${st.c}55`, zIndex: 0,
          animation: st.live ? `vcHalo ${sys.state === 'working' ? 3.4 : 2}s ease-in-out infinite` : 'none',
          opacity: st.live ? undefined : 0.32, pointerEvents: 'none',
        }} />
        {/* pozornostní tep pro await/incident/report */}
        {(sys.state === 'await' || sys.state === 'incident' || sys.state === 'report') && (
          <span style={{ position: 'absolute', width: D + 16, height: D + 16, borderRadius: '50%', zIndex: 0,
            border: `1px solid ${st.c}`, animation: 'vcRing 2.4s ease-out infinite', pointerEvents: 'none' }} />
        )}
        {/* WebGL orb + identita (barva = IDENTITA subsystému) */}
        <div className="vc-orb" style={{ position: 'relative', width: D, height: D, zIndex: 2 }}>
          <ZOrb3D diameter={D} hex={sys.hue} state={sys.state} detail={1} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4, pointerEvents: 'none' }}>
            <Icon name={sys.glyph} size={30} stroke={1.6} style={{ color: '#eef3fb' }} />
          </div>
        </div>
      </div>
      {/* jmenovka */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        <span style={{ fontFamily: ZT.sans, fontSize: Math.max(12, Math.min(15, D * 0.19)), fontWeight: 600, color: ZT.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{sys.name}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c,
            boxShadow: st.live ? `0 0 6px ${st.c}` : 'none' }} />
          <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: st.c, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{st.label}</span>
        </span>
      </div>
    </div>
  );
};

// ── Spojnice ZIBBY ↔ subsystém ────────────────────────────────────────────
const VcConnectors = ({ nodes, cx, cy }) => (
  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
    {nodes.map((n) => {
      const st = VC_STATE[n.sys.state] || VC_STATE.idle;
      const mx = (cx + n.x) / 2 + (n.y - cy) * 0.08;
      const my = (cy + n.y) / 2 - (n.x - cx) * 0.08;
      const d = `M ${cx} ${cy} Q ${mx} ${my} ${n.x} ${n.y}`;
      return (
        <g key={n.sys.id}>
          <path d={d} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          {st.live && (
            <path d={d} fill="none" stroke={st.c} strokeWidth="1.4" strokeOpacity="0.5"
              strokeDasharray="2 10" strokeLinecap="round"
              style={{ animation: 'vcDash 3.2s linear infinite' }} />
          )}
        </g>
      );
    })}
  </svg>
);

// ── Mapa ──────────────────────────────────────────────────────────────────
const VcMapD = ({ onOpenSys, onOpenCore, dimmed, bottomReserve = 0 }) => {
  const [ref, { w, h }] = useMeasure();
  const leftInset = Math.min(336, Math.max(0, w * 0.32));   // rezerva pro rail běžících úloh
  const rightInset = Math.min(108, Math.max(0, w * 0.1));   // rezerva pro plovoucí dok napravo
  const usableH = Math.max(220, h - bottomReserve);

  // ── jádro v horní třetině obrazovky — poloměry se přizpůsobí prostoru
  // nahoře i dole kolem tohoto pevného středu ───────────────────────────────
  const cx = w / 2;
  const nodeD = Math.max(48, Math.min(76, usableH * 0.2));
  const topPad = nodeD / 2 + 16;                 // odstup horního uzlu od okraje (pod topbarem)
  const bottomExtent = nodeD / 2 + 10 + 44;      // odstup + dvouřádková jmenovka pod spodním uzlem
  const cy = Math.max(topPad, usableH / 3);      // jádro v horní třetině dostupné plochy
  const radiusY = Math.max(84, Math.min(cy - topPad, usableH - cy - bottomExtent));
  const coreSize = Math.max(96, Math.min(264, radiusY * 1.5));
  const radiusX = Math.max(150, Math.min(cx - leftInset - (nodeD / 2 + 64), (w - rightInset) - cx - (nodeD / 2 + 64), 340));

  const nodes = VC_SUBSYSTEMS.map((sys, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / VC_SUBSYSTEMS.length;
    return { sys, x: cx + radiusX * Math.cos(a), y: cy + radiusY * Math.sin(a) };
  });
  const running = VC_TASKS.filter((t) => t.pct !== null).length;
  const intensity = Math.min(0.7, 0.28 + running * 0.08);

  // ── demo předávání úloh mezi subsystémy (viz tagline Loom/Scout → Forge) ──
  const [handoffs, setHandoffsD] = useStateMD([]);
  const HANDOFF_PAIRS = useMemoMD(() => [['loom', 'forge'], ['scout', 'forge']], []);
  useEffectMD(() => {
    let alive = true; let n = 0;
    const spawn = () => {
      if (!alive) return;
      const [fromId, toId] = HANDOFF_PAIRS[n % HANDOFF_PAIRS.length]; n++;
      const id = `${fromId}-${toId}-${Date.now()}`;
      setHandoffsD((hs) => [...hs, { id, fromId, toId }]);
      setTimeout(() => alive && setHandoffsD((hs) => hs.filter((x) => x.id !== id)), 1500);
    };
    const t0 = setTimeout(spawn, 4200);
    const iv = setInterval(spawn, 10000);
    return () => { alive = false; clearTimeout(t0); clearInterval(iv); };
  }, [HANDOFF_PAIRS]);

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <div className="vc-map-layer" style={{
        position: 'absolute', inset: 0,
        transform: dimmed ? 'scale(0.94)' : 'scale(1)',
        filter: dimmed ? 'blur(3px) saturate(0.7)' : 'none',
        opacity: dimmed ? 0.35 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
      }}>
        <VcConnectors nodes={nodes} cx={cx} cy={cy} />
        <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', zIndex: 2 }}>
          <VcCoreD intensity={intensity} onOpen={onOpenCore} size={coreSize} />
        </div>
        {nodes.map((n) => (
          <VcNodeD key={n.sys.id} sys={n.sys} x={n.x} y={n.y} onOpen={onOpenSys} hidden={false} size={nodeD} />
        ))}
        {handoffs.map((ho) => {
          const from = nodes.find((n) => n.sys.id === ho.fromId);
          const to = nodes.find((n) => n.sys.id === ho.toId);
          if (!from || !to) return null;
          return <VcHandoffFlare key={ho.id} from={from} to={to} />;
        })}
      </div>
    </div>
  );
};

Object.assign(window, { VcMapD, VcCoreD, VcNodeD, useMeasure, vcRand });

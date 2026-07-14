// ZIBBY Velín-C — mapa (organismus). Střed = ZIBBY (vlní se dle aktivity),
// kolem 8 subsystémů na kruhu. Barva jádra = identita, haló + pohyb = STAV,
// obíhající světla = právě zpracovávané úlohy (náhodné orbity).
const { useState: useStateM, useEffect: useEffectM, useRef: useRefM, useMemo: useMemoM } = React;

(function injectVcCss() {
  if (document.getElementById('vc-css')) return;
  const el = document.createElement('style');
  el.id = 'vc-css';
  el.textContent = `
@keyframes vcSpin   { to { transform: rotate(360deg); } }
@keyframes vcCore   { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes vcBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.055); } }
@keyframes vcShadow { 0%,100% { transform: translateX(-50%) scaleX(1); opacity: .5; } 50% { transform: translateX(-50%) scaleX(.82); opacity: .32; } }
@keyframes vcWave   { 0% { border-radius: 47% 53% 44% 56% / 52% 46% 54% 48%; transform: rotate(0deg); }
                      50% { border-radius: 54% 46% 57% 43% / 44% 55% 45% 56%; }
                      100% { border-radius: 47% 53% 44% 56% / 52% 46% 54% 48%; transform: rotate(360deg); } }
@keyframes vcRing   { 0% { transform: scale(.72); opacity: .5; } 100% { transform: scale(2.1); opacity: 0; } }
@keyframes vcHalo   { 0%,100% { opacity: .45; } 50% { opacity: .9; } }
@keyframes vcFloat  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes vcDash   { to { stroke-dashoffset: -80; } }
@keyframes vcFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes vcPop    { from { transform: scale(.986); } to { transform: scale(1); } }
@keyframes vcSlideUp{ from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
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
  const ref = useRefM(null);
  const [size, setSize] = useStateM({ w: 1200, h: 720 });
  useEffectM(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => {
      const r = e[0].contentRect; setSize({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
};

// ── Střední orb ZIBBY — vlní se, intenzita = aktivita systému ─────────────
const VcCore = ({ intensity = 0.4, onOpen, focused }) => {
  const [responding, setResponding] = useStateM(false);
  useEffectM(() => {
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
  const waveDur = (7.5 - lvl * 4).toFixed(1);
  const coreDur = (5 - lvl * 2).toFixed(1);
  const A = ZT.accent;
  const S = 118;
  return (
    <div onClick={() => onOpen && onOpen()} title="ZIBBY · celkový přehled"
      style={{ position: 'relative', width: S, height: S, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
      {/* expandující tep — kadence roste s aktivitou */}
      {[0, 1].map((i) => (
        <span key={i} style={{
          position: 'absolute', width: S * 0.78, height: S * 0.78, borderRadius: '50%',
          border: `1px solid ${A}`, pointerEvents: 'none',
          animation: `vcRing ${(3.6 - lvl * 1.4).toFixed(1)}s ease-out ${(i * (1.8 - lvl * 0.7)).toFixed(1)}s infinite`,
        }} />
      ))}
      {/* měkká záře */}
      <span style={{ position: 'absolute', width: S * 1.5, height: S * 1.5, borderRadius: '50%',
        background: `radial-gradient(circle, ${A}${responding ? '3a' : '22'} 0%, transparent 65%)`,
        transition: 'background .8s', pointerEvents: 'none' }} />
      {/* 3D orbity orchestrace */}
      <VcOrbitField seed="zibby-core" color={A} count={4} baseR={S * 0.44} />
      {/* jádro */}
      <div className="vc-anim" style={{
        position: 'relative', width: S * 0.62, height: S * 0.62, borderRadius: '50%',
        display: 'grid', placeItems: 'center', zIndex: 2,
        background: `radial-gradient(circle at 38% 32%, #dbe7ff 0%, ${A} 42%, #24406e 78%, #16233c 100%)`,
        boxShadow: `0 0 ${18 + lvl * 26}px ${A}${responding ? 'cc' : '88'}, inset 0 0 20px rgba(255,255,255,0.25)`,
        animation: `vcCore ${coreDur}s ease-in-out infinite`, overflow: 'hidden',
        transition: 'box-shadow .8s',
      }}>
        {/* vlnící se vnitřní hladina */}
        <span style={{ position: 'absolute', width: '86%', height: '86%',
          background: `radial-gradient(circle at 60% 65%, ${A}dd, transparent 70%)`,
          animation: `vcWave ${waveDur}s ease-in-out infinite`, mixBlendMode: 'screen', opacity: .8 }} />
        <ZibbyMark size={34} color="#f2f6ff" />
      </div>
    </div>
  );
};

// ── 3D orbitální pole — každé světlo = jedna zpracovávaná úloha ────────────
// Světla obíhají po nakloněných eliptických drahách kolem jádra; procházejí
// před ním i za ním (hloubka → velikost, jas, rozostření, z-index).
const VcOrbitField = ({ seed, color, count, baseR }) => {
  const orbiters = useMemoM(() => {
    const r = vcRand(seed);
    return Array.from({ length: count }).map((_, i) => ({
      R: baseR + i * 10 + r() * 5,
      inc: 0.5 + r() * 0.7,            // náklon orbitální roviny (~28–68°)
      rot: r() * Math.PI * 2,          // orientace roviny
      speed: (0.5 + r() * 0.5) * (r() > 0.5 ? 1 : -1),
      phase: r() * Math.PI * 2,
      size: 5 + r() * 2.5,
    }));
  }, [seed, count, baseR]);

  const dots = useRefM([]);
  useEffectM(() => {
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
        const depth = (z / o.R + 1) / 2;           // 0 = vzadu, 1 = vpředu
        const sc = 0.5 + depth * 0.95;
        el.style.transform = `translate(-50%,-50%) translate(${X.toFixed(2)}px, ${Y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
        el.style.opacity = (0.3 + depth * 0.7).toFixed(3);
        el.style.filter = `blur(${((1 - depth) * 1.4).toFixed(2)}px)`;
        el.style.zIndex = z > 0 ? 3 : 1;
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

// ── Uzel subsystému ───────────────────────────────────────────────────────
const VcNode = ({ sys, x, y, onOpen, hidden }) => {
  const st = VC_STATE[sys.state] || VC_STATE.idle;
  const D = 66;               // průměr jádra
  const floatCfg = useMemoM(() => { const r = vcRand(sys.id); return { dur: (5 + r() * 3).toFixed(1), delay: (r() * 4).toFixed(1) }; }, [sys.id]);
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
        {/* haló stavu */}
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
        {/* pulzující jádro (identita) */}
        <div className="vc-orb" style={{
          position: 'relative', width: D, height: D, borderRadius: '50%', display: 'grid', placeItems: 'center',
          zIndex: 2,
          background: `radial-gradient(circle at 34% 28%, #ffffff 0%, ${sys.hue}f2 26%, ${sys.hue} 52%, ${sys.hue}66 82%, ${sys.hue}33 100%)`,
          boxShadow: `0 10px 26px ${sys.hue}55, 0 0 22px ${sys.hue}44, inset 0 -6px 14px ${sys.hue}88, inset 0 3px 8px rgba(255,255,255,0.5)`,
          color: '#0b0e13',
          animation: `vcBreath ${(3.6 + floatCfg.delay * 0.4).toFixed(1)}s ease-in-out infinite`,
          overflow: 'hidden',
        }}>
          {/* spekulární odlesk */}
          <span style={{ position: 'absolute', top: '12%', left: '20%', width: '34%', height: '26%',
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.85), transparent 70%)',
            filter: 'blur(1px)', pointerEvents: 'none' }} />
          <Icon name={sys.glyph} size={26} stroke={1.9} style={{ color: '#0b0e13', opacity: 0.82, position: 'relative' }} />
        </div>
      </div>
      {/* jmenovka */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        <span style={{ fontFamily: ZT.sans, fontSize: 15, fontWeight: 600, color: ZT.ink, letterSpacing: '-0.01em' }}>{sys.name}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c,
            boxShadow: st.live ? `0 0 6px ${st.c}` : 'none' }} />
          <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: st.c, letterSpacing: '0.02em' }}>{st.label}</span>
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
const VcMap = ({ onOpenSys, onOpenCore, focusedId, dimmed }) => {
  const [ref, { w, h }] = useMeasure();
  const leftInset = w >= 820 ? 336 : 0;
  const cx = leftInset + (w - leftInset) / 2;
  const cy = h / 2 - 4;
  const radius = Math.max(146, Math.min((w - leftInset) / 2 - 132, h / 2 - 128, 320));
  const nodes = VC_SUBSYSTEMS.map((sys, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / VC_SUBSYSTEMS.length;
    return { sys, x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });
  const running = VC_TASKS.filter((t) => t.pct !== null).length;
  const intensity = Math.min(0.7, 0.28 + running * 0.08);

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
          <VcCore intensity={intensity} onOpen={onOpenCore} />
        </div>
        {nodes.map((n) => (
          <VcNode key={n.sys.id} sys={n.sys} x={n.x} y={n.y} onOpen={onOpenSys} hidden={false} />
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { VcMap, VcCore, VcNode, useMeasure, vcRand });

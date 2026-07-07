// ZIBBY velín — Frame wrapper (intensity skins) + RunModal (interaction heart)
const { useState: useStateF } = React;

// Frame: full velín screen. skin = 'zen' | 'balanced' | 'hud'
const Frame = ({ children, skin = 'balanced' }) => {
  const overlays = [];
  if (skin === 'hud') {
    overlays.push(
      <div key="grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage: `linear-gradient(${Z.line} 1px, transparent 1px), linear-gradient(90deg, ${Z.line} 1px, transparent 1px)`,
        backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 90%)',
      }} />,
      <div key="scan" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5, mixBlendMode: 'overlay',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)',
      }} />,
    );
  } else if (skin === 'balanced') {
    overlays.push(
      <div key="scan" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35, mixBlendMode: 'overlay',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)',
      }} />,
    );
  } else if (skin === 'velin') {
    overlays.push(
      <div key="grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35,
        backgroundImage: `linear-gradient(${Z.line} 1px, transparent 1px), linear-gradient(90deg, ${Z.line} 1px, transparent 1px)`,
        backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)',
      }} />,
      <div key="scan" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.3, mixBlendMode: 'overlay',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)',
      }} />,
    );
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: Z.bg1, fontFamily: Z.sans, color: Z.ink, overflow: 'hidden' }}>
      {overlays}
      <div style={{ position: 'relative', display: 'flex', height: '100%', zIndex: 1 }}>{children}</div>
    </div>
  );
};

// HUD corner brackets (decorative)
const Corners = ({ color, inset = 0 }) => {
  const c = { position: 'absolute', width: 11, height: 11, borderColor: color, borderStyle: 'solid', opacity: 0.6 };
  return (
    <>
      <span style={{ ...c, top: inset, left: inset, borderWidth: '1.5px 0 0 1.5px' }} />
      <span style={{ ...c, top: inset, right: inset, borderWidth: '1.5px 1.5px 0 0' }} />
      <span style={{ ...c, bottom: inset, left: inset, borderWidth: '0 0 1.5px 1.5px' }} />
      <span style={{ ...c, bottom: inset, right: inset, borderWidth: '0 1.5px 1.5px 0' }} />
    </>
  );
};

// Generic card surface
const Card = ({ children, accent, glow = false, hud = false, pad = 18, style }) => (
  <div style={{
    position: 'relative', background: Z.panel, border: `1px solid ${Z.line}`, borderRadius: hud ? 4 : 12,
    padding: pad, boxShadow: glow ? `0 0 0 1px ${accent}22, 0 8px 30px rgba(0,0,0,0.3)` : '0 1px 0 rgba(255,255,255,0.02)',
    ...style,
  }}>
    {hud && <Corners color={accent} inset={6} />}
    {children}
  </div>
);

// ---- RunModal: the recurring interaction ---------------------------------
const PROJECTS = ['media-vault', 'home-ops', 'zibby-core', 'rohlik-list', '~/cesta/k/projektu'];

const RunModal = ({ skill, accent, onClose, projects }) => {
  const projectList = (projects && projects.length) ? projects.map(p => p.name) : PROJECTS;
  const [prompt, setPrompt] = useStateF('');
  const [proj, setProj] = useStateF(projectList[0]);
  const [launched, setLaunched] = useStateF(false);
  if (!skill) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 540, maxWidth: '100%', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4,
        boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', background: accentDimOf(skill.ctx), color: accent, border: `1px solid ${accent}44` }}>
            <Icon name={skill.glyph || 'spark'} size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 15, fontWeight: 700, color: Z.ink }}>{skill.name}</div>
            <div style={{ fontSize: 12, color: Z.inkDim }}>{skill.desc}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {!launched ? (
          <div style={{ padding: 20 }}>
            <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase' }}>Zadání / prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus
              placeholder={`Řekni ${skill.name}, co má udělat…`}
              style={{
                width: '100%', minHeight: 96, marginTop: 8, padding: '12px 14px', resize: 'vertical',
                background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, color: Z.ink,
                fontFamily: Z.sans, fontSize: 13.5, lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
              }} />

            <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase', display: 'block', marginTop: 16 }}>Cílový projekt</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
              {projectList.map((p) => (
                <button key={p} onClick={() => setProj(p)} style={{
                  fontFamily: Z.mono, fontSize: 11, padding: '6px 11px', cursor: 'pointer', borderRadius: 2,
                  color: proj === p ? Z.bg0 : Z.inkDim, background: proj === p ? accent : 'transparent',
                  border: `1px solid ${proj === p ? accent : Z.line}`,
                }}>{p}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '9px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3 }}>
              <Icon name="file" size={13} style={{ color: Z.inkFaint }} />
              <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>{skill.file}</Mono>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <GhostBtn icon="edit">Edit raw SKILL.md</GhostBtn>
              <RunBtn accent={accent} label="Spustit agenta" onClick={() => setLaunched(true)} />
            </div>
          </div>
        ) : (
          <div style={{ padding: '30px 20px 24px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, margin: '0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', color: accent, border: `1.5px solid ${accent}`, boxShadow: `0 0 24px ${accent}55` }}>
              <Icon name="play" size={22} stroke={2} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 16 }}>Agent spuštěn na pozadí</div>
            <Mono style={{ fontSize: 12, color: Z.inkDim, display: 'block', marginTop: 6 }}>{skill.name} → {proj}</Mono>
            <div style={{ margintop: 4, fontSize: 12.5, color: Z.inkDim, marginTop: 8 }}>Sleduj ho v sekci <span style={{ color: accent }}>Běžící agenti</span>.</div>
            <div style={{ marginTop: 20 }}><GhostBtn icon="pulse" onClick={onClose}>Zavřít</GhostBtn></div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { Frame, Corners, Card, RunModal, PROJECTS, HudPanel });

// HUD panel — squared surface w/ corner brackets + `// title` (shared final look)
function HudPanel({ children, accent, title, right, style, pad = 16 }) {
  return (
    <div style={{ position: 'relative', background: 'rgba(13,17,23,0.72)', border: `1px solid ${Z.line}`, padding: pad, ...style }}>
      <Corners color={accent} inset={5} />
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
          <Mono style={{ fontSize: 9.5, letterSpacing: '0.2em', color: Z.inkFaint, textTransform: 'uppercase' }}>
            <span style={{ color: accent, opacity: 0.8 }}>//</span> {title}
          </Mono>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

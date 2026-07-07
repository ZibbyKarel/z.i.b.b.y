// ZIBBY velín — Pravidla schvalování · rámec editoru agenta (levý sloupec reduced)
const { useState: useStateGR4 } = React;

// kompaktní (reduced) pole — kontext, který se nemění
const RedField = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: `1px solid ${Z.line}` }}>
    <Mono style={{ fontSize: 9, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase', width: 120, flex: '0 0 auto' }}>{label}</Mono>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{children}</div>
  </div>
);
const RVal = ({ children }) => <Mono style={{ fontSize: 12, color: Z.inkDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</Mono>;

const AgentGateEditor = () => {
  const accent = Z.work;
  return (
    <div data-screen-label="Editor agenta · Pravidla schvalování" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        width: 1060, maxWidth: '100%', maxHeight: '94%', display: 'flex', flexDirection: 'column',
        background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4,
        boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}><Icon name="flask" size={19} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 15, fontWeight: 700, color: Z.ink }}>Tester</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
              <span style={{ fontFamily: Z.mono, fontSize: 9.5, fontWeight: 600, color: Z.inkDim, padding: '2px 8px', borderRadius: 2, border: `1px solid ${Z.line}` }}>Kvalita</span>
              <GatedBadge tip="Má pravidla typu ask — volání projdou frontou schválení" />
            </div>
          </div>
          <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', cursor: 'pointer', borderRadius: 2, fontFamily: Z.mono, fontSize: 11, fontWeight: 600, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}><Icon name="pause" size={13} /> Aktivní</button>
          <button style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {/* body — 2 sloupce */}
        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.14fr) minmax(0, 0.86fr)', gap: 22, alignItems: 'start' }}>
          {/* LEVÝ SLOUPEC */}
          <div>
            {/* reduced kontext (beze změny) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Mono style={{ fontSize: 9, letterSpacing: '0.16em', color: Z.inkFaint, textTransform: 'uppercase' }}>Konfigurace agenta</Mono>
              <div style={{ flex: 1, height: 1, background: Z.line }} />
              <Mono style={{ fontSize: 8.5, letterSpacing: '0.1em', color: Z.inkFaint, textTransform: 'uppercase', padding: '2px 7px', border: `1px solid ${Z.line}`, borderRadius: 2 }}>beze změny</Mono>
            </div>
            <div style={{ opacity: 0.5, pointerEvents: 'none', userSelect: 'none', marginBottom: 22 }}>
              <RedField label="Jméno"><RVal>Tester</RVal></RedField>
              <RedField label="Role"><RVal>Spustí testy, vrací report a vrací práci zpět</RVal></RedField>
              <RedField label="Kategorie">
                <span style={{ fontFamily: Z.mono, fontSize: 11, padding: '4px 9px', borderRadius: 2, color: Z.bg0, background: Z.work, border: `1px solid ${Z.work}` }}>Kvalita</span>
                <span style={{ fontFamily: Z.mono, fontSize: 11, padding: '4px 9px', borderRadius: 2, color: Z.inkFaint, border: `1px solid ${Z.line}` }}>Vývoj</span>
              </RedField>
              <RedField label="Model · Thinking"><ModelBadge model="sonnet" /><ThinkBadge level="medium" /></RedField>
              <RedField label="Ikona"><Icon name="flask" size={16} style={{ color: Z.work }} /></RedField>
              <RedField label="Povolené nástroje">
                {['read', 'bash', 'git'].map((t) => <ToolChip key={t} t={t} />)}
              </RedField>
            </div>

            {/* NOVÁ DETAILNÍ SEKCE */}
            <ApprovalRulesSection accent={accent} agentName="Tester" />
          </div>

          {/* PRAVÝ SLOUPEC — agent.md (reduced) */}
          <div style={{ opacity: 0.42, pointerEvents: 'none', userSelect: 'none' }}>
            <Mono style={{ fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>agent.md</Mono>
            <div style={{ background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 4, padding: '14px 16px', minHeight: 380 }}>
              {[['---', 0.5], ['name: tester', 0.7], ['category: Kvalita', 0.7], ['model: sonnet', 0.7], ['thinking: medium', 0.7], ['tools: [read, bash, git]', 0.7], ['---', 0.5]].map(([t, o], i) => (
                <div key={i} style={{ fontFamily: Z.mono, fontSize: 11.5, color: Z.inkDim, opacity: o, lineHeight: 1.9 }}>{t}</div>
              ))}
              <div style={{ height: 14 }} />
              <div style={{ height: 13, width: '38%', background: Z.line, borderRadius: 2, marginBottom: 14 }} />
              {[92, 78, 84, 60, 88, 70, 40].map((w, i) => <div key={i} style={{ height: 8, width: w + '%', background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginBottom: 11 }} />)}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          <button style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
          <RunBtn accent={accent} label={<span style={{ whiteSpace: 'nowrap' }}>Uložit změny</span>} />
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { AgentGateEditor });

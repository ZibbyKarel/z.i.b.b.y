// ZIBBY velín — shared Overview content cards
const { useState: useStateO } = React;

// Greeting line by ctx — butler tone
const greeting = () => 'Dobré ráno';

// --- Quick-launch skill tile ---------------------------------------------
const SkillTile = ({ skill, accent, onRun, hud = false }) => {
  const [h, setH] = useStateO(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: h ? Z.panelHi : Z.panel, border: `1px solid ${h ? accent + '55' : Z.line}`,
        borderRadius: Z.rPanel, padding: 15, transition: 'all .15s', cursor: 'default',
        boxShadow: h ? `0 6px 22px rgba(0,0,0,0.35)` : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: accentDimOf(skill.ctx), color: accent, border: `1px solid ${accent}33` }}>
          <Icon name={skill.glyph} size={17} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 13, fontWeight: 600, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{skill.name}</div>
          <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 3, lineHeight: 1.35 }}>{skill.desc}</div>
        </div>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: Z.inkFaint, flex: '0 0 auto', marginTop: 4 }} title="idle" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{skill.file.replace('~/zibby/skills/', '')}</Mono>
        <RunBtn accent={accent} size="sm" onClick={() => onRun(skill)} />
      </div>
    </div>
  );
};

// --- Approval card --------------------------------------------------------
const ApprovalCard = ({ a = APPROVALS[0], hud = false }) => {
  const accent = accentOf(a.ctx);
  const [done, setDone] = useStateO(null);
  return (
    <Card accent={Z.bad} hud={hud} pad={16} style={{ borderColor: 'rgba(255,107,107,0.32)', boxShadow: `0 0 0 1px rgba(255,107,107,0.12), 0 6px 24px rgba(0,0,0,0.3)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Dot color={Z.bad} pulse size={8} />
        <Mono style={{ fontSize: 10, letterSpacing: '0.16em', color: Z.bad, textTransform: 'uppercase', fontWeight: 600 }}>Čeká na tvé schválení</Mono>
        <span style={{ marginLeft: 'auto', fontFamily: Z.mono, fontSize: 9.5, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 5, padding: '2px 7px' }}>{a.risk}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: accentDimOf(a.ctx), color: accent, border: `1px solid ${accent}33` }}><Icon name="cart" size={16} /></div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}><Mono style={{ color: accent }}>{a.skill}</Mono> <span style={{ color: Z.inkDim, fontWeight: 400 }}>chce</span> {a.action}</div>
          <div style={{ fontSize: 12, color: Z.inkDim, marginTop: 2 }}>{a.detail}</div>
        </div>
      </div>
      {done ? (
        <div style={{ marginTop: 13, padding: '9px 12px', borderRadius: 8, background: done === 'ok' ? 'rgba(57,217,138,0.12)' : 'rgba(255,107,107,0.1)', fontFamily: Z.mono, fontSize: 11.5, color: done === 'ok' ? Z.ok : Z.bad }}>
          {done === 'ok' ? '✓ Schváleno — agent pokračuje' : '✕ Zamítnuto — akce zrušena'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <button onClick={() => setDone('ok')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px', cursor: 'pointer', fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color: Z.bg0, background: Z.ok, border: 'none', borderRadius: 2, boxShadow: `0 0 14px ${Z.ok}44` }}><Icon name="check" size={14} stroke={2.4} /> Schválit</button>
          <button onClick={() => setDone('no')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px', cursor: 'pointer', fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}66`, borderRadius: 2 }}><Icon name="x" size={14} stroke={2.4} /> Zamítnout</button>
        </div>
      )}
    </Card>
  );
};

// --- Running agent row ----------------------------------------------------
const AgentRow = ({ a, hud = false }) => {
  const accent = accentOf(a.ctx);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${Z.line}` }}>
      <Dot color={accent} pulse size={8} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <Mono style={{ fontSize: 12.5, fontWeight: 600, color: Z.ink, flex: '0 0 auto' }}>{a.skill}</Mono>
          <Mono style={{ fontSize: 10, color: Z.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {a.project}</Mono>
        </div>
        <div style={{ fontSize: 11.5, color: Z.inkDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{a.prompt}</div>

      </div>
      <button title="Zastavit" style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'transparent', border: `1px solid ${Z.line}`, color: Z.inkFaint, cursor: 'pointer' }}><Icon name="stop" size={12} /></button>
    </div>
  );
};

// --- Activity feed --------------------------------------------------------
const feedIconColor = { run: Z.run, wait: Z.warn, ok: Z.ok, edit: Z.inkDim };
const ActivityFeed = ({ items = ACTIVITY, limit = 5 }) => (
  <div>
    {items.slice(0, limit).map((e) => (
      <div key={e.id} style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: `1px solid ${Z.line}` }}>
        <span style={{ color: feedIconColor[e.icon] || Z.inkDim, marginTop: 1, display: 'flex' }}><Icon name={e.icon} size={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: Z.ink }}>{e.text}</div>
          <Mono style={{ fontSize: 10.5, color: Z.inkFaint, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sub}</Mono>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot color={accentOf(e.ctx)} size={5} />
          <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{e.t}</Mono>
        </div>
      </div>
    ))}
  </div>
);

// --- mini stat ------------------------------------------------------------
const Stat = ({ value, label, accent, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
    {icon && <span style={{ color: accent || Z.inkDim, display: 'flex' }}><Icon name={icon} size={18} /></span>}
    <div>
      <div style={{ fontFamily: Z.mono, fontSize: 22, fontWeight: 700, color: Z.ink, lineHeight: 1, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: Z.inkFaint, marginTop: 4, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  </div>
);

Object.assign(window, { SkillTile, ApprovalCard, AgentRow, ActivityFeed, Stat, greeting, feedIconColor });

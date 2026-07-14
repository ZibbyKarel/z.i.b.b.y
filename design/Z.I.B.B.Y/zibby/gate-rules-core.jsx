// ZIBBY velín — Pravidla schvalování (Gate Rules) · core primitives
// Mentální model: pravidlo = matcher → decision (→ resolution, jen u "ask").
// Risk NENÍ vlastnost nástroje — je vlastnost trojice (akce, argument/cíl, kontext).
// Tyto komponenty vykreslují jedno serializovatelné pravidlo (match → decision → resolve).
const { useState: useStateGR } = React;

// ---- decision: 4 hodnoty, každá svou barvou -----------------------------
const DECISION = {
  allow:  { token: 'allow',  cz: 'tiše provede',        c: '#5fa97d', icon: 'check'  }, // ztlumená zelená
  notify: { token: 'notify', cz: 'provede + zaloguje',  c: Z.run,     icon: 'pulse'  }, // modrá
  ask:    { token: 'ask',    cz: 'pozastaví → zeptá se',c: Z.warn,    icon: 'shield', gated: true }, // amber/gold = GATED
  deny:   { token: 'deny',   cz: 'nikdy neprovede',     c: Z.bad,     icon: 'x'      }, // červená
};
const DECISION_ORDER = ['allow', 'notify', 'ask', 'deny'];

// ---- matcher: typy --------------------------------------------------------
const MATCHER = {
  tool:      { label: 'Nástroj+vzor', short: 'nástroj', icon: 'code',    hint: 'bash(rm -rf*), git(push → main)' },
  action:    { label: 'Akce',           short: 'akce',    icon: 'bolt',    hint: 'sémantické sloveso — purchase, merge, deploy' },
  threshold: { label: 'Práh',           short: 'práh',    icon: 'pulse',   hint: 'purchase.amount > 500, files_changed > 10' },
  scope:     { label: 'Rozsah',         short: 'rozsah',  icon: 'branch',  hint: 'repo · větev · path glob · doména' },
};
const MATCHER_ORDER = ['tool', 'action', 'threshold', 'scope'];

const ACTION_VERBS = ['purchase', 'payment', 'merge', 'deploy', 'delete', 'send_email'];
const SCOPE_KINDS = [['repo', 'repo'], ['branch', 'větev'], ['path', 'path glob'], ['domain', 'doména']];
const THRESHOLD_METRICS = ['purchase.amount', 'files_changed', 'lines_changed', 'recipients'];
const CHECK_NAMES = [['ci_green', 'CI'], ['tests_pass', 'testy'], ['lint_clean', 'lint']];
const RESOLVE_AGENTS = ['reviewer', 'architect', 'tester'];
// barva zvýrazněného argumentu/vzoru — sémanticky (git/push = fialová, mazání = červená, peníze = amber)
const patColor = (r) => {
  if (r.tool === 'git' || r.verb === 'push' || r.verb === 'merge' || r.verb === 'deploy') return '#b07cff';
  if (r.tool === 'bash' || r.verb === 'delete' || r.label === 'delete' || /rm\b/.test(r.pattern || '')) return Z.bad;
  if (r.label === 'purchase' || r.label === 'payment' || r.metric === 'purchase.amount') return Z.home;
  return Z.work;
};

// ---- decision badge -------------------------------------------------------
const DecisionBadge = ({ decision, big = false }) => {
  const d = DECISION[decision] || DECISION.ask;
  const glow = decision === 'ask';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 7 : 5, fontFamily: Z.mono,
      fontSize: big ? 12.5 : 10.5, fontWeight: 700, letterSpacing: '0.06em',
      padding: big ? '6px 12px' : '3px 9px', borderRadius: 2, color: d.c,
      background: `${d.c}1c`, border: `1px solid ${d.c}${glow ? '88' : '55'}`, whiteSpace: 'nowrap',
      boxShadow: glow ? `0 0 12px ${d.c}33` : 'none',
    }}>
      <Icon name={d.icon} size={big ? 14 : 11} stroke={decision === 'ask' ? 1.8 : 1.6} /> {d.token}
    </span>
  );
};

// ---- resolution chips (jen u "ask") --------------------------------------
const personPath = (
  <g>
    <circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </g>
);
const ResChip = ({ res }) => {
  let icon, label, c;
  if (res.kind === 'human') { label = 'Ty'; c = Z.ink; }
  else if (res.kind === 'check') { icon = 'check'; label = (CHECK_NAMES.find((x) => x[0] === res.name) || [, res.name])[1] || res.name; c = '#5fa97d'; }
  else { icon = 'bot'; label = res.name; c = '#b07cff'; }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 10, fontWeight: 600,
      padding: '2px 8px 2px 6px', borderRadius: 2, color: Z.ink, background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${Z.line}`, whiteSpace: 'nowrap',
    }}>
      {res.kind === 'human'
        ? <svg viewBox="0 0 24 24" width={12} height={12} style={{ display: 'block', color: c }}>{personPath}</svg>
        : <Icon name={icon} size={11} style={{ color: c }} />}
      {label}
    </span>
  );
};
const ResolutionChips = ({ resolution = [], mode = 'all' }) => {
  if (!resolution.length) return null;
  const sep = mode === 'all' ? 'AND' : 'OR';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {resolution.map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Mono style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', color: Z.inkFaint }}>{sep}</Mono>}
          <ResChip res={r} />
        </React.Fragment>
      ))}
    </span>
  );
};

// ---- matcher → lidsky čitelný text (argument zvýrazněn) ------------------
const Pat = ({ children, color }) => (
  <span style={{
    fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color, background: `${color}18`,
    border: `1px solid ${color}3a`, borderRadius: 2, padding: '1px 6px', whiteSpace: 'nowrap',
  }}>{children}</span>
);
const Dim = ({ children }) => <span style={{ fontFamily: Z.mono, fontSize: 12, color: Z.inkDim }}>{children}</span>;

const MatcherText = ({ rule }) => {
  const c = patColor(rule);
  const wrap = { display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', lineHeight: 1.5 };
  if (rule.type === 'tool') {
    if (rule.verb) return (
      <span style={wrap}><span style={{ fontFamily: Z.mono, fontSize: 12, color: Z.inkDim, whiteSpace: 'nowrap' }}>{rule.tool} {rule.verb}</span><span style={{ color: Z.inkFaint }}>→</span><Pat color={c}>{rule.pattern}</Pat></span>
    );
    return (
      <span style={wrap}><Dim>{rule.tool}(</Dim><Pat color={c}>{rule.pattern}</Pat><Dim>)</Dim></span>
    );
  }
  if (rule.type === 'action') return (
    <span style={wrap}>
      <span style={{ fontFamily: Z.mono, fontSize: 13, fontWeight: 700, color: Z.ink }}>{rule.label}</span>
      {rule.pattern && <><span style={{ color: Z.inkFaint }}>→</span><Pat color={c}>{rule.pattern}</Pat></>}
      {rule.sub && <span style={{ fontSize: 11, color: Z.inkFaint }}>· {rule.sub}</span>}
    </span>
  );
  if (rule.type === 'threshold') return (
    <span style={wrap}><Dim>{rule.metric}</Dim><span style={{ color: Z.inkFaint, fontFamily: Z.mono, fontSize: 12 }}>{rule.op}</span><Pat color={c}>{rule.value}</Pat></span>
  );
  if (rule.type === 'scope') {
    const kindLbl = (SCOPE_KINDS.find((k) => k[0] === rule.scopeKind) || [, rule.scopeKind])[1];
    return (<span style={wrap}><span style={{ fontSize: 10.5, color: Z.inkFaint, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: Z.mono }}>{kindLbl}</span><Pat color={c}>{rule.pattern}</Pat></span>);
  }
  return null;
};

Object.assign(window, {
  DECISION, DECISION_ORDER, MATCHER, MATCHER_ORDER, ACTION_VERBS, SCOPE_KINDS,
  THRESHOLD_METRICS, CHECK_NAMES, RESOLVE_AGENTS, patColor,
  DecisionBadge, ResolutionChips, ResChip, MatcherText, Pat, personPath,
});

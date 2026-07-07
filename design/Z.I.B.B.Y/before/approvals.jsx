// ZIBBY velín — Schválení: vlajkový approval flow.
// Fronta čekajících schválení → detail rizika (náhled diffu/košíku/příkazu/zprávy)
// → Schválit / Zamítnout → co se stane po rozhodnutí. awaiting-approval = první třída.
const { useState: useStateAp } = React;

// ---- risk badge ----------------------------------------------------------
const RiskBadge = ({ risk, big = false }) => {
  const r = RISK[risk] || RISK.platba;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 7 : 5, fontFamily: Z.mono,
      fontSize: big ? 11.5 : 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: big ? '5px 10px' : '2px 8px', borderRadius: 2, color: r.c,
      background: `${r.c}1c`, border: `1px solid ${r.c}55`, whiteSpace: 'nowrap',
    }}>
      <Icon name={r.glyph} size={big ? 14 : 11} /> {r.label}
    </span>
  );
};

// ---- severity meter ------------------------------------------------------
// Sekundární závažnost (nízká/střední/vysoká) odvozená z typu rizika.
// Tři segmenty, barvené statusovou paletou — doplněk k sémantickému badge.
const SeverityMeter = ({ level, risk, showLabel = false }) => {
  const lvl = level || (RISK[risk] || {}).sev || 'med';
  const sev = SEVERITY[lvl] || SEVERITY.med;
  return (
    <span title={`závažnost: ${sev.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: showLabel ? 7 : 0, flex: '0 0 auto' }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[1, 2, 3].map((i) => (
          <span key={i} style={{ width: 4, height: 11, borderRadius: 1, background: i <= sev.n ? sev.c : Z.line, boxShadow: i <= sev.n ? `0 0 5px ${sev.c}55` : 'none' }} />
        ))}
      </span>
      {showLabel && <Mono style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sev.c }}>{sev.label}</Mono>}
    </span>
  );
};

// ---- queue card (left rail) ---------------------------------------------
const ApprovalQueueCard = ({ a, accent, selected, decided, onSelect }) => {
  const [h, setH] = useStateAp(false);
  const r = RISK[a.risk] || RISK.platba;
  const dec = decided[a.id];
  return (
    <div onClick={() => onSelect(a.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: selected ? Z.panelHi : Z.panel,
        border: `1px solid ${selected ? r.c : (h ? r.c + '66' : Z.line)}`, borderLeft: `3px solid ${dec ? (dec === 'ok' ? Z.ok : Z.inkFaint) : r.c}`,
        borderRadius: 3, padding: '13px 14px', cursor: 'pointer', transition: 'all .14s',
        boxShadow: selected ? `0 0 0 1px ${r.c}33, 0 8px 24px rgba(0,0,0,0.35)` : 'none', opacity: dec ? 0.6 : 1,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${r.c}18`, color: r.c, border: `1px solid ${r.c}44` }}>
          <Icon name={a.glyph} size={16} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Mono style={{ fontSize: 12.5, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.actor}</Mono>
            <Mono style={{ fontSize: 9, color: Z.inkFaint }}>{a.actorKind}</Mono>
          </div>
          <div style={{ fontSize: 12, color: Z.inkDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }}>
        {dec
          ? <Mono style={{ fontSize: 9.5, color: dec === 'ok' ? Z.ok : Z.inkFaint }}>{dec === 'ok' ? '✓ schváleno' : '✕ zamítnuto'}</Mono>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><RiskBadge risk={a.risk} /><SeverityMeter risk={a.risk} /></span>}
        <Mono style={{ fontSize: 9, color: Z.inkFaint }}>{a.requested}</Mono>
      </div>
    </div>
  );
};

// ---- preview renderers ---------------------------------------------------
const PreviewShell = ({ icon, label, meta, accent, children }) => (
  <div style={{ border: `1px solid ${Z.line}`, borderRadius: 4, overflow: 'hidden', background: Z.bg0 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: `1px solid ${Z.line}`, background: Z.bg1 }}>
      <Icon name={icon} size={14} style={{ color: accent }} />
      <Mono style={{ fontSize: 10.5, color: Z.ink, fontWeight: 600 }}>{label}</Mono>
      {meta && <Mono style={{ fontSize: 9.5, color: Z.inkFaint, marginLeft: 'auto' }}>{meta}</Mono>}
    </div>
    {children}
  </div>
);

const CartPreview = ({ p, accent }) => (
  <PreviewShell icon="cart" label="náhled košíku" meta={p.meta} accent={accent}>
    <div>
      {p.items.map(([name, price], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 13px', borderBottom: `1px solid ${Z.line}`, fontSize: 12.5 }}>
          <span style={{ color: name.startsWith('+') ? Z.inkFaint : Z.inkDim }}>{name}</span>
          <Mono style={{ fontSize: 11.5, color: Z.ink, flex: '0 0 auto' }}>{price}</Mono>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 13px', background: 'rgba(240,180,41,0.06)' }}>
      <Mono style={{ fontSize: 10.5, color: Z.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Celkem k platbě</Mono>
      <Mono style={{ fontSize: 18, fontWeight: 700, color: RISK.platba.c }}>{p.total}</Mono>
    </div>
  </PreviewShell>
);

const DiffPreview = ({ p, accent }) => {
  const lc = { add: { c: '#7fd98a', bg: 'rgba(127,217,138,0.09)', s: '+' }, del: { c: '#ff6b6b', bg: 'rgba(255,107,107,0.09)', s: '−' }, ctx: { c: Z.inkDim, bg: 'transparent', s: ' ' } };
  return (
    <PreviewShell icon="branch" label={p.file} meta={p.meta} accent={accent}>
      {p.hunks.map((hk, hi) => (
        <div key={hi}>
          <div style={{ padding: '6px 13px', fontFamily: Z.mono, fontSize: 11, color: '#b07cff', background: 'rgba(176,124,255,0.08)', borderBottom: `1px solid ${Z.line}` }}>{hk.h}</div>
          {hk.lines.map(([k, t], i) => {
            const m = lc[k];
            return (
              <div key={i} style={{ display: 'flex', gap: 0, background: m.bg, fontFamily: Z.mono, fontSize: 11.5, lineHeight: 1.7 }}>
                <span style={{ width: 22, flex: '0 0 auto', textAlign: 'center', color: m.c, opacity: 0.7, userSelect: 'none' }}>{m.s}</span>
                <span style={{ color: k === 'ctx' ? Z.inkDim : m.c, whiteSpace: 'pre', paddingRight: 13 }}>{t || ' '}</span>
              </div>
            );
          })}
        </div>
      ))}
    </PreviewShell>
  );
};

const CommandPreview = ({ p, accent }) => (
  <PreviewShell icon="server" label={`spustí se na · ${p.shell}`} meta={p.note} accent={RISK.mazani.c}>
    <div style={{ padding: '13px', fontFamily: Z.mono, fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <span style={{ color: RISK.mazani.c, flex: '0 0 auto' }}>$</span>
        <span style={{ color: Z.ink, whiteSpace: 'pre-wrap' }}>{p.cmd}</span>
      </div>
    </div>
    <div style={{ borderTop: `1px solid ${Z.line}`, padding: '10px 13px' }}>
      <Mono style={{ fontSize: 9, color: Z.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>cíle mazání</Mono>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {p.targets.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="trash" size={12} style={{ color: RISK.mazani.c, opacity: 0.7, flex: '0 0 auto' }} />
            <Mono style={{ fontSize: 11, color: t.startsWith('…') ? Z.inkFaint : Z.inkDim }}>{t}</Mono>
          </div>
        ))}
      </div>
    </div>
  </PreviewShell>
);

const MessagePreview = ({ p, accent }) => (
  <PreviewShell icon="arrow" label={`odeslat → ${p.to}`} meta={p.subject} accent={RISK.odeslani.c}>
    <div style={{ padding: '14px 15px' }}>
      <div style={{ fontSize: 13.5, color: Z.ink, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{p.body}</div>
    </div>
  </PreviewShell>
);

const renderPreview = (p, accent) => {
  if (!p) return null;
  if (p.kind === 'cart') return <CartPreview p={p} accent={accent} />;
  if (p.kind === 'diff') return <DiffPreview p={p} accent={accent} />;
  if (p.kind === 'command') return <CommandPreview p={p} accent={accent} />;
  if (p.kind === 'message') return <MessagePreview p={p} accent={accent} />;
  return null;
};

// ---- detail panel --------------------------------------------------------
const ApprovalDetail = ({ a, accent, decided, onDecide }) => {
  const r = RISK[a.risk] || RISK.platba;
  const dec = decided[a.id];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* header */}
      <HudPanel accent={r.c} pad={20} style={{ borderColor: `${r.c}55`, boxShadow: `0 0 0 1px ${r.c}1f, 0 0 24px ${r.c}12` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <Dot color={dec ? (dec === 'ok' ? Z.ok : Z.inkFaint) : r.c} pulse={!dec} />
          <Mono style={{ fontSize: 10, letterSpacing: '0.18em', color: dec ? (dec === 'ok' ? Z.ok : Z.inkFaint) : r.c, textTransform: 'uppercase', fontWeight: 700 }}>
            {dec ? (dec === 'ok' ? 'Schváleno' : 'Zamítnuto') : 'Awaiting approval'}
          </Mono>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12 }}><SeverityMeter risk={a.risk} showLabel /><RiskBadge risk={a.risk} big /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 46, height: 46, flex: '0 0 auto', borderRadius: 3, display: 'grid', placeItems: 'center', background: `${r.c}18`, color: r.c, border: `1px solid ${r.c}44` }}>
            <Icon name={a.glyph} size={23} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
              <Mono style={{ color: r.c, fontSize: 19 }}>{a.actor}</Mono> <span style={{ color: Z.inkDim, fontWeight: 400 }}>chce</span> {a.action.replace(/^[A-ZÁ-Ž]/, (m) => m.toLowerCase())}
            </div>
            <Mono style={{ fontSize: 12, color: Z.inkDim, display: 'block', marginTop: 8 }}>{a.summary}</Mono>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${r.c}28`, flexWrap: 'wrap' }}>
          <div><Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>VYŽÁDÁNO</Mono><Mono style={{ fontSize: 12, color: Z.ink }}>{a.requested}</Mono></div>
          <div><Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>SPUSTIL</Mono><Mono style={{ fontSize: 12, color: Z.ink }}>{a.via}</Mono></div>
          <div><Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>BĚH</Mono><Mono style={{ fontSize: 12, color: accent }}>{a.runId}</Mono></div>
        </div>
      </HudPanel>

      {/* preview of the exact action */}
      <HudPanel accent={accent} title="přesně tohle agent udělá" pad={18}>
        {renderPreview(a.preview, accent)}
      </HudPanel>

      {/* consequence + decision */}
      <HudPanel accent={r.c} pad={18}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', background: `${r.c}10`, border: `1px solid ${r.c}33`, borderRadius: 3 }}>
          <Icon name="warn" size={16} style={{ color: r.c, flex: '0 0 auto', marginTop: 1 }} />
          <div>
            <Mono style={{ fontSize: 10, color: r.c, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>co se stane po schválení</Mono>
            <div style={{ fontSize: 13, color: Z.inkDim, lineHeight: 1.55 }}>{a.consequence}</div>
          </div>
        </div>

        {dec ? (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderRadius: 3, background: dec === 'ok' ? 'rgba(57,217,138,0.1)' : 'rgba(154,167,180,0.08)', border: `1px solid ${dec === 'ok' ? Z.ok + '44' : Z.line}` }}>
            <Icon name={dec === 'ok' ? 'ok' : 'x'} size={18} style={{ color: dec === 'ok' ? Z.ok : Z.inkDim }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: dec === 'ok' ? Z.ok : Z.inkDim }}>{dec === 'ok' ? 'Schváleno — agent pokračuje' : 'Zamítnuto — akce zrušena'}</div>
              <Mono style={{ fontSize: 10.5, color: Z.inkFaint, display: 'block', marginTop: 3 }}>{dec === 'ok' ? `běh ${a.runId} pokračuje na pozadí · sleduj v Běhy & aktivita` : `běh ${a.runId} ukončen · žádná data nezměněna`}</Mono>
            </div>
            <button onClick={() => onDecide(a.id, null)} style={{ marginLeft: 'auto', fontFamily: Z.mono, fontSize: 11, padding: '7px 12px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Vrátit do fronty</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 11, marginTop: 16 }}>
            <button onClick={() => onDecide(a.id, 'ok')} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', cursor: 'pointer',
              fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.bg0, background: Z.ok, border: 'none', borderRadius: 2, boxShadow: `0 0 18px ${Z.ok}55`,
            }}><Icon name="check" size={16} stroke={2.4} /> Schválit</button>
            <button onClick={() => onDecide(a.id, 'no')} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', cursor: 'pointer',
              fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: r.c, background: 'transparent', border: `1px solid ${r.c}88`, borderRadius: 2,
            }}><Icon name="x" size={16} stroke={2.4} /> Zamítnout</button>
          </div>
        )}
        <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 11, textAlign: 'center' }}>
          ZIBBY nikdy nedokončí rizikovou akci bez tvého souhlasu. Approval gate je vynucená vrstva, ne doporučení.
        </Mono>
      </HudPanel>
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const ApprovalsBody = ({ accent }) => {
  const [decided, setDecided] = useStateAp({});
  const queue = APPROVAL_QUEUE;
  const pendingIds = queue.filter((a) => !decided[a.id]).map((a) => a.id);
  const [selId, setSelId] = useStateAp(queue[0] ? queue[0].id : null);
  const sel = queue.find((a) => a.id === selId) || queue[0];

  const decide = (id, v) => {
    setDecided((prev) => {
      const next = { ...prev };
      if (v === null) delete next[id]; else next[id] = v;
      return next;
    });
    // po rozhodnutí přeskoč na další čekající
    if (v) {
      const rest = queue.filter((a) => a.id !== id && !decided[a.id]);
      if (rest[0]) setSelId(rest[0].id);
    }
  };

  const pendingCount = pendingIds.length;
  const byRisk = ['platba', 'mazani', 'push', 'odeslani'].map((rk) => [rk, queue.filter((a) => a.risk === rk && !decided[a.id]).length]).filter(([, n]) => n > 0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={pendingCount ? Z.bad : Z.ok} pad={20} style={pendingCount ? { borderColor: `${Z.bad}44` } : {}}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Dot color={pendingCount ? Z.bad : Z.ok} pulse={!!pendingCount} />
              <div style={{ fontSize: 22, fontWeight: 600 }}>Schválení</div>
            </div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 8 }}>
              {pendingCount > 0
                ? <><span style={{ color: Z.bad }}>{pendingCount} akcí čeká</span> na tvé rozhodnutí · agenti jsou u nich pozastavení</>
                : <span style={{ color: Z.ok }}>fronta je prázdná — nic nečeká na schválení</span>}
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {byRisk.map(([rk, n]) => {
              const r = RISK[rk];
              return (
                <div key={rk} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 2, display: 'grid', placeItems: 'center', background: `${r.c}16`, color: r.c, border: `1px solid ${r.c}40` }}><Icon name={r.glyph} size={15} /></div>
                  <div><Mono style={{ fontSize: 18, fontWeight: 700, color: Z.ink, lineHeight: 1 }}>{n}</Mono><div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}><Mono style={{ fontSize: 8.5, color: Z.inkFaint }}>{r.label}</Mono><SeverityMeter risk={rk} /></div></div>
                </div>
              );
            })}
          </div>
        </div>
      </HudPanel>

      {/* master-detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* left: queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <SectionLabel right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{pendingCount} / {queue.length}</Mono>}>Fronta schválení</SectionLabel>
          {queue.map((a) => <ApprovalQueueCard key={a.id} a={a} accent={accent} selected={a.id === selId} decided={decided} onSelect={setSelId} />)}
        </div>

        {/* right: detail */}
        {sel
          ? <ApprovalDetail key={sel.id} a={sel} accent={accent} decided={decided} onDecide={decide} />
          : (
            <HudPanel accent={Z.ok} pad={50}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', color: Z.ok, border: `1.5px solid ${Z.ok}55`, background: 'rgba(57,217,138,0.06)' }}><Icon name="check" size={26} stroke={2} /></div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Nic nečeká</div>
                <Mono style={{ fontSize: 12, color: Z.inkDim, maxWidth: 360, lineHeight: 1.55 }}>Žádná riziková akce není ve frontě. Až bude agent chtít zaplatit, smazat, pushnout nebo něco odeslat, objeví se to tady.</Mono>
              </div>
            </HudPanel>
          )}
      </div>
    </div>
  );
};

Object.assign(window, { ApprovalsBody, RiskBadge, SeverityMeter, ApprovalDetail });

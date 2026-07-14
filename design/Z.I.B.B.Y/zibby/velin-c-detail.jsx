// ZIBBY Velín-C — detail subsystému (fokus). Mapa ustoupí, subsystém se rozvine.
// Forge plně rozpracovaný; ostatní naznačené stejným jazykem. Součástí je lehké
// zakládání úlohy (přirozený jazyk + periodicita, zbytek ZIBBY doplní).
const { useState: useStateD, useRef: useRefD } = React;

// doplňkový obsah detailu (artefakty + nedávné) — ukázková data
const VC_DETAIL_EXTRA = {
  forge: {
    recent: [
      { title: 'feat/jwt-refresh sloučen', note: 'včera 18:20 · +140 −22 · CI zelené', state: 'ok' },
      { title: 'feat/rate-limiter sloučen', note: 'předevčírem · review čisté', state: 'ok' },
      { title: 'feat/oauth-scopes zaparkován', note: '3 dny · flaky test, čeká na tebe', state: 'wait' },
    ],
    artifacts: [
      { icon: 'branch', label: 'feat/search-filters', note: 'otevřená větev · +214 −38' },
      { icon: 'doc', label: 'design.md', note: 'auth-svc · aktuální' },
      { icon: 'check', label: 'PR #142', note: 'připraven — čeká na push do main' },
    ],
  },
  loom: { recent: [{ title: 'Cyklická závislost session↔store', note: 'předáno Forge · 05:12', state: 'ok' }], artifacts: [{ icon: 'doc', label: 'findings/2026-06-14.md', note: '1 medium nález' }] },
  sentinel: { recent: [{ title: 'Sken tajemství čistý', note: 'včera · 0 úniků', state: 'ok' }], artifacts: [{ icon: 'shield', label: 'cve-report.md', note: 'CVE-2026-0142 · moderate' }] },
  scout: { recent: [{ title: 'Rate-limiting patterns', note: 'včera · knowledge/*.md', state: 'ok' }], artifacts: [{ icon: 'doc', label: 'sources.md', note: '12 zdrojů' }] },
  maestro: { recent: [{ title: 'Release r2026.5 nasazen', note: 'minulý týden', state: 'ok' }], artifacts: [{ icon: 'checkpoint', label: 'r2026.6', note: 'tag připraven' }, { icon: 'doc', label: 'changelog.md', note: '4 PR' }] },
  herald: { recent: [{ title: 'Odpověď na #dev-general', note: '1 h · stručně, bez pozdravu', state: 'ok' }], artifacts: [] },
  beacon: { recent: [{ title: 'Eskalace vyřešena · disk full', note: 'včera 22:10', state: 'ok' }], artifacts: [] },
  puls: { recent: [{ title: '#bugs → 1 report zařazen', note: '06:54 · Tier 1', state: 'ok' }], artifacts: [] },
};

// ── Posádka ────────────────────────────────────────────────────────────────
const VcCrew = ({ crew, hue }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
    {crew.map((m, i) => {
      const named = typeof m === 'string';
      const a = named ? agentByName(m) : m;
      const role = named ? (a.role || '') : m.role;
      const nm = named ? m : m.name;
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}` }}>
          {named && a.avatar
            ? <Avatar src={a.avatar} size={30} radius={ZT.rCtl} accent={hue} />
            : <div style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: ZT.rCtl, display: 'grid', placeItems: 'center', background: `${hue}1e`, color: hue, border: `1px solid ${hue}44` }}><Icon name={(a && a.glyph) || 'bot'} size={16} /></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, fontWeight: 500 }}>{nm}</div>
            <div style={{ ...T.micro, fontSize: 10, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role}</div>
          </div>
          {named && a.model && <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3, border: `1px solid ${ZT.line}`, borderRadius: 4, padding: '2px 6px' }}>{a.model}</span>}
        </div>
      );
    })}
  </div>
);

// ── Signál (hlášení / čeká na rozhodnutí / incident) ──────────────────────
const VcSignal = ({ sig, hue }) => {
  const [dec, setDec] = useStateD(null);
  const c = sig.kind === 'incident' ? ZT.bad : sig.kind === 'await' ? ZT.wait : ZT.ok;
  const head = sig.kind === 'incident' ? 'Incident · surface & wait' : sig.kind === 'await' ? 'Čeká na tvé rozhodnutí' : 'Hlášení čeká na přečtení';
  return (
    <div style={{ padding: 16, borderRadius: ZT.rPanel, background: `${c}0d`, border: `1px solid ${c}44` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <ZtDot state={sig.kind === 'report' ? 'ok' : sig.kind === 'await' ? 'wait' : 'bad'} size={7} />
        <span style={{ ...T.label, color: c }}>{head}</span>
        <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 10 }}>{sig.at}</span>
      </div>
      <div style={{ ...T.body, fontSize: 15, fontWeight: 600, color: ZT.ink }}>{sig.title}</div>
      <div style={{ ...T.bodySm, marginTop: 6, textWrap: 'pretty' }}>{sig.body}</div>
      {(sig.impact || sig.evidence) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 11 }}>
          {sig.impact && <span style={{ ...T.num, fontSize: 20, color: c }}>{sig.impact}</span>}
          <span style={{ ...T.micro, fontSize: 10.5 }}>{sig.impactNote || sig.evidence}</span>
        </div>
      )}
      {dec ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, padding: '9px 11px', borderRadius: ZT.rCtl, background: `${ZT.ok}10`, border: `1px solid ${ZT.ok}33` }}>
          <Icon name="check" size={14} style={{ color: ZT.ok }} />
          <span style={{ ...T.bodySm, color: ZT.ok }}>{dec}</span>
          <button onClick={() => setDec(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', ...T.micro, color: ZT.ink3 }}>vrátit</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          {sig.kind === 'report' && <>
            <ZtBtn variant="primary" size="sm" icon="check" color={hue} onClick={() => setDec('Označeno jako přečtené')}>Označit přečtené</ZtBtn>
            <ZtBtn variant="ghost" size="sm" icon="arrow" onClick={() => setDec('Otevřen nález')}>Otevřít nález</ZtBtn>
          </>}
          {sig.kind === 'await' && <>
            <ZtHold color={ZT.wait} label="Podržet pro sloučení" doneLabel="Sloučeno" onConfirm={() => setDec('Release r2026.6 sloučen do main')} />
            <ZtBtn variant="ghost" size="sm" icon="branch" onClick={() => setDec('Otevřen diff')}>Zobrazit diff</ZtBtn>
          </>}
          {sig.kind === 'incident' && <>
            <ZtBtn variant="primary" size="sm" icon="branch" color={hue} onClick={() => setDec('Předáno Forge k opravě CI')}>Předat Forge</ZtBtn>
            <ZtBtn variant="ghost" size="sm" icon="pulse" onClick={() => setDec('Otevřen běh CI')}>Zobrazit CI</ZtBtn>
          </>}
        </div>
      )}
    </div>
  );
};

// ── Lehké zakládání úlohy ──────────────────────────────────────────────────
const VcNewTask = ({ sys }) => {
  const [val, setVal] = useStateD('');
  const [cad, setCad] = useStateD('once');
  const [ack, setAck] = useStateD(null);
  const taRef = useRefD(null);
  const submit = () => {
    const t = val.trim(); if (!t) return;
    const owner = (typeof sys.crew[0] === 'string') ? sys.crew[0] : sys.crew[0].name;
    const cadLabel = VC_CADENCE.find((c) => c.id === cad).label.toLowerCase();
    const gate = sys.ruleIds && sys.ruleIds.length ? 'gate: čeká na tvé schválení' : 'Tier 2 — provedu a řeknu ti';
    setAck({ owner, pipeline: sys.pipelines[0], cad: cadLabel, gate, text: t });
    setVal('');
  };
  return (
    <div style={{ borderRadius: ZT.rPanel, background: ZT.surfaceHi, border: `1px solid ${sys.hue}33`, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <Icon name="spark" size={14} style={{ color: sys.hue }} />
        <span style={T.label}>Zadej {sys.name} novou práci</span>
        <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 10 }}>zbytek doplním sám</span>
      </div>
      <textarea ref={taRef} value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={`Řekni ${sys.name} přirozeně, co má dělat…`}
        style={{ width: '100%', minHeight: 62, resize: 'none', boxSizing: 'border-box', padding: '11px 13px',
          background: ZT.bg, border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, color: ZT.ink,
          fontFamily: ZT.sans, fontSize: 13.5, lineHeight: 1.5, outline: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ ...T.micro, fontSize: 10, marginRight: 2 }}>periodicita</span>
        {VC_CADENCE.map((c) => {
          const on = c.id === cad;
          return (
            <button key={c.id} onClick={() => setCad(c.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer',
              fontFamily: ZT.mono, fontSize: 11, borderRadius: 999,
              color: on ? ZT.bg : ZT.ink2, background: on ? sys.hue : 'transparent',
              border: `1px solid ${on ? sys.hue : ZT.line}`, transition: 'all .14s',
            }}><Icon name={c.icon} size={11} /> {c.label}</button>
          );
        })}
        <button onClick={submit} disabled={!val.trim()} style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
          fontFamily: ZT.mono, fontSize: 12, fontWeight: 600, borderRadius: ZT.rCtl, cursor: val.trim() ? 'pointer' : 'default',
          color: ZT.bg, background: sys.hue, border: '1px solid transparent', opacity: val.trim() ? 1 : 0.4,
        }}><Icon name="arrow" size={13} stroke={2} /> Založit</button>
      </div>
      {ack && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 13, padding: '12px 13px', borderRadius: ZT.rCtl, background: `${ZT.ok}0d`, border: `1px solid ${ZT.ok}33` }}>
          <Icon name="check" size={15} style={{ color: ZT.ok, marginTop: 2, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...T.bodySm, color: ZT.ink }}>Založeno · přiřadil jsem <b style={{ color: ZT.ink }}>{ack.owner}</b> v pipeline <span style={{ fontFamily: ZT.mono, color: sys.hue }}>{ack.pipeline}</span></div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 4 }}>{ack.cad} · {ack.gate}</div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 4, color: ZT.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{ack.text}"</div>
          </div>
          <button onClick={() => setAck(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 2, display: 'flex' }}><Icon name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
};

// malý blok sekce
const VcBlock = ({ title, right, children }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={T.label}>{title}</span>
      {right}
    </div>
    {children}
  </div>
);

const VcMuted = ({ children }) => (
  <div style={{ ...T.micro, fontSize: 11, padding: '10px 12px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px dashed ${ZT.line}` }}>{children}</div>
);

// ── Detail subsystému ──────────────────────────────────────────────────────
const VcSubsystemDetail = ({ sys, onClose, onOpenTask, orbMode }) => {
  const st = VC_STATE[sys.state] || VC_STATE.idle;
  const tasks = vcTasksFor(sys.id);
  const sig = VC_SIGNALS[sys.id];
  const extra = VC_DETAIL_EXTRA[sys.id] || { recent: [], artifacts: [] };
  const rules = (sys.ruleIds || []).map((id) => GLOBAL_RULES.find((r) => r.id === id)).filter(Boolean);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '26px 40px' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1020, maxHeight: '100%', display: 'flex', flexDirection: 'column',
        background: ZT.surface, border: `1px solid ${sys.hue}44`, borderRadius: ZT.rPanel, overflow: 'hidden',
        boxShadow: `0 0 0 1px ${sys.hue}18, 0 44px 110px rgba(0,0,0,0.66)`, animation: 'vcPop .34s ease both',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '19px 24px', borderBottom: `1px solid ${ZT.line}`, background: `linear-gradient(180deg, ${sys.hue}18, transparent)` }}>
          {orbMode ? (
            <div style={{ position: 'relative', width: 48, height: 48, flex: '0 0 auto' }}>
              <ZOrb3D diameter={44} hex={sys.hue} state={sys.state} detail={1} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Icon name={sys.glyph} size={19} stroke={1.6} style={{ color: '#eef3fb' }} />
              </div>
            </div>
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: `radial-gradient(circle at 36% 30%, ${sys.hue}f2, ${sys.hue} 46%, ${sys.hue}55)`,
              boxShadow: `0 6px 20px ${sys.hue}55, inset 0 2px 6px rgba(255,255,255,0.35)`, color: '#0b0e13' }}>
              <Icon name={sys.glyph} size={24} stroke={1.9} style={{ opacity: 0.85 }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ ...T.title, fontSize: 22 }}>{sys.name}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, border: `1px solid ${st.c}44`, background: `${st.c}12` }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, boxShadow: st.live ? `0 0 6px ${st.c}` : 'none' }} />
                <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: st.c }}>{st.label}</span>
              </span>
            </div>
            <div style={{ ...T.bodySm, fontSize: 12.5, marginTop: 3 }}><span style={{ color: ZT.ink2 }}>{sys.mandate}</span> · {sys.tagline}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 6, display: 'flex' }}
            title="Zpět na mapu"><Icon name="x" size={20} /></button>
        </div>

        {/* body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 1, background: ZT.line, overflow: 'auto' }}>
          {/* hlavní sloupec */}
          <div style={{ background: ZT.surface, padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {sig && <VcSignal sig={sig} hue={sys.hue} />}

            <VcBlock title="Co dělá" right={<span style={{ marginLeft: 'auto', ...T.micro, fontSize: 10 }}>{tasks.length ? tasks.length + ' aktivní' : 'v klidu'}</span>}>
              {tasks.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {tasks.map((t) => (
                    <div key={t.id} onClick={() => onOpenTask(t)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}>
                      <ZtDot state={t.continuous ? 'run' : 'run'} size={7} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, fontWeight: 500 }}>{t.title}</div>
                        <div style={{ ...T.micro, fontSize: 10, marginTop: 2 }}>{t.agent} · {t.phase} · {t.kind}</div>
                      </div>
                      {!t.continuous && <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.run, fontWeight: 600 }}>{t.pct}%</span>}
                      <Icon name="chevron" size={14} style={{ color: ZT.ink3 }} />
                    </div>
                  ))}
                </div>
              ) : <VcMuted>Právě nemá přiřazenou žádnou aktivní úlohu — poslední práci najdeš níže.</VcMuted>}
              {extra.recent.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ ...T.micro, fontSize: 10, marginBottom: 4 }}>NEDÁVNO</span>
                  {extra.recent.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px' }}>
                      <ZtDot state={r.state} size={6} />
                      <span style={{ ...T.bodySm, fontSize: 12, color: ZT.ink2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                      <span style={{ ...T.micro, fontSize: 10 }}>{r.note}</span>
                    </div>
                  ))}
                </div>
              )}
            </VcBlock>

            <VcNewTask sys={sys} />
          </div>

          {/* boční sloupec */}
          <div style={{ background: ZT.surface, padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <VcBlock title="Posádka" right={<span style={{ marginLeft: 'auto', fontFamily: ZT.mono, fontSize: 11, color: ZT.ink3 }}>{sys.crew.length}</span>}>
              <VcCrew crew={sys.crew} hue={sys.hue} />
            </VcBlock>

            <VcBlock title="Výstupy / artefakty">
              {extra.artifacts.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {extra.artifacts.map((o, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}` }}>
                      <Icon name={o.icon} size={14} style={{ color: sys.hue, flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: ZT.mono, fontSize: 11.5, color: ZT.ink }}>{o.label}</div>
                        <div style={{ ...T.micro, fontSize: 9.5, marginTop: 1 }}>{o.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <VcMuted>Zatím bez trvalých artefaktů — {sys.name} pracuje v reálném čase.</VcMuted>}
            </VcBlock>

            <VcBlock title="Pravidla / oprávnění">
              {rules.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rules.map((r) => (
                    <div key={r.id} style={{ padding: '9px 11px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="shield" size={12} style={{ color: r.decision === 'ask' ? ZT.wait : ZT.ink3, flex: '0 0 auto' }} />
                        <span style={{ ...T.bodySm, fontSize: 12, color: ZT.ink, fontWeight: 500 }}>{r.name}</span>
                      </div>
                      <div style={{ ...T.micro, fontSize: 10, marginTop: 4, paddingLeft: 20 }}>{r.decision === 'ask' ? 'vyžaduje tvůj souhlas' : 'jen zaloguje'}</div>
                    </div>
                  ))}
                </div>
              ) : <VcMuted>Běží v mezích globálních pravidel — žádná zvláštní omezení.</VcMuted>}
            </VcBlock>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { VcSubsystemDetail, VcCrew, VcSignal, VcNewTask, VC_DETAIL_EXTRA });

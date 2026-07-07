// ZIBBY velín — Běhy & aktivita: plný feed běhů + detail jednoho běhu.
// Živý log streaming · progress · stavy (running/await/done/error/interrupt) · zastavit · replay.
const { useState: useStateRn, useEffect: useEffectRn, useRef: useRefRn } = React;

const LOG_C = { sys: Z.inkFaint, info: Z.inkDim, ok: Z.ok, warn: Z.warn, err: Z.bad };

// ---- run state badge -----------------------------------------------------
const RunStateBadge = ({ state, big = false }) => {
  const s = RUN_STATE[state] || RUN_STATE.done;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 7 : 5, fontFamily: Z.mono,
      fontSize: big ? 11 : 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: big ? '4px 11px' : '2px 8px', borderRadius: 2, color: s.c,
      background: `${s.c}1a`, border: `1px solid ${s.c}55`, whiteSpace: 'nowrap',
    }} title={`stav: ${s.canon}`}>
      <span style={{ position: 'relative', width: big ? 7 : 6, height: big ? 7 : 6 }}>
        {s.pulse && <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: s.c, opacity: 0.35, animation: 'zpulse 1.8s ease-out infinite' }} />}
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: s.c }} />
      </span>
      {s.label}
    </span>
  );
};

// ---- run card (left list) ------------------------------------------------
const RunCard = ({ run, accent, selected, onSelect }) => {
  const [h, setH] = useStateRn(false);
  const s = RUN_STATE[run.state] || RUN_STATE.done;
  return (
    <div onClick={() => onSelect(run.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: selected ? Z.panelHi : Z.panel,
        border: `1px solid ${selected ? accent : (h ? accent + '55' : Z.line)}`, borderLeft: `3px solid ${s.c}`,
        borderRadius: 3, padding: '12px 13px', cursor: 'pointer', transition: 'all .14s',
        boxShadow: selected ? `0 0 0 1px ${accent}33` : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name={run.glyph} size={16} style={{ color: accent, flex: '0 0 auto' }} />
        <Mono style={{ fontSize: 12.5, fontWeight: 700, color: Z.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</Mono>
        <Mono style={{ fontSize: 8.5, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 4, padding: '1px 6px', flex: '0 0 auto' }}>{run.kind}</Mono>
      </div>
      <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.prompt}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <RunStateBadge state={run.state} />
        <Mono style={{ fontSize: 9, color: Z.inkFaint }}>{run.target} · {run.started}</Mono>
      </div>
    </div>
  );
};

// ---- live log stream -----------------------------------------------------
const LogStream = ({ run, accent }) => {
  const isLive = run.state === 'running';
  const [shown, setShown] = useStateRn(isLive ? 1 : run.log.length);
  const [extra, setExtra] = useStateRn([]);
  const [pct, setPct] = useStateRn(run.pct);
  const scrollRef = useRefRn(null);

  // reveal base log lines progressively (replay / live)
  useEffectRn(() => {
    setShown(isLive ? 1 : run.log.length);
    setExtra([]);
    setPct(run.pct);
  }, [run.id]);

  useEffectRn(() => {
    if (shown >= run.log.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 520);
    return () => clearTimeout(t);
  }, [shown, run.id, run.log.length]);

  // live tail: keep appending synthetic progress for running runs
  useEffectRn(() => {
    if (!isLive || shown < run.log.length) return;
    const ticks = [
      { level: 'info', text: 'pracuji… čtu kontext z disku' },
      { level: 'ok', text: 'dílčí krok hotov · zapsáno na disk' },
      { level: 'info', text: 'volám nástroj a ověřuji výstup' },
    ];
    const iv = setInterval(() => {
      setExtra((e) => [...e, { id: 'x' + e.length, t: '··:··', ...ticks[e.length % ticks.length] }]);
      setPct((p) => Math.min(p + 4, 96));
    }, 2600);
    return () => clearInterval(iv);
  }, [isLive, shown, run.id, run.log.length]);

  // autoscroll (no scrollIntoView)
  const lines = [...run.log.slice(0, shown), ...extra];
  useEffectRn(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [shown, extra.length]);

  return (
    <div style={{ border: `1px solid ${Z.line}`, borderRadius: 4, overflow: 'hidden', background: Z.bg0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${Z.line}`, background: Z.bg1 }}>
        <Icon name="pulse" size={13} style={{ color: isLive ? accent : Z.inkFaint }} />
        <Mono style={{ fontSize: 10, color: Z.inkDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{isLive ? 'živý log' : 'log běhu'}</Mono>
        <Mono style={{ fontSize: 9, color: Z.inkFaint, marginLeft: 'auto' }}>{lines.length} řádků</Mono>
      </div>
      <div ref={scrollRef} style={{ maxHeight: 320, overflow: 'auto', padding: '12px 13px', fontFamily: Z.mono, fontSize: 12, lineHeight: 1.75 }}>
        {lines.map((l, i) => (
          <div key={l.id != null ? l.id + '-' + i : i} style={{ display: 'flex', gap: 11 }}>
            <span style={{ color: Z.inkFaint, flex: '0 0 auto', opacity: 0.7 }}>{l.t}</span>
            <span style={{ color: (LOG_C[l.level] || Z.inkDim), flex: '0 0 auto', width: 34, textTransform: 'uppercase', fontSize: 9.5, paddingTop: 2 }}>{l.level}</span>
            <span style={{ color: l.level === 'sys' ? Z.inkFaint : Z.ink, minWidth: 0 }}>{l.text}</span>
          </div>
        ))}
        {isLive && (
          <div style={{ display: 'flex', gap: 11, marginTop: 2 }}>
            <span style={{ color: Z.inkFaint, flex: '0 0 auto', opacity: 0.7 }}>··:··</span>
            <span style={{ width: 34, flex: '0 0 auto' }} />
            <span style={{ color: accent }}>▍</span>
          </div>
        )}
      </div>

    </div>
  );
};

// ---- run detail ----------------------------------------------------------
const RunDetail = ({ run, accent }) => {
  const s = RUN_STATE[run.state] || RUN_STATE.done;
  const [replayKey, setReplayKey] = useStateRn(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* header */}
      <HudPanel accent={s.c} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 3, display: 'grid', placeItems: 'center', background: `${accent}14`, color: accent, border: `1px solid ${accent}40` }}>
              <Icon name={run.glyph} size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{run.name}</div>
                <RunStateBadge big state={run.state} />
              </div>
              <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 6, lineHeight: 1.4 }}>{run.prompt}</div>
              <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginTop: 6 }}>{run.id} · {run.kind}{run.agent ? ' · agent ' + run.agent : ''}{run.phase ? ' · ' + run.phase : ''} · stav <span style={{ color: s.c }}>{s.canon}</span></Mono>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {run.state === 'running' && <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 600, padding: '9px 14px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}66` }}><Icon name="stop" size={13} /> Zastavit běh</button>}
            {run.state === 'await' && run.approvalId && <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 700, padding: '9px 14px', cursor: 'pointer', borderRadius: 2, color: Z.bg0, background: Z.warn, border: 'none', boxShadow: `0 0 14px ${Z.warn}55` }}><Icon name="shield" size={13} /> Rozhodnout</button>}
            {(run.state === 'done' || run.state === 'error' || run.state === 'interrupt') && <GhostBtn accent={accent} icon="retry" onClick={() => setReplayKey((k) => k + 1)}>Replay logu</GhostBtn>}
          </div>
        </div>

        {/* meta strip */}
        <div style={{ display: 'flex', gap: 0, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Z.line}`, flexWrap: 'wrap' }}>
          {[
            ['projekt', run.target, accent], ['spuštěno', run.started, Z.ink],
            ['trvání', run.elapsed, Z.ink], ['cena', run.cost, Z.ok],
          ].map(([k, v, c], i) => (
            <div key={i} style={{ paddingRight: 28, marginRight: 28, borderRight: i < 3 ? `1px solid ${Z.line}` : 'none' }}>
              <Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block' }}>{k}</Mono>
              <Mono style={{ fontSize: 14, fontWeight: 700, color: c, display: 'block', marginTop: 3 }}>{v}</Mono>
            </div>
          ))}
        </div>
      </HudPanel>

      {/* await banner */}
      {run.state === 'await' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', background: `${Z.warn}10`, border: `1px solid ${Z.warn}44`, borderRadius: 3 }}>
          <Icon name="wait" size={18} style={{ color: Z.warn }} />
          <div style={{ flex: 1 }}>
            <Mono style={{ fontSize: 11.5, color: Z.warn, fontWeight: 600 }}>Běh je zaparkovaný — čeká na tvé schválení</Mono>
            <Mono style={{ fontSize: 10.5, color: Z.inkDim, display: 'block', marginTop: 3 }}>{run.approvalId ? 'riziková akce ve frontě schválení' : 'výsledek čeká na ranní review'}</Mono>
          </div>
        </div>
      )}
      {run.state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', background: `${Z.bad}10`, border: `1px solid ${Z.bad}44`, borderRadius: 3 }}>
          <Icon name="warn" size={18} style={{ color: Z.bad }} />
          <Mono style={{ fontSize: 11.5, color: Z.bad, fontWeight: 600 }}>Běh skončil chybou — žádná data nebyla změněna</Mono>
        </div>
      )}

      {/* log */}
      <HudPanel accent={accent} pad={16} title="výstup běhu">
        <LogStream accent={accent} key={run.id + '-' + replayKey} run={run} />
      </HudPanel>
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const FILTERS = [
  { id: 'all', label: 'Vše' }, { id: 'running', label: 'Běží' }, { id: 'await', label: 'Čeká' },
  { id: 'done', label: 'Hotovo' }, { id: 'error', label: 'Chyba' }, { id: 'interrupt', label: 'Přerušeno' },
];

const RunsBody = ({ accent }) => {
  const [filter, setFilter] = useStateRn('all');
  const list = filter === 'all' ? RUNS : RUNS.filter((r) => r.state === filter);
  const [selId, setSelId] = useStateRn(RUNS[0] ? RUNS[0].id : null);
  const sel = RUNS.find((r) => r.id === selId) || (list[0] || null);
  const counts = RUNS.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {});

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Běhy &amp; aktivita</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              <span style={{ color: RUN_STATE.running.c }}>{counts.running || 0} běží</span> · <span style={{ color: Z.warn }}>{counts.await || 0} čeká</span> · {RUNS.length} celkem
            </Mono>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => {
              const on = filter === f.id;
              const n = f.id === 'all' ? RUNS.length : (counts[f.id] || 0);
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  fontFamily: Z.mono, fontSize: 11, fontWeight: 600, padding: '6px 12px', cursor: 'pointer', borderRadius: 2,
                  color: on ? Z.bg0 : Z.inkDim, background: on ? accent : 'transparent', border: `1px solid ${on ? accent : Z.line}`,
                }}>{f.label} <span style={{ opacity: 0.7 }}>{n}</span></button>
              );
            })}
          </div>
        </div>
      </HudPanel>

      <div style={{ display: 'grid', gridTemplateColumns: '330px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* left: feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length > 0 ? list.map((r) => <RunCard accent={accent} key={r.id} onSelect={setSelId} run={r} selected={sel && r.id === sel.id} />)
            : <div style={{ padding: '24px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}><Mono style={{ fontSize: 11, color: Z.inkFaint }}>Žádné běhy v tomto stavu.</Mono></div>}
        </div>

        {/* right: detail */}
        {sel ? <RunDetail accent={accent} key={sel.id} run={sel} /> : (
          <HudPanel accent={accent} pad={50}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
              <Icon name="pulse" size={26} style={{ color: Z.inkFaint }} />
              <Mono style={{ fontSize: 12, color: Z.inkDim }}>Vyber běh vlevo pro detail a živý log.</Mono>
            </div>
          </HudPanel>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { RunsBody, RunStateBadge, LogStream, RunDetail });

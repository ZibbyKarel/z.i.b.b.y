// ZIBBY velín — Task detail: polymorphic by executor (agent log / pipeline timeline)
// + ClassificationMoment (approval-shaped routing disclosure)
const { useState: useStateTD, useEffect: useEffectTD } = React;

// ── Task status badge ────────────────────────────────────────────────────
const TaskStatusBadge = ({ status, big = false }) => {
  const s = TASK_STATE[status] || TASK_STATE.queued;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 7 : 5,
      fontFamily: Z.mono, fontSize: big ? 11 : 9.5, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: big ? '4px 11px' : '2px 8px', borderRadius: 2,
      color: s.c, background: `${s.c}1a`, border: `1px solid ${s.c}55`, whiteSpace: 'nowrap',
    }}>
      <span style={{ position: 'relative', width: big ? 7 : 6, height: big ? 7 : 6, flexShrink: 0 }}>
        {s.pulse && <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: s.c, opacity: 0.35, animation: 'zpulse 1.8s ease-out infinite' }} />}
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: s.c }} />
      </span>
      {s.label}
    </span>
  );
};

// ── Stage status metadata ────────────────────────────────────────────────
const SS = {
  done:    { c: '#39d98a', label: 'hotovo',       dotFull: true  },
  running: { c: '#5b8def', label: 'běží',          dotFull: true, pulse: true },
  parked:  { c: '#f0b429', label: 'ke review',     dotFull: true  },
  failed:  { c: '#ff6b6b', label: 'selhalo',       dotFull: true  },
  waiting: { c: '#5d6b7a', label: 'čeká',          dotFull: false },
};

// ── Stage retry attempts ──────────────────────────────────────────────────
const RetryBlock = ({ loop }) => (
  <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: `2px solid rgba(255,107,107,0.28)` }}>
    {loop.attempts.map((att, j) => (
      <div key={j} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 0',
        borderBottom: j < loop.attempts.length - 1 ? `1px solid ${Z.line}` : 'none',
      }}>
        <Icon name="retry" size={10} style={{ color: Z.bad, flexShrink: 0 }} />
        <Mono style={{ fontSize: 9.5, color: Z.inkDim, flexShrink: 0 }}>pokus {att.num}/{loop.maxRetries}</Mono>
        <Icon name="arrow" size={10} style={{ color: Z.inkFaint, flexShrink: 0 }} />
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, flexShrink: 0 }}>{loop.loopTo}</Mono>
        <span style={{ flex: 1 }} />
        <Mono style={{ fontSize: 9, color: Z.bad, textAlign: 'right' }}>{att.note}</Mono>
      </div>
    ))}
    {loop.escalated && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 8, marginTop: 4 }}>
        <Icon name="warn" size={11} style={{ color: Z.warn, flexShrink: 0 }} />
        <Mono style={{ fontSize: 10, color: Z.warn, fontWeight: 600 }}>
          vyčerpány pokusy → eskalace → zaparkováno k ranní review
        </Mono>
      </div>
    )}
  </div>
);

// ── Pipeline stage timeline (vertical) ───────────────────────────────────
const PipelineTimeline = ({ stages, accent }) => {
  const [expanded, setExpanded] = useStateTD(new Set());
  const toggle = (idx) => setExpanded(s => {
    const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n;
  });

  return (
    <div>
      {stages.map((stage, i) => {
        const ss = SS[stage.status] || SS.waiting;
        const isLast = i === stages.length - 1;
        const isOpen = expanded.has(i);
        const hasLog = !!stage.log && stage.log.length > 0;

        return (
          <div key={i} style={{ display: 'flex', gap: 0 }}>
            {/* Left rail */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 30, marginRight: 14 }}>
              {/* Node */}
              <div style={{ position: 'relative', width: 14, height: 14, flexShrink: 0 }}>
                {ss.pulse && (
                  <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: ss.c, opacity: 0.25, animation: 'zpulse 1.8s ease-out infinite' }} />
                )}
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: ss.dotFull ? ss.c : 'transparent',
                  border: ss.dotFull ? 'none' : `2px solid ${ss.c}`,
                  boxShadow: ss.pulse ? `0 0 10px ${ss.c}88` : 'none',
                }} />
              </div>
              {/* Connector */}
              {!isLast && (
                <div style={{
                  width: 1.5, flex: 1, minHeight: 16, marginTop: 3,
                  background: stage.status === 'done' ? `${Z.ok}44` : Z.line,
                }} />
              )}
            </div>

            {/* Stage content */}
            <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 24 }}>
              {/* Header */}
              <div
                onClick={() => hasLog && toggle(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: hasLog ? 'pointer' : 'default', userSelect: 'none' }}
              >
                <Avatar accent={ss.c} glyph={stage.agentGlyph} radius={2} size={22} src={agentByName(stage.agentName).avatar} style={{ boxShadow: stage.status === 'running' ? `0 0 0 1px ${ss.c}` : 'none' }} />
                <Mono style={{ fontSize: 13, fontWeight: 600, color: Z.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stage.agentName}
                </Mono>
                {/* Status chip */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 2, color: ss.c, background: `${ss.c}1a`, border: `1px solid ${ss.c}55`, flexShrink: 0 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: ss.c, flexShrink: 0 }} />
                  {ss.label}
                </span>
                {stage.elapsed && <Mono style={{ fontSize: 10, color: Z.inkFaint, flexShrink: 0 }}>{stage.elapsed}</Mono>}
                {stage.cost > 0 && <Mono style={{ fontSize: 10, color: Z.inkDim, flexShrink: 0 }}>${stage.cost.toFixed(2)}</Mono>}
                {hasLog && (
                  <Icon name="chevron" size={12} style={{ color: Z.inkFaint, flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                )}
              </div>

              {/* Output */}
              {stage.output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Icon name="file" size={11} style={{ color: Z.ok, flexShrink: 0 }} />
                  <Mono style={{ fontSize: 10, color: Z.ok }}>{stage.output}</Mono>
                </div>
              )}

              {/* Waiting placeholder */}
              {stage.status === 'waiting' && (
                <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginTop: 4 }}>
                  čeká na dokončení předchozích fází
                </Mono>
              )}

              {/* Retry loop */}
              {stage.retryLoop && <RetryBlock loop={stage.retryLoop} />}

              {/* Expandable log */}
              {isOpen && hasLog && (
                <div style={{ marginTop: 10 }}>
                  <LogStream
                    accent={ss.c}
                    run={{ id: 'stage-' + i, state: stage.status === 'running' ? 'running' : 'done', pct: stage.status === 'running' ? 60 : 100, log: stage.log }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Classification moment (approval-shaped routing disclosure) ─────────────
const ClassificationMoment = ({ task, accent, onConfirm, onOverride }) => {
  const [overrideOpen, setOverrideOpen] = useStateTD(false);
  const [confirmed, setConfirmed] = useStateTD(false);
  const cl = task.classification;
  const pct = Math.round(cl.confidence * 100);
  const confC = cl.confidence >= 0.85 ? Z.ok : cl.confidence >= 0.65 ? Z.warn : Z.bad;

  // find pipeline definition for phase preview
  const pipeline = cl.executorKind === 'pipeline'
    ? (typeof PIPELINES !== 'undefined' ? PIPELINES.find(p => p.id === cl.executorId) : null)
    : null;

  if (confirmed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: `${Z.ok}0d`, border: `1px solid ${Z.ok}44`, borderRadius: 3 }}>
        <Icon name="ok" size={18} style={{ color: Z.ok }} />
        <Mono style={{ fontSize: 12, color: Z.ok, fontWeight: 600 }}>
          Potvrzen executor {cl.executorName} — task spuštěn na pozadí
        </Mono>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${Z.warn}55`, borderRadius: 3, overflow: 'visible', background: `${Z.warn}06`, boxShadow: `0 0 0 1px ${Z.warn}18, 0 0 32px ${Z.warn}0a` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${Z.warn}2a` }}>
        <ZibbyMark color={Z.warn} size={16} />
        <Mono style={{ fontSize: 10.5, color: Z.warn, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', flex: 1 }}>
          ZIBBY routed this task
        </Mono>
        <Dot pulse color={Z.warn} size={7} />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 18px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Executor */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Mono style={{ fontSize: 8, color: Z.inkFaint, letterSpacing: '0.18em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            {cl.executorKind === 'pipeline' ? 'pipeline' : 'agent'}
          </Mono>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${accent}18`, color: accent, border: `1px solid ${accent}44` }}>
              <Icon name={cl.executorKind === 'pipeline' ? 'flow' : 'bot'} size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Mono style={{ fontSize: 15, fontWeight: 700, color: Z.ink, display: 'block' }}>{cl.executorName}</Mono>
              {/* Phase chain preview */}
              {pipeline && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {pipeline.phases.map((ph, i) => (
                    <React.Fragment key={i}>
                      <Mono style={{ fontSize: 9.5, color: Z.inkDim }}>{ph.agent}</Mono>
                      {ph.loop && <Icon name="retry" size={9} style={{ color: Z.bad }} />}
                      {i < pipeline.phases.length - 1 && (
                        <Icon name="arrow" size={9} style={{ color: Z.inkFaint }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Confidence meter */}
        <div style={{ flex: '0 0 130px' }}>
          <Mono style={{ fontSize: 8, color: Z.inkFaint, letterSpacing: '0.18em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>spolehlivost</Mono>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <Mono style={{ fontSize: 26, fontWeight: 700, color: confC, lineHeight: 1 }}>{pct}</Mono>
            <Mono style={{ fontSize: 12, color: Z.inkFaint }}>%</Mono>
          </div>
          <div style={{ marginTop: 8 }}><Bar glow color={confC} h={4} pct={pct} /></div>
        </div>

        {/* Budget */}
        {pipeline && (
          <div style={{ flex: '0 0 80px' }}>
            <Mono style={{ fontSize: 8, color: Z.inkFaint, letterSpacing: '0.18em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>strop</Mono>
            <Mono style={{ fontSize: 22, fontWeight: 700, color: Z.inkDim, lineHeight: 1 }}>${pipeline.budget}</Mono>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: `1px solid ${Z.warn}22` }}>
        {/* Override dropdown */}
        <div style={{ position: 'relative' }}>
          <GhostBtn icon="bolt" onClick={() => setOverrideOpen(o => !o)}>
            Jiný executor {overrideOpen ? '▲' : '▾'}
          </GhostBtn>
          {overrideOpen && (
            <React.Fragment>
              <div onClick={() => setOverrideOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 50,
                background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 3,
                padding: 6, minWidth: 260, boxShadow: '0 -12px 36px rgba(0,0,0,0.5)',
              }}>
                {(cl.alternatives || []).map((alt, i) => (
                  <button key={i}
                    onClick={() => { onOverride(alt); setOverrideOpen(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = Z.bg0}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', cursor: 'pointer', background: 'transparent', border: 'none', borderRadius: 2, color: Z.ink, textAlign: 'left' }}
                  >
                    <Icon name={alt.executorKind === 'pipeline' ? 'flow' : 'bot'} size={13} style={{ color: accent, flexShrink: 0 }} />
                    <Mono style={{ fontSize: 12, flex: 1 }}>{alt.executorName}</Mono>
                    <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{Math.round(alt.confidence * 100)}%</Mono>
                  </button>
                ))}
                {(!cl.alternatives || cl.alternatives.length === 0) && (
                  <Mono style={{ fontSize: 11, color: Z.inkFaint, padding: '8px 10px', display: 'block' }}>žádné alternativy</Mono>
                )}
              </div>
            </React.Fragment>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { setConfirmed(true); onConfirm(); }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 32px ${Z.ok}66`}
          onMouseLeave={e => e.currentTarget.style.boxShadow = `0 0 20px ${Z.ok}44`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            fontFamily: Z.mono, fontSize: 13, fontWeight: 700,
            padding: '10px 22px', cursor: 'pointer', borderRadius: 2,
            color: Z.bg0, background: Z.ok, border: 'none',
            boxShadow: `0 0 20px ${Z.ok}44`,
            transition: 'box-shadow .16s',
          }}
        >
          <Icon name="play" size={14} stroke={2} /> Potvrdit a spustit
        </button>
      </div>
    </div>
  );
};

// ── Full task detail (polymorphic) ────────────────────────────────────────
const TaskDetail = ({ task, accent, onConfirm, onOverride }) => {
  const ts = TASK_STATE[task.status] || TASK_STATE.queued;
  const cl = task.classification;
  const showClassification = task.status === 'classified' && cl && !cl.confirmedAt;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Task header ── */}
      <HudPanel accent={ts.c} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 11 }}>
              <TaskStatusBadge big status={task.status} />
              {cl && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 9.5, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 2, padding: '2px 8px', flexShrink: 0 }}>
                  <Icon name={cl.executorKind === 'pipeline' ? 'flow' : 'bot'} size={10} style={{ flexShrink: 0 }} />
                  {cl.executorKind === 'pipeline' ? 'pipeline' : 'agent'}: {cl.executorName}
                </span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em', color: Z.ink }}>
              {task.description}
            </div>
            <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 9 }}>
              {task.id} · vytvořen {task.createdAt}
              {cl && cl.confirmedAt && <> · potvrzen {cl.confirmedAt}</>}
            </Mono>
          </div>
          {task.status === 'running' && (
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 11, fontWeight: 600, padding: '7px 13px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55`, flexShrink: 0 }}>
              <Icon name="stop" size={12} /> Zastavit
            </button>
          )}
        </div>

        {/* Meta strip for running/done pipeline */}
        {task.pipelineRun && (task.status === 'running' || task.status === 'done' || task.status === 'parked') && (
          <div style={{ display: 'flex', gap: 0, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Z.line}`, flexWrap: 'wrap' }}>
            {[
              ['cena',   `$${task.pipelineRun.totalCost.toFixed(2)} / $${task.pipelineRun.budget}`, accent],
              ['trvání', task.pipelineRun.elapsed, Z.ink],
              ['fáze',   `${task.pipelineRun.stages.filter(s => s.status === 'done').length} / ${task.pipelineRun.stages.length} hotovo`, Z.ink],
            ].map(([k, v, c], i, arr) => (
              <div key={i} style={{ paddingRight: 24, marginRight: 24, borderRight: i < arr.length - 1 ? `1px solid ${Z.line}` : 'none' }}>
                <Mono style={{ fontSize: 8, color: Z.inkFaint, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block' }}>{k}</Mono>
                <Mono style={{ fontSize: 14, fontWeight: 700, color: c, display: 'block', marginTop: 4 }}>{v}</Mono>
              </div>
            ))}
          </div>
        )}
      </HudPanel>

      {/* ── Classification moment ── */}
      {showClassification && (
        <ClassificationMoment accent={accent} onConfirm={onConfirm} onOverride={onOverride} task={task} />
      )}

      {/* ── Parked banner ── */}
      {task.status === 'parked' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: `${Z.warn}0d`, border: `1px solid ${Z.warn}44`, borderRadius: 3 }}>
          <Icon name="pause" size={18} style={{ color: Z.warn, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Mono style={{ fontSize: 12, color: Z.warn, fontWeight: 600, display: 'block' }}>Task je zaparkovaný — potřebuje tvou pozornost</Mono>
            <Mono style={{ fontSize: 10.5, color: Z.inkDim, display: 'block', marginTop: 3 }}>pipeline narazila na problém, který neumí sama vyřešit</Mono>
          </div>
          <GhostBtn accent={Z.warn} icon="shield">Otevřít review</GhostBtn>
        </div>
      )}

      {/* ── Failed banner ── */}
      {task.status === 'failed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: `${Z.bad}0d`, border: `1px solid ${Z.bad}44`, borderRadius: 3 }}>
          <Icon name="warn" size={18} style={{ color: Z.bad, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Mono style={{ fontSize: 12, color: Z.bad, fontWeight: 600, display: 'block' }}>Task selhal — žádná data nebyla změněna</Mono>
          </div>
          <GhostBtn accent={accent} icon="retry">Zkusit znovu</GhostBtn>
        </div>
      )}

      {/* ── Pipeline stage timeline ── */}
      {task.pipelineRun && (
        <HudPanel accent={accent} pad={20} title="fáze pipeline">
          <PipelineTimeline accent={accent} stages={task.pipelineRun.stages} />
        </HudPanel>
      )}

      {/* ── Agent log ── */}
      {task.agentRun && (
        <HudPanel accent={accent} pad={18} title="výstup agenta">
          <LogStream
            accent={accent}
            run={{ id: task.id, state: task.agentRun.state, pct: task.agentRun.pct, log: task.agentRun.log }}
          />
        </HudPanel>
      )}

      {/* ── Empty states ── */}
      {task.status === 'queued' && (
        <HudPanel accent={Z.inkFaint} pad={44}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <Icon name="clock" size={26} style={{ color: Z.inkFaint }} />
            <Mono style={{ fontSize: 12, color: Z.inkDim }}>Ve frontě — ZIBBY ho za chvíli klasifikuje automaticky</Mono>
          </div>
        </HudPanel>
      )}
      {task.status === 'classifying' && (
        <HudPanel accent={accent} pad={44}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <Dot pulse color={accent} size={18} />
            <Mono style={{ fontSize: 12, color: Z.inkDim }}>ZIBBY analyzuje zadání a vybírá nejvhodnější executor…</Mono>
          </div>
        </HudPanel>
      )}
    </div>
  );
};

Object.assign(window, { TaskStatusBadge, TaskDetail, PipelineTimeline, ClassificationMoment, SS });

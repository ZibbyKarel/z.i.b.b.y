// ZIBBY velín — Tasks screen: unified task list + inline detail
const { useState: useStateTasks } = React;

// ── Filter definitions ───────────────────────────────────────────────────
const TASK_FILTERS = [
  { id: 'all',         label: 'Vše'           },
  { id: 'classified',  label: 'Ke schválení'  },
  { id: 'running',     label: 'Běží'          },
  { id: 'parked',      label: 'Ke review'     },
  { id: 'done',        label: 'Hotovo'        },
  { id: 'failed',      label: 'Selhalo'       },
  { id: 'classifying', label: 'Klasifikuji'   },
  { id: 'queued',      label: 'Ve frontě'     },
];

// ── Task list card ────────────────────────────────────────────────────────
const TaskCard = ({ task, selected, onSelect, accent }) => {
  const [h, setH] = useStateTasks(false);
  const ts = TASK_STATE[task.status] || TASK_STATE.queued;
  const cl = task.classification;
  const isPendingClassify = task.status === 'classified' && cl && !cl.confirmedAt;


  return (
    <div
      onClick={() => onSelect(task.id)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', cursor: 'pointer',
        background: selected ? Z.panelHi : (isPendingClassify ? `${Z.warn}07` : Z.panel),
        border: `1px solid ${selected ? accent : (isPendingClassify ? `${Z.warn}44` : (h ? `${accent}44` : Z.line))}`,
        borderRadius: 3, padding: '12px 14px',
        transition: 'all .14s',
        boxShadow: selected ? `0 0 0 1px ${accent}22` : 'none',
      }}
    >
      {/* Description */}
      <div style={{
        fontSize: 12.5, color: Z.ink, lineHeight: 1.4, marginBottom: 9,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {task.description}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <TaskStatusBadge status={task.status} />
        {cl && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 9, color: Z.inkFaint, border: `1px solid ${Z.line}`, borderRadius: 2, padding: '1px 6px', flexShrink: 0 }}>
            <Icon name={cl.executorKind === 'pipeline' ? 'flow' : 'bot'} size={9} />
            {cl.executorName}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, flexShrink: 0 }}>{task.createdAt}</Mono>
      </div>

      {/* Pending-classification highlight */}
      {isPendingClassify && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, padding: '6px 9px', background: `${Z.warn}12`, border: `1px solid ${Z.warn}28`, borderRadius: 2 }}>
          <ZibbyMark size={11} color={Z.warn} />
          <Mono style={{ fontSize: 9.5, color: Z.warn }}>
            {cl.executorName} · {Math.round(cl.confidence * 100)}% · čeká na potvrzení
          </Mono>
        </div>
      )}
    </div>
  );
};

// ── Main Tasks body ───────────────────────────────────────────────────────
const TasksBody = ({ accent, tasks: tasksProp, setTasks: setTasksProp, selId: selIdProp, setSelId: setSelIdProp }) => {
  const [tasksLocal, setTasksLocal] = useStateTasks(TASKS_DATA);
  const tasks = tasksProp || tasksLocal;
  const setTasks = setTasksProp || setTasksLocal;
  const [filter, setFilter] = useStateTasks('all');
  // Default to the first 'classified' task so the classification moment is visible
  const defaultSel = (tasks.find(t => t.status === 'classified') || tasks[0] || {}).id;
  const [selLocal, setSelLocal] = useStateTasks(defaultSel);
  const setSelId = setSelIdProp || setSelLocal;
  const selId = (selIdProp != null) ? selIdProp : selLocal;

  const counts = tasks.reduce((m, t) => { m[t.status] = (m[t.status] || 0) + 1; return m; }, {});
  // Sort urgent tasks to top: classified (pending confirm) → parked → running → rest
  const PRIORITY = { classified: 0, parked: 1, running: 2, classifying: 3, queued: 4, done: 5, failed: 6 };
  const sorted = [...tasks].sort((a, b) => (PRIORITY[a.status] ?? 9) - (PRIORITY[b.status] ?? 9));
  const filtered = filter === 'all' ? sorted : sorted.filter(t => t.status === filter);
  const sel = tasks.find(t => t.id === selId) || filtered[0] || null;

  // Confirmation: advance 'classified' → 'running' (simulated)
  const handleConfirm = () => {
    setTasks(ts => ts.map(t =>
      t.id === sel?.id
        ? { ...t, status: 'running', classification: { ...t.classification, confirmedAt: 'právě teď' } }
        : t
    ));
  };

  // Override: swap executor in classification
  const handleOverride = (alt) => {
    setTasks(ts => ts.map(t =>
      t.id === sel?.id
        ? { ...t, classification: { ...t.classification, executorKind: alt.executorKind, executorId: alt.executorId, executorName: alt.executorName, confidence: alt.confidence } }
        : t
    ));
  };

  // Visible filter tabs — show 'all' always + tabs that have items
  const visibleFilters = TASK_FILTERS.filter(f => f.id === 'all' || (counts[f.id] || 0) > 0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ── */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Tasky</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {(counts.running || 0) > 0 && <><span style={{ color: Z.work }}>{counts.running} běží</span> · </>}
              {(counts.classified || 0) > 0 && <><span style={{ color: Z.warn }}>{counts.classified} ke schválení</span> · </>}
              {(counts.parked || 0) > 0 && <><span style={{ color: Z.warn }}>{counts.parked} ke review</span> · </>}
              {tasks.length} celkem
            </Mono>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {visibleFilters.map(f => {
              const on = filter === f.id;
              const n = f.id === 'all' ? tasks.length : (counts[f.id] || 0);
              const alertF = (f.id === 'classified' || f.id === 'parked') && n > 0;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  fontFamily: Z.mono, fontSize: 11, fontWeight: 600, padding: '6px 12px',
                  cursor: 'pointer', borderRadius: 2,
                  color: on ? Z.bg0 : (alertF && !on ? Z.warn : Z.inkDim),
                  background: on ? accent : 'transparent',
                  border: `1px solid ${on ? accent : (alertF && !on ? `${Z.warn}55` : Z.line)}`,
                }}>
                  {f.label} <span style={{ opacity: 0.75 }}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </HudPanel>

      {/* ── Split: list + detail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* Left: task list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filtered.length > 0
            ? filtered.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  accent={accent}
                  selected={sel && t.id === sel.id}
                  onSelect={setSelId}
                />
              ))
            : (
              <div style={{ padding: '28px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}>
                <Mono style={{ fontSize: 11.5, color: Z.inkFaint }}>Žádné tasky v tomto stavu.</Mono>
              </div>
            )}
        </div>

        {/* Right: detail */}
        {sel
          ? (
            <TaskDetail
              key={sel.id}
              task={sel}
              accent={accent}
              onConfirm={handleConfirm}
              onOverride={handleOverride}
            />
          )
          : (
            <HudPanel accent={accent} pad={56}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                <Icon name="bolt" size={28} style={{ color: Z.inkFaint }} />
                <Mono style={{ fontSize: 12, color: Z.inkDim }}>Vyber task vlevo pro detail a živý log.</Mono>
              </div>
            </HudPanel>
          )}
      </div>
    </div>
  );
};

Object.assign(window, { TasksBody, TaskCard, TASK_FILTERS });

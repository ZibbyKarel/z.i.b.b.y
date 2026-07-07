// ZIBBY velín — New Task dialog + Categorization Queue widget
const { useState: useStateNT, useEffect: useEffectNT, useRef: useRefNT } = React;

// ── Path extraction + inline highlight ─────────────────────────────────
// Cesta se značí zavináčem (tak jak se předává do kontextu AI): @ + cesta
// např. @~/zibby/memory/holly.md, @/Users/zibby/notes, @./src/app.jsx
// Podporuje escapované mezery v shellu: @/Users/zibby/My\ Documents/file.md
const PATH_RE = /@(?:\\.|[\w.~\-/])+/g;
const extractPaths = (text) => {
  const ms = text.match(PATH_RE) || [];
  return [...new Set(ms)];
};

// Vrátí HTML string s obalenými cestami (pro backdrop highlight)
const highlightPaths = (text, accent) => {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(PATH_RE, (m) =>
    // Vypadá jako Tag z design systému (jako ToolChip): mono, accent pill + border, radius 2.
    // padding + záporný margin se ruší → nemění advance znaků, takže backdrop zůstává
    // zarovnaný s textarea (jinak by se text rozjel).
    `<mark style="background:${accent}1f;box-shadow:0 0 0 1px ${accent}55;color:${accent};border-radius:2px;padding:1px 5px;margin:0 -5px;font-style:normal;white-space:nowrap">${m}</mark>`
  );
};

// ── Mock kategorie (simuluje backend black magic) ────────────────────────
const TASK_CATS = [
  { id: 'dev',      label: 'Vývoj',           glyph: 'code',   color: '#5b8def' },
  { id: 'media',    label: 'Média',            glyph: 'film',   color: '#56c4d6' },
  { id: 'home',     label: 'Domácnost',        glyph: 'cart',   color: '#f0b429' },
  { id: 'infra',    label: 'Infrastruktura',   glyph: 'server', color: '#b07cff' },
  { id: 'docs',     label: 'Dokumentace',      glyph: 'doc',    color: '#9aa7b4' },
  { id: 'research', label: 'Výzkum',           glyph: 'search', color: '#7fd98a' },
];

// Relativní čas od timestamp
const elapsedLabel = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'právě teď';
  if (s < 60) return `před ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `před ${m}m`;
  return `před ${Math.floor(m / 60)}h`;
};

// ── New Task Dialog ──────────────────────────────────────────────────────
// Mock: čas resetu limitů z backendu (v produkci nahradí reálná API hodnota)
const fetchLimitResetTime = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0); // simulujeme: reset na celou příští hodinu
  return d;
};
const LIMIT_RESET_TIME = fetchLimitResetTime();
const p2 = (n) => String(n).padStart(2, '0');
const LIMIT_RESET_LABEL = `${p2(LIMIT_RESET_TIME.getHours())}:${p2(LIMIT_RESET_TIME.getMinutes())}`;

// Presety odloženého startu (offset v minutách; null = vlastní)
const SCHEDULE_PRESETS = [
  { id: 'now',    label: 'Hned',              off: 0      },
  { id: 'h1',     label: 'Za 1 h',            off: 60     },
  { id: 'h3',     label: 'Za 3 h',            off: 180    },
  { id: 'limit',  label: 'Po resetu limitů',  off: 'limit', sublabel: LIMIT_RESET_LABEL },
  { id: 'eve',    label: 'Dnes 20:00',        off: 'eve'  },
  { id: 'custom', label: 'Vlastní…',          off: null   },
];

// datetime-local hodnota pro <input> (lokální čas, bez sekund)
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Vyřeší zvolený preset/custom na timestamp (nebo null = hned)
const resolveSchedule = (sched, custom) => {
  if (sched === 'now') return null;
  if (sched === 'custom') return custom ? new Date(custom).getTime() : null;
  if (sched === 'limit') return LIMIT_RESET_TIME.getTime();
  const preset = SCHEDULE_PRESETS.find(p => p.id === sched);
  if (!preset) return null;
  if (preset.off === 'eve') {
    const d = new Date(); d.setHours(20, 0, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return Date.now() + preset.off * 60000;
};

// Lidský popis naplánovaného času
const scheduleLabel = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (sameDay) return `dnes ${time}`;
  const dd = `${p(d.getDate())}.${p(d.getMonth() + 1)}.`;
  return `${dd} ${time}`;
};

function NewTaskDialog({ accent, onClose, onSubmit }) {
  const [title, setTitle] = useStateNT('');
  const [text, setText] = useStateNT('');
  const taRef = useRefNT(null);
  const bdRef = useRefNT(null);
  const [sched, setSched] = useStateNT('now');
  const [custom, setCustom] = useStateNT('');
  const customPickerRef = useRefNT(null);
  const [sent, setSent] = useStateNT(false);
  const paths = extractPaths(text);
  const canSubmit = text.trim().length > 2 && (sched !== 'custom' || !!custom);
  const scheduledAt = resolveSchedule(sched, custom);

  // Otevře nativní datetime picker přímo
  const openCustomPicker = () => {
    if (!custom) setCustom(toLocalInput(new Date()));
    setTimeout(() => customPickerRef.current && customPickerRef.current.showPicker?.(), 10);
    setSched('custom');
  };

  // Esc zavře
  useEffectNT(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), text: text.trim(), paths, scheduledAt });
    setSent(true);
    setTimeout(onClose, 900);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5,7,10,0.80)', backdropFilter: 'blur(4px)',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 580, maxWidth: '100%',
          background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4,
          boxShadow: `0 0 0 1px ${accent}22, 0 32px 80px rgba(0,0,0,0.7)`,
          overflow: 'hidden',
        }}
      >
        {/* ── Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: `1px solid ${Z.line}`,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 2, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: accentDimOf(), color: accent, border: `1px solid ${accent}44`,
          }}>
            <Icon name="plus" size={18} stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <Mono style={{ fontSize: 13, fontWeight: 700, color: Z.ink, letterSpacing: '0.04em' }}>NOVÝ TASK</Mono>
            <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 2 }}>
              Popiš zadání — ZIBBY ho kategorizuje a zprocesuje
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <Mono style={{
              fontSize: 9.5, color: Z.inkFaint,
              padding: '2px 7px', border: `1px solid ${Z.line}`, borderRadius: 2,
            }}>Esc</Mono>
            <button
              onClick={onClose}
              onMouseEnter={e => e.currentTarget.style.color = Z.ink}
              onMouseLeave={e => e.currentTarget.style.color = Z.inkFaint}
              style={{
                background: 'transparent', border: 'none',
                color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 2,
              }}
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>

        {!sent ? (
          <div style={{ padding: 20 }}>
            {/* Název */}
            <div style={{ marginBottom: 14 }}>
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                Název <span style={{ color: Z.inkFaint, opacity: 0.6 }}>· volitelný</span>
              </Mono>
              <input
                onBlur={e => e.target.style.borderColor = Z.line}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={e => e.target.style.borderColor = `${accent}66`}
                placeholder="Krátký název tasku…"
                style={{
                  width: '100%', padding: '10px 13px',
                  background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3,
                  color: Z.ink, fontFamily: Z.sans, fontSize: 13.5, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s',
                }}
                value={title}
              />
            </div>

            {/* Zadání */}
            <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
              Zadání
            </Mono>
            {/* Textarea s inline path highlight (backdrop technika) */}
            <div style={{ position: 'relative', width: '100%' }}>
              {/* backdrop */}
              <div
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightPaths(text, accent) + '\u200b' }}
                ref={bdRef}
                style={{
                  position: 'absolute', inset: 0,
                  padding: '13px 15px',
                  fontFamily: Z.sans, fontSize: 14, lineHeight: 1.58,
                  boxSizing: 'border-box', borderRadius: 3,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'transparent',
                  background: 'transparent',
                  border: '1px solid transparent',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  zIndex: 0,
                }}
              />
              <textarea
                autoFocus
                onBlur={e => e.target.style.borderColor = Z.line}
                onChange={(e) => setText(e.target.value)}
                onFocus={e => e.target.style.borderColor = `${accent}66`}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
                onScroll={() => { if (bdRef.current && taRef.current) bdRef.current.scrollTop = taRef.current.scrollTop; }}
                placeholder={"Popiš task…\n\nNapř: Zkontroluj zálohy na Holly a výsledek ulož do @~/zibby/memory/holly-backup.md\n\nCestu označ zavináčem — @cesta se předá do kontextu."}
                ref={taRef}
                style={{
                  position: 'relative', zIndex: 1,
                  width: '100%', minHeight: 152, padding: '13px 15px',
                  resize: 'vertical', background: 'transparent',
                  border: `1px solid ${Z.line}`, borderRadius: 3,
                  color: Z.ink, caretColor: Z.ink,
                  fontFamily: Z.sans, fontSize: 14,
                  lineHeight: 1.58, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                value={text}
              />
            </div>

            {/* Odložený start */}
            <div style={{ marginTop: 16 }}>
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="clock" size={11} style={{ color: Z.inkFaint }} />
                Odložený start
              </Mono>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {SCHEDULE_PRESETS.map((p) => {
                  const on = sched === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => p.id === 'custom' ? openCustomPicker() : setSched(p.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', cursor: 'pointer',
                        background: on ? `${accent}18` : 'transparent',
                        border: `1px solid ${on ? accent : Z.line}`,
                        borderRadius: 2, color: on ? accent : Z.inkDim,
                        fontFamily: Z.mono, fontSize: 10.5, fontWeight: 600,
                        letterSpacing: '0.03em', transition: 'all .14s',
                      }}
                    >
                      {p.id === 'now' && <Dot color={on ? accent : Z.inkFaint} size={5} />}
                      {p.id === 'custom' && on && custom
                        ? (() => { const d = new Date(custom); return `${p2(d.getDate())}.${p2(d.getMonth()+1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; })()
                        : p.label}
                      {p.sublabel && (
                        <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 500, marginLeft: 2 }}>{p.sublabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Skrytý datetime picker pro Vlastní */}
              <input
                min={toLocalInput(new Date())}
                onChange={(e) => { setCustom(e.target.value); setSched('custom'); }}
                ref={customPickerRef}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                type="datetime-local"
                value={custom}
              />

              {scheduledAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
                  <Icon name="clock" size={11} style={{ color: accent }} />
                  <Mono style={{ fontSize: 10.5, color: accent }}>
                    Spustí se {scheduleLabel(scheduledAt)}
                  </Mono>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <Mono style={{ fontSize: 10, color: Z.inkFaint }}>⌘↩ odeslat</Mono>
              <div style={{ display: 'flex', gap: 8 }}>
                <GhostBtn onClick={onClose}>Zrušit</GhostBtn>
                <RunBtn
                  accent={canSubmit ? accent : Z.inkFaint}
                  icon="bolt"
                  label="Odeslat ke kategorizaci"
                  onClick={handleSubmit}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Potvrzení */
          <div style={{ padding: '34px 20px 30px', textAlign: 'center' }}>
            <div style={{
              width: 50, height: 50, margin: '0 auto', borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              color: accent, border: `1.5px solid ${accent}`,
              boxShadow: `0 0 24px ${accent}44`,
            }}>
              <Icon name="bolt" size={22} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 14 }}>Task přijat</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 5 }}>
              {scheduledAt
                ? `Naplánováno — spustí se ${scheduleLabel(scheduledAt)}`
                : 'Probíhá kategorizace na pozadí…'}
            </Mono>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New Task Button (TopBar) ─────────────────────────────────────────────
function NewTaskBtn({ onClick, accent, pendingCount = 0 }) {
  const [h, setH] = useStateNT(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 13px', cursor: 'pointer', position: 'relative',
        background: h ? `${accent}18` : 'transparent',
        border: `1px solid ${h ? accent : Z.line}`,
        borderRadius: 3, color: h ? accent : Z.inkDim,
        fontFamily: Z.mono, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.06em', transition: 'all .16s',
      }}
      title="Nový task (N)"
    >
      <Icon name="plus" size={13} stroke={2} />
      TASK
      {pendingCount > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          minWidth: 16, height: 16, borderRadius: 8,
          background: accent, color: Z.bg0,
          fontFamily: Z.mono, fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
          boxShadow: `0 0 8px ${accent}88`,
        }}>
          {pendingCount}
        </span>
      )}
    </button>
  );
}

// ── Categorization Queue Widget (TopBar dropdown) ─────────────────────────
const QSTATE = {
  categorizing: { c: '#5b8def', pulse: true,  label: 'kategorizuji…' },
  categorized:  { c: '#39d98a', pulse: false, label: 'hotovo'         },
  error:        { c: '#ff6b6b', pulse: false, label: 'chyba'          },
};

function CategorizationQueue({ accent, tasks, onClearDone }) {
  const [open, setOpen] = useStateNT(false);
  const pending = tasks.filter(t => t.state === 'categorizing').length;
  const hasDone = tasks.some(t => t.state !== 'categorizing');
  const dotColor = pending > 0 ? '#5b8def' : '#39d98a';

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 13px', cursor: 'pointer',
          background: Z.bg0, border: `1px solid ${open ? accent : Z.line}`,
          borderRadius: 3, transition: 'all .15s',
        }}
        title="Fronta kategorizace"
      >
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          fronta
        </Mono>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            ...(pending > 0 ? { animation: 'zpulse 1.4s ease-out infinite' } : {}),
          }} />
          <Mono style={{ fontSize: 11, color: Z.ink, fontWeight: 700 }}>{tasks.length}</Mono>
        </span>
        <Icon name="chevron" size={12} style={{
          color: Z.inkFaint,
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s',
        }} />
      </button>

      {open && (
        <React.Fragment>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />

          {/* Panel */}
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 390, zIndex: 50,
            background: Z.panelHi, border: `1px solid ${Z.lineHi}`,
            borderRadius: 3, padding: '14px 16px',
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
          }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Fronta kategorizace
              </Mono>
              {hasDone && (
                <button
                  onClick={() => { onClearDone(); setOpen(false); }}
                  onMouseEnter={e => { e.currentTarget.style.color = Z.inkDim; e.currentTarget.style.borderColor = Z.lineHi; }}
                  onMouseLeave={e => { e.currentTarget.style.color = Z.inkFaint; e.currentTarget.style.borderColor = Z.line; }}
                  style={{
                    fontFamily: Z.mono, fontSize: 9.5, color: Z.inkFaint, cursor: 'pointer',
                    background: 'transparent', border: `1px solid ${Z.line}`,
                    borderRadius: 2, padding: '2px 8px', transition: 'all .13s',
                  }}
                >
                  vymazat hotové
                </button>
              )}
            </div>

            {/* Task list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tasks.map((task) => {
                const qs = QSTATE[task.state] || QSTATE.categorizing;
                return (
                  <div key={task.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 11px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${Z.line}`, borderRadius: 3,
                  }}>
                    {/* Stav */}
                    <div style={{ paddingTop: 4, flexShrink: 0 }}>
                      <Dot color={qs.c} pulse={qs.pulse} size={7} />
                    </div>

                    {/* Text + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, color: Z.ink, lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {task.text}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>{elapsedLabel(task.ts)}</Mono>
                        {task.paths && task.paths.length > 0 && (
                          <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>
                            · {task.paths.length} {task.paths.length === 1 ? 'cesta' : 'cesty'}
                          </Mono>
                        )}
                        {task.category && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '1px 6px',
                            background: `${accent}14`, border: `1px solid ${accent}28`, borderRadius: 2,
                          }}>
                            <Icon name={task.category.glyph} size={9} style={{ color: accent }} />
                            <Mono style={{ fontSize: 9, color: accent }}>{task.category.label}</Mono>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stav label */}
                    <Mono style={{ fontSize: 9, color: qs.c, letterSpacing: '0.04em', flexShrink: 0, paddingTop: 3 }}>
                      {qs.label}
                    </Mono>
                  </div>
                );
              })}
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { NewTaskDialog, NewTaskBtn, CategorizationQueue, TASK_CATS, extractPaths, elapsedLabel });

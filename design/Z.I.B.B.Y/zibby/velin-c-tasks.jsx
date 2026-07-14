// ZIBBY Velín-C — běžící úlohy levitují vlevo jako karty; klik = plný detail.
const { useState: useStateT, useRef: useRefT0, useLayoutEffect: useLayoutEffectT0 } = React;

const VC_LOG_C = { info: ZT.ink2, run: ZT.run, warn: ZT.wait, ok: ZT.ok, err: ZT.bad };

// ── Levitující karta běžící úlohy ─────────────────────────────────────────
const VcTaskCard = ({ task, onOpen, index }) => {
  const [h, setH] = useStateT(false);
  const elRef = useRefT0(null);
  const sys = vcSys(task.sys);
  return (
    <div ref={elRef} onClick={() => onOpen(task, elRef.current ? elRef.current.getBoundingClientRect() : null)}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className="vc-anim"
      style={{
        position: 'relative', background: h ? ZT.surfaceHi : 'rgba(21,28,37,0.82)',
        border: `1px solid ${h ? sys.hue + '66' : ZT.line}`, borderRadius: ZT.rPanel, padding: 14,
        cursor: 'pointer', backdropFilter: 'blur(8px)', transition: 'transform .2s, border-color .2s, background .2s',
        boxShadow: h ? `0 16px 40px rgba(0,0,0,0.5)` : '0 8px 24px rgba(0,0,0,0.35)',
        transform: h ? 'translateX(4px)' : 'none',
        animation: `vcFloat ${(6 + index * 0.7).toFixed(1)}s ease-in-out -${(index * 1.3).toFixed(1)}s infinite`,
      }}>
      <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: sys.hue }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: sys.hue, flex: '0 0 auto' }} />
        <span style={{ fontFamily: ZT.mono, fontSize: 11, color: sys.hue, fontWeight: 600 }}>{sys.name}</span>
        <span style={{ ...T.micro, fontSize: 10 }}>{task.kind}</span>
        <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 10 }}>{task.started}</span>
      </div>
      <div style={{ ...T.body, fontSize: 13.5, fontWeight: 500, color: ZT.ink, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: task.continuous ? 0 : 10 }}>
        <Icon name={task.continuous ? 'pulse' : 'run'} size={12} style={{ color: task.continuous ? ZT.ok : ZT.run }} />
        <span style={{ ...T.micro, fontSize: 10.5 }}>{task.agent} · {task.phase}</span>
      </div>
      {!task.continuous && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ flex: 1 }}><ZtMeter pct={task.pct} color={ZT.run} h={4} /></div>
          <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.run, fontWeight: 600 }}>{task.pct}%</span>
        </div>
      )}
    </div>
  );
};

// ── Rail běžících úloh (vlevo, levituje nad mapou) ────────────────────────
const VcTaskRail = ({ onOpen, dimmed }) => (
  <div style={{
    position: 'absolute', left: 24, top: 22, bottom: 22, width: 296, zIndex: 5,
    display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
    opacity: dimmed ? 0.3 : 1, filter: dimmed ? 'blur(2.5px)' : 'none',
    transition: 'opacity .4s, filter .4s', pointerEvents: dimmed ? 'none' : 'auto',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 2px 2px' }}>
      <span className="zt-anim" style={{ width: 7, height: 7, borderRadius: '50%', background: ZT.run, boxShadow: `0 0 8px ${ZT.run}`, animation: 'ztLive 2s ease-in-out infinite' }} />
      <span style={T.label}>Běžící úlohy</span>
      <span style={{ marginLeft: 'auto', fontFamily: ZT.mono, fontSize: 12, fontWeight: 700, color: ZT.ink2 }}>{VC_TASKS.length}</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', paddingRight: 4, paddingBottom: 4 }}>
      {VC_TASKS.map((t, i) => <VcTaskCard key={t.id} task={t} onOpen={onOpen} index={i} />)}
    </div>
  </div>
);

// ── Plný detail úlohy (overlay) ───────────────────────────────────────────
const VC_PHASE_LABEL = { ok: 'hotovo', run: 'běží', idle: 'čeká' };

const VcPhaseRail = ({ phases, selected, onSelect }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    {phases.map((p, i) => {
      const last = i === phases.length - 1;
      const c = p.state === 'ok' ? ZT.ok : p.state === 'run' ? ZT.run : ZT.ink3;
      const isSel = selected === i;
      const clickable = p.state !== 'idle';
      return (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
            <span className={p.state === 'run' ? 'zt-anim' : ''} style={{
              width: 12, height: 12, borderRadius: '50%', border: `2px solid ${c}`,
              background: p.state === 'ok' ? c : 'transparent', display: 'grid', placeItems: 'center',
              boxShadow: p.state === 'run' ? `0 0 8px ${c}` : 'none',
              animation: p.state === 'run' ? 'ztLive 2s ease-in-out infinite' : 'none',
            }}>{p.state === 'ok' && <Icon name="check" size={7} stroke={3} style={{ color: ZT.bg }} />}</span>
            {!last && <span style={{ width: 2, flex: 1, minHeight: 22, background: p.state === 'ok' ? ZT.ok + '55' : ZT.line }} />}
          </div>
          <div
            onClick={() => clickable && onSelect(i)}
            style={{
              flex: 1, paddingBottom: last ? 12 : 16, marginTop: -2, cursor: clickable ? 'pointer' : 'default',
              padding: '6px 10px', marginLeft: -10, marginRight: -4, borderRadius: ZT.rCtl,
              background: isSel ? `${c}12` : 'transparent', border: `1px solid ${isSel ? c + '55' : 'transparent'}`,
              transition: 'background .14s, border-color .14s',
            }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ ...T.bodySm, fontSize: 13, color: p.state === 'idle' ? ZT.ink3 : ZT.ink, fontWeight: 500 }}>{p.name}</span>
              <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: c, marginLeft: 'auto' }}>{VC_PHASE_LABEL[p.state]}</span>
            </div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 2 }}>→ {p.produces}</div>
            {(p.time || p.cost > 0) && (
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {p.time && <span style={{ ...T.micro, fontSize: 9.5 }}>{p.time}</span>}
                {p.cost > 0 && <span style={{ fontFamily: ZT.mono, fontSize: 9.5, color: ZT.ink3 }}>${p.cost.toFixed(2)}</span>}
              </div>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Vstup úlohy: zkrácený text, klik rozbalí přes celé tělo dialogu ────────
const VcTaskInput = ({ input, onOpen }) => (
  <div>
    <div style={{ ...T.label, marginBottom: 11 }}>Vstup</div>
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = ZT.lineHi} onMouseLeave={(e) => e.currentTarget.style.borderColor = ZT.line}>
      <Icon name="arrow" size={14} style={{ color: ZT.ink3, flex: '0 0 auto' }} />
      <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, wordBreak: 'break-word' }}>{input.prompt}</div>
      <Icon name="chevron" size={13} style={{ color: ZT.ink3, flex: '0 0 auto' }} />
    </div>
    {input.files.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
        {input.files.map((f) => (
          <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: ZT.mono, fontSize: 10.5, color: ZT.ink2, border: `1px solid ${ZT.line}`, borderRadius: 4, padding: '3px 8px' }}>
            <Icon name="file" size={11} style={{ color: ZT.ink3 }} /> {f}
          </span>
        ))}
      </div>
    )}
  </div>
);

// ── Lehký MD render (nadpisy, odrážky, tučně/kurzíva, citace) ─────────────
const vcMdInline = (text, key) => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((seg, i) => {
    if (/^\*\*[^*]+\*\*$/.test(seg)) return <strong key={key + i} style={{ color: ZT.ink, fontWeight: 700 }}>{seg.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(seg)) return <code key={key + i} style={{ fontFamily: ZT.mono, fontSize: '0.92em', background: ZT.bg, border: `1px solid ${ZT.line}`, borderRadius: 3, padding: '1px 5px', color: ZT.accent }}>{seg.slice(1, -1)}</code>;
    return seg;
  });
};
const VcMdView = ({ source, accent }) => {
  const lines = source.split('\n');
  const blocks = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const sizes = { 1: 18, 2: 15, 3: 13.5 };
      blocks.push(<div key={key++} style={{ color: ZT.ink, fontWeight: 700, fontSize: sizes[h[1].length], lineHeight: 1.3, margin: h[1].length === 1 ? '0 0 12px' : '18px 0 8px', paddingBottom: h[1].length === 1 ? 8 : 0, borderBottom: h[1].length === 1 ? `1px solid ${ZT.line}` : 'none' }}>{vcMdInline(h[2], 'h' + key)}</div>);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push(<blockquote key={key++} style={{ margin: '0 0 12px', padding: '6px 0 6px 14px', borderLeft: `2px solid ${accent}`, color: ZT.ink2, fontStyle: 'italic' }}>{vcMdInline(buf.join(' '), 'q' + key)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(<ul key={key++} style={{ margin: '0 0 13px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>{items.map((it, j) => <li key={j} style={{ display: 'flex', gap: 9, color: ZT.ink2, fontSize: 13, lineHeight: 1.55 }}><span style={{ color: accent, flex: '0 0 auto' }}>▸</span><span>{vcMdInline(it, 'ul' + key + j)}</span></li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push(<ol key={key++} style={{ margin: '0 0 13px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>{items.map((it, j) => <li key={j} style={{ display: 'flex', gap: 9, color: ZT.ink2, fontSize: 13, lineHeight: 1.55 }}><span style={{ fontFamily: ZT.mono, fontSize: 12, color: accent, flex: '0 0 auto', minWidth: 16 }}>{j + 1}.</span><span>{vcMdInline(it, 'ol' + key + j)}</span></li>)}</ol>);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|>\s?|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
    blocks.push(<p key={key++} style={{ color: ZT.ink2, fontSize: 13, lineHeight: 1.65, margin: '0 0 12px' }}>{vcMdInline(buf.join(' '), 'p' + key)}</p>);
  }
  return <div>{blocks}</div>;
};

// ── Blok výstupu: MD soubor (klik → rozbalí přes tělo dialogu) ────────────
const VcMdOutputBlock = ({ output, onOpen }) => (
  <div>
    <div style={{ ...T.label, marginBottom: 11 }}>Výstup úlohy</div>
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = ZT.lineHi} onMouseLeave={(e) => e.currentTarget.style.borderColor = ZT.line}>
      <Icon name="doc" size={15} style={{ color: ZT.ink3, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: ZT.mono, fontSize: 12, color: ZT.ink }}>{output.file}</div>
        {output.note && <div style={{ ...T.micro, fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{output.note}</div>}
      </div>
      <Icon name="chevron" size={13} style={{ color: ZT.ink3, flex: '0 0 auto' }} />
    </div>
  </div>
);

// ── Overlay s plným obsahem přes tělo dialogu (MD výstup nebo vstup) ──────
const VcExpandOverlay = ({ title, icon, source, accent, onClose }) => (
  <div onClick={onClose} style={{
    position: 'absolute', inset: 0, zIndex: 32, display: 'flex', justifyContent: 'center',
    background: 'rgba(11,14,19,0.6)', backdropFilter: 'blur(2px)', animation: 'vcFadeIn .18s ease both',
  }}>
    <div onClick={(e) => e.stopPropagation()} style={{
      width: '100%', maxWidth: '100%', background: ZT.surface, display: 'flex', flexDirection: 'column',
      animation: 'vcSlideUp .22s cubic-bezier(.2,.8,.2,1) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 20px', borderBottom: `1px solid ${ZT.line}`, flex: '0 0 auto' }}>
        <Icon name={icon} size={16} style={{ color: accent }} />
        <span style={{ fontFamily: ZT.mono, fontSize: 13, color: ZT.ink, fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 4, display: 'flex' }}><Icon name="x" size={17} /></button>
      </div>
      <div style={{ padding: '20px 26px', overflow: 'auto', flex: 1 }}>
        <VcMdView source={source} accent={accent} />
      </div>
    </div>
  </div>
);

// ── CI stav (checkmark / křížek / běží) ───────────────────────────────────
const VC_CI = {
  ok:   { c: ZT.ok,  icon: 'check', label: 'CI zelené' },
  fail: { c: ZT.bad, icon: 'x',     label: 'CI selhalo' },
  run:  { c: ZT.run, icon: 'run',   label: 'CI běží' },
};

// ── Blok PR (levý sloupec, pod fázemi) ─────────────────────────────────────
const VcPrBlock = ({ pr, accent }) => {
  const ci = VC_CI[pr.ci] || VC_CI.run;
  return (
    <div>
      <div style={{ ...T.label, marginBottom: 11 }}>Pull request</div>
      <div style={{ borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="branch" size={15} style={{ color: accent, flex: '0 0 auto' }} />
          <span style={{ fontFamily: ZT.mono, fontSize: 12, color: ZT.ink3 }}>#{pr.number}</span>
          <span style={{ ...T.bodySm, fontSize: 13, color: ZT.ink, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.title}</span>
        </div>
        <div style={{ ...T.micro, fontSize: 10.5, marginTop: 8 }}>{pr.branch} → {pr.base} · {pr.diff}</div>
        <div style={{ ...T.bodySm, fontSize: 12, color: ZT.ink2, marginTop: 10, lineHeight: 1.55 }}>{pr.desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${ZT.line}` }}>
          <span className={pr.ci === 'run' ? 'zt-anim' : ''} style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', background: `${ci.c}1e`, border: `1px solid ${ci.c}55`, animation: pr.ci === 'run' ? 'ztSpin 1.1s linear infinite' : 'none' }}>
            <Icon name={ci.icon} size={9} stroke={2.4} style={{ color: ci.c }} />
          </span>
          <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ci.c }}>{ci.label}</span>
          {pr.ciNote && <span style={{ ...T.micro, fontSize: 10 }}>· {pr.ciNote}</span>}
        </div>
      </div>
    </div>
  );
};

const vcLastRunnable = (phases) => {
  for (let i = phases.length - 1; i >= 0; i--) if (phases[i].state !== 'idle') return i;
  return phases.length - 1;
};

const VcTaskDetail = ({ task, originRect, onClose, onOpenSys }) => {
  const sys = vcSys(task.sys);
  const panelRef = useRefT0(null);
  const [ready, setReadyT] = useStateT(!originRect);
  const [selPhase, setSelPhase] = useStateT(null);
  const [overlay, setOverlay] = useStateT(null); // 'input' | 'output' | null
  const finished = task.phases.every((p) => p.state !== 'run') && task.output.kind !== 'none';
  const [phasesOpen, setPhasesOpen] = useStateT(!finished);
  const activePhaseIdx = selPhase != null ? selPhase : vcLastRunnable(task.phases);
  const activePhase = task.phases[activePhaseIdx];
  const doneCount = task.phases.filter((p) => p.state === 'ok').length;

  // ── FLIP: karta „vyroste" do dialogu z přesné pozice, kde byla kliknuta ──
  useLayoutEffectT0(() => {
    const panel = panelRef.current;
    if (!panel || !originRect) return;
    const final = panel.getBoundingClientRect();
    panel.style.transition = 'none';
    panel.style.position = 'fixed';
    panel.style.margin = '0';
    panel.style.left = originRect.left + 'px';
    panel.style.top = originRect.top + 'px';
    panel.style.width = originRect.width + 'px';
    panel.style.height = originRect.height + 'px';
    panel.style.zIndex = '31';
    panel.getBoundingClientRect(); // vynutí reflow
    requestAnimationFrame(() => {
      panel.style.transition = 'left .42s cubic-bezier(.2,.8,.2,1), top .42s cubic-bezier(.2,.8,.2,1), width .42s cubic-bezier(.2,.8,.2,1), height .42s cubic-bezier(.2,.8,.2,1)';
      panel.style.left = final.left + 'px';
      panel.style.top = final.top + 'px';
      panel.style.width = final.width + 'px';
      panel.style.height = final.height + 'px';
    });
    const onEnd = (e) => {
      if (e.target !== panel || e.propertyName !== 'width') return;
      // usadit zpět do normálního flow, ať dialog zůstane responzivní
      panel.style.transition = ''; panel.style.position = ''; panel.style.margin = '';
      panel.style.left = ''; panel.style.top = ''; panel.style.width = ''; panel.style.height = ''; panel.style.zIndex = '';
    };
    panel.addEventListener('transitionend', onEnd);
    const rt = setTimeout(() => setReadyT(true), 130);
    return () => { panel.removeEventListener('transitionend', onEnd); clearTimeout(rt); };
  }, []);

  const handleClose = () => {
    const panel = panelRef.current;
    if (!panel || !originRect) { onClose(); return; }
    setReadyT(false);
    const cur = panel.getBoundingClientRect();
    panel.style.transition = 'none';
    panel.style.position = 'fixed'; panel.style.margin = '0'; panel.style.zIndex = '31';
    panel.style.left = cur.left + 'px'; panel.style.top = cur.top + 'px';
    panel.style.width = cur.width + 'px'; panel.style.height = cur.height + 'px';
    panel.getBoundingClientRect();
    requestAnimationFrame(() => {
      panel.style.transition = 'left .34s cubic-bezier(.4,0,.7,1), top .34s cubic-bezier(.4,0,.7,1), width .34s cubic-bezier(.4,0,.7,1), height .34s cubic-bezier(.4,0,.7,1)';
      panel.style.left = originRect.left + 'px'; panel.style.top = originRect.top + 'px';
      panel.style.width = originRect.width + 'px'; panel.style.height = originRect.height + 'px';
    });
    setTimeout(onClose, 350);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '28px 40px 28px 344px' }}
      onClick={handleClose}>
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 860, maxHeight: '100%', display: 'flex', flexDirection: 'column',
        background: ZT.surface, border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rPanel, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6)', animation: originRect ? 'none' : 'vcPop .3s ease both',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, opacity: ready ? 1 : 0, transition: 'opacity .3s ease' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '17px 20px', borderBottom: `1px solid ${ZT.line}`, background: `linear-gradient(180deg, ${sys.hue}12, transparent)` }}>
          <div style={{ width: 34, height: 34, borderRadius: ZT.rCtl, display: 'grid', placeItems: 'center', background: `${sys.hue}22`, border: `1px solid ${sys.hue}55`, color: sys.hue, flex: '0 0 auto' }}>
            <Icon name={sys.glyph} size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => onOpenSys(sys.id)} style={{ fontFamily: ZT.mono, fontSize: 11, color: sys.hue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{sys.name}</button>
              <span style={{ ...T.micro, fontSize: 10 }}>/ {task.kind} · {task.proj}</span>
            </div>
            <div style={{ ...T.title, fontSize: 18, marginTop: 2 }}>{task.title}</div>
          </div>
          {!task.continuous
            ? <ZtChip state="run">{task.pct}% · {task.phase}</ZtChip>
            : <ZtChip state="ok">nepřetržitě</ZtChip>}
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 5, display: 'flex' }}><Icon name="x" size={18} /></button>
        </div>

        {/* body — dva sloupce */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: ZT.line, overflow: 'auto' }}>
          {/* levý: vstup + fáze + PR/výstup (MD) */}
          <div style={{ background: ZT.surface, padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <VcTaskInput input={task.input} onOpen={() => setOverlay('input')} />
            <div>
              <div onClick={() => setPhasesOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: phasesOpen ? 14 : 0, cursor: 'pointer', userSelect: 'none' }}>
                <span style={T.label}>Fáze úlohy</span>
                <span style={{ ...T.micro, fontSize: 10 }}>{doneCount}/{task.phases.length} hotovo</span>
                <Icon name="chevron" size={12} style={{ color: ZT.ink3, marginLeft: 'auto', transform: phasesOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </div>
              {phasesOpen && <VcPhaseRail phases={task.phases} selected={activePhaseIdx} onSelect={setSelPhase} />}
            </div>
            {task.output.kind === 'pr' && <VcPrBlock pr={task.output.pr} accent={sys.hue} />}
            {task.output.kind === 'md' && (
              <VcMdOutputBlock output={task.output} onOpen={() => setOverlay('output')} />
            )}
          </div>

          {/* pravý: log vybrané fáze */}
          <div style={{ background: ZT.surface, padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={T.label}>Log · {activePhase.name}</span>
                {activePhase.state === 'run' && <span className="zt-anim" style={{ width: 6, height: 6, borderRadius: '50%', background: ZT.run, animation: 'ztLive 2s ease-in-out infinite' }} />}
              </div>
              <div style={{ background: ZT.bg, border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {activePhase.log.length > 0 ? activePhase.log.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, fontFamily: ZT.mono, fontSize: 11.5, lineHeight: 1.4 }}>
                    <span style={{ color: ZT.ink3, flex: '0 0 auto' }}>{l.t}</span>
                    <span style={{ color: VC_LOG_C[l.lvl] || ZT.ink2 }}>{l.text}</span>
                  </div>
                )) : <VcMuted>Tato fáze ještě nezačala.</VcMuted>}
              </div>
            </div>
          </div>

          {overlay === 'input' && (
            <VcExpandOverlay title="Vstup" icon="arrow" source={task.input.prompt} accent={sys.hue} onClose={() => setOverlay(null)} />
          )}
          {overlay === 'output' && task.output.kind === 'md' && (
            <VcExpandOverlay title={task.output.file} icon="doc" source={task.output.content} accent={sys.hue} onClose={() => setOverlay(null)} />
          )}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 20px', borderTop: `1px solid ${ZT.line}`, background: ZT.bg }}>
          <ZtBtn size="sm" variant="ghost" icon="pause">Pozastavit</ZtBtn>
          <ZtBtn size="sm" variant="ghost" icon="doc">Otevřít soubory</ZtBtn>
          <span style={{ marginLeft: 'auto', ...T.micro, fontSize: 10.5 }}>čerpá z Agent SDK · běží {task.started}</span>
        </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { VcTaskCard, VcTaskRail, VcTaskDetail, VcPhaseRail });

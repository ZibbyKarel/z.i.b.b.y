// ZIBBY velín — Orchestrace (Pipelines): visual phase chain + Tester loop + run modal
const { useState: useStateP, useRef: useRefP, useEffect: useEffectP } = React;

const MODEL_C = { opus: '#b07cff', sonnet: '#56c4d6', haiku: '#7fd98a' };
const THINK_C = { high: '#f0883e', medium: '#5b8def', low: '#5d6b7a' };

const Pill = ({ children, color = Z.inkDim, solid = false, onClick, title }) =>
<span onClick={onClick} title={title} style={{
  display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 9.5, fontWeight: 600,
  letterSpacing: '0.02em', padding: '2px 7px', borderRadius: 2, whiteSpace: 'nowrap',
  color: solid ? Z.bg0 : color, background: solid ? color : `${color}1f`, border: `1px solid ${color}55`,
  cursor: onClick ? 'pointer' : 'default'
}}>{children}</span>;


const ModelBadge = ({ model, onClick }) => <Pill color={MODEL_C[model] || Z.inkDim} onClick={onClick} title="model (override per-run)">{model}</Pill>;
const ThinkBadge = ({ level, onClick }) => <Pill color={THINK_C[level] || Z.inkDim} onClick={onClick} title="thinking level">◇ {level}</Pill>;

// ---- a single phase node -------------------------------------------------
const PhaseNode = ({ phase, accent, idx, active, isFirst, isLast }) => {
  const a = agentByName(phase.agent);
  // Vstup/výstup uvnitř karty jen u krajů řetězu — jinak je nese šipka.
  const showIn = isFirst;
  const showOut = isLast;
  return (
    <div style={{
      position: 'relative', flex: '1 0 158px', minWidth: 158, background: active ? Z.panelHi : Z.panel,
      border: `1px solid ${active ? accent : Z.line}`, borderRadius: 3, padding: '13px 13px 12px',
      boxShadow: active ? `0 0 0 1px ${accent}55, 0 0 22px ${accent}33` : 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Avatar src={a.avatar} glyph={a.glyph} size={30} radius={2} accent={accent} dim={accentDimOf(phase.ctx || 'work')} />
        <div style={{ minWidth: 0 }}>
          <Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em' }}>FÁZE {idx + 1}</Mono>
          <div style={{ fontFamily: Z.mono, fontSize: 12, fontWeight: 600, color: Z.ink, whiteSpace: 'nowrap' }}>{phase.agent}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
        <ModelBadge model={phase.model} /><ThinkBadge level={phase.thinking} />
      </div>
      {(showIn || showOut) &&
      <div style={{ marginTop: 11, paddingTop: 9, borderTop: `1px solid ${Z.line}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {showIn &&
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <Mono style={{ fontSize: 8.5, color: Z.inkFaint, width: 30, flex: '0 0 auto' }}>vstup</Mono>
              <Mono style={{ fontSize: 9.5, color: Z.inkDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', flex: '1 1 0', minWidth: 0 }}>{phase.consumes}</Mono>
            </div>
        }
          {showOut &&
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <Mono style={{ fontSize: 8.5, color: Z.inkFaint, width: 30, flex: '0 0 auto' }}>výstup</Mono>
              <Mono style={{ fontSize: 9.5, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', flex: '1 1 0', minWidth: 0 }}>{phase.produces}</Mono>
            </div>
        }
        </div>
      }
    </div>);

};

// edge between two nodes with the handoff file (výstup levé = vstup pravé)
const Edge = ({ file }) =>
<div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px', alignSelf: 'center' }}>
    <Mono style={{ fontSize: 8.5, color: Z.inkFaint, marginBottom: 3, whiteSpace: 'nowrap' }}>{file}</Mono>
    <Icon name="arrow" size={16} style={{ color: Z.inkFaint }} />
  </div>;


// ---- the chain with Tester's decision/loop -------------------------------
const PhaseChain = ({ pipeline, accent }) => {
  const phases = pipeline.phases;
  const n = phases.length;
  const loopIdx = phases.findIndex((p) => p.loop);
  const loopPhase = loopIdx >= 0 ? phases[loopIdx] : null;
  // generic back-edge geometry: node i center ≈ (i+0.5)/n in %
  const cx = (i) => (i + 0.5) / Math.max(n, 1) * 100;
  let targetIdx = loopPhase ? phases.findIndex((p) => p.agent === loopPhase.loop.to) : -1;
  if (loopPhase && targetIdx < 0) targetIdx = Math.max(loopIdx - 1, 0);
  const x1 = loopPhase ? cx(loopIdx) : 0;
  const x2 = loopPhase ? cx(targetIdx) : 0;
  const nextName = loopPhase ? phases[loopIdx + 1] ? phases[loopIdx + 1].agent : 'konec pipeline' : null;

  // scroll-edge afford: detekce skrytého obsahu vlevo/vpravo
  const scrollRef = useRefP(null);
  const [edge, setEdge] = useStateP({ l: false, r: false });
  const checkEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const l = el.scrollLeft > 2;
    const r = el.scrollLeft < max - 2;
    setEdge((prev) => prev.l === l && prev.r === r ? prev : { l, r });
  };
  useEffectP(() => {
    checkEdges();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkEdges);
    ro.observe(el);
    window.addEventListener('resize', checkEdges);
    return () => {ro.disconnect();window.removeEventListener('resize', checkEdges);};
  }, [n]);

  const fadeBase = { position: 'absolute', top: 0, bottom: 0, width: 56, pointerEvents: 'none', zIndex: 3 };
  return (
    <div>
    <div style={{ position: 'relative' }}>
    <div ref={scrollRef} onScroll={checkEdges} style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
      <div style={{ minWidth: 'fit-content' }}>
      {/* loop arc overlay region */}
      {loopPhase &&
            <div style={{ position: 'relative', height: 34 }}>
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <path d={`M${x1} 30 L ${x1} 7 L ${x2} 7 L ${x2} 30`} fill="none" stroke={Z.bad} strokeWidth="1.2" strokeDasharray="3 3" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
            <path d={`M${x2} 30 l 2.6 -5 l -5.2 0 z`} fill={Z.bad} />
          </svg>
          <div style={{ position: 'absolute', left: `${(x1 + x2) / 2}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Icon name="retry" size={12} style={{ color: Z.bad }} />
            <Mono style={{ fontSize: 9.5, color: Z.bad }}>retry · max {loopPhase.loop.maxRetries}{loopPhase.loop.escalate ? ' · ↑ thinking' : ''}</Mono>
          </div>
        </div>
            }

      {/* node row */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
        {phases.map((ph, i) =>
              <React.Fragment key={i}>
            <PhaseNode phase={ph} accent={accent} idx={i} active={ph.loop} isFirst={i === 0} isLast={i === phases.length - 1} />
            {i < phases.length - 1 && <Edge file={phases[i + 1].consumes} />}
          </React.Fragment>
              )}
      </div>
      </div>
      </div>

    {/* scroll-edge fade afford + chevron */}
    <div style={{ ...fadeBase, left: 0, opacity: edge.l ? 1 : 0, background: `linear-gradient(to right, ${Z.panel}, ${Z.panel}00)` }} />
    <div style={{ ...fadeBase, right: 0, opacity: edge.r ? 1 : 0, background: `linear-gradient(to left, ${Z.panel}, ${Z.panel}00)`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
      <div style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}>
        <Icon name="arrow" size={13} />
      </div>
    </div>
    </div>

      {/* loop decision explanation */}
      {loopPhase &&
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'rgba(57,217,138,0.07)', border: `1px solid ${Z.ok}3a`, borderRadius: 3 }}>
            <Icon name="check" size={15} style={{ color: Z.ok }} stroke={2.2} />
            <div>
              <Mono style={{ fontSize: 11, color: Z.ok, fontWeight: 600 }}>kontrola prošla</Mono>
              <Mono style={{ fontSize: 10, color: Z.inkDim, display: 'block', marginTop: 2 }}>→ pokračuje na {nextName}</Mono>
            </div>
          </div>
          <div style={{ flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'rgba(255,107,107,0.07)', border: `1px solid ${Z.bad}3a`, borderRadius: 3 }}>
            <Icon name="retry" size={15} style={{ color: Z.bad }} />
            <div>
              <Mono style={{ fontSize: 11, color: Z.bad, fontWeight: 600 }}>kontrola selhala</Mono>
              <Mono style={{ fontSize: 10, color: Z.inkDim, display: 'block', marginTop: 2 }}>→ zpět na {loopPhase.loop.to} · po {loopPhase.loop.maxRetries} pokusech → park na review</Mono>
            </div>
          </div>
        </div>
      }
    </div>);

};

// ---- pipeline list card --------------------------------------------------
const stateMeta = {
  done: { c: Z.ok, label: 'hotovo' },
  parked: { c: Z.warn, label: 'zaparkováno' },
  failed: { c: Z.bad, label: 'selhalo' },
  running: { c: Z.run, label: 'běží' },
  idle: { c: Z.inkFaint, label: 'nespuštěno' }
};

const PipelineCard = ({ p, accent, selected, onSelect }) => {
  const [h, setH] = useStateP(false);
  const sm = stateMeta[p.lastState] || stateMeta.done;
  return (
    <div onClick={() => onSelect(p.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{
      position: 'relative', background: selected ? Z.panelHi : Z.panel, border: `1px solid ${selected ? accent : h ? accent + '55' : Z.line}`,
      borderRadius: 3, padding: 14, cursor: 'pointer', transition: 'all .14s',
      boxShadow: selected ? `0 0 0 1px ${accent}44` : 'none'
    }}>
      {selected && <Corners color={accent} inset={5} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar src={p.avatar} glyph="flow" size={32} radius={2} accent={accent} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <Pill color={sm.c}><span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.c, display: 'inline-block' }} />{sm.label}</Pill>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 6, lineHeight: 1.4 }}>{p.desc}</div>
      {/* phase chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 11, flexWrap: 'wrap' }}>
        {p.phases.map((ph, i) =>
        <React.Fragment key={i}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: Z.mono, fontSize: 9.5, color: Z.inkDim }}>
              <Icon name={agentByName(ph.agent).glyph} size={11} style={{ color: accent }} />{ph.agent}
            </span>
            {i < p.phases.length - 1 && <Icon name="arrow" size={11} style={{ color: Z.inkFaint }} />}
          </React.Fragment>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${Z.line}` }}>
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}><Icon name="dollar" size={11} style={{ color: Z.inkFaint, display: 'inline', verticalAlign: '-1px' }} /> strop ${p.budget}</Mono>
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint }}>poslední {p.lastRun}</Mono>
      </div>
    </div>);

};

// ---- pipeline run modal --------------------------------------------------
const CYCLE_MODEL = ['opus', 'sonnet', 'haiku'];
const CYCLE_THINK = ['high', 'medium', 'low'];
const next = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];

const PipelineRunModal = ({ pipeline, accent, onClose }) => {
  const [prompt, setPrompt] = useStateP('');
  const [proj, setProj] = useStateP((window.PROJECTS || ['media-vault'])[0]);
  const [budget, setBudget] = useStateP(pipeline ? pipeline.budget : 25);
  const [over, setOver] = useStateP(pipeline ? pipeline.phases.map((p) => ({ model: p.model, thinking: p.thinking })) : []);
  const [launched, setLaunched] = useStateP(false);
  if (!pipeline) return null;
  const projects = window.PROJECTS || ['media-vault', 'home-ops', 'zibby-core'];
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 580, maxWidth: '100%', maxHeight: '90%', overflow: 'auto', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <Avatar src={pipeline.avatar} glyph="flow" size={38} radius={2} accent={accent} dim={accentDimOf(pipeline.ctx)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 15, fontWeight: 700, color: Z.ink }}>Spustit · {pipeline.name}</div>
            <div style={{ fontSize: 12, color: Z.inkDim }}>{pipeline.phases.length} fází · víceagentní běh na pozadí</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {!launched ?
        <div style={{ padding: 20 }}>
            <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase' }}>Zadání</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus placeholder={`Co má pipeline „${pipeline.name}“ udělat…`}
          style={{ width: '100%', minHeight: 84, marginTop: 8, padding: '12px 14px', resize: 'vertical', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, color: Z.ink, fontFamily: Z.sans, fontSize: 13.5, lineHeight: 1.5, outline: 'none', boxSizing: 'border-box' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 16 }}>
              <div>
                <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase' }}>Cílový projekt</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {projects.slice(0, 4).map((pp) =>
                <button key={pp} onClick={() => setProj(pp)} style={{ fontFamily: Z.mono, fontSize: 10.5, padding: '5px 9px', cursor: 'pointer', borderRadius: 2, color: proj === pp ? Z.bg0 : Z.inkDim, background: proj === pp ? accent : 'transparent', border: `1px solid ${proj === pp ? accent : Z.line}` }}>{pp}</button>
                )}
                </div>
              </div>
              <div>
                <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase' }}>Rozpočet (strop)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  {[10, 25, 50].map((b) =>
                <button key={b} onClick={() => setBudget(b)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '5px 10px', cursor: 'pointer', borderRadius: 2, color: budget === b ? Z.bg0 : Z.inkDim, background: budget === b ? accent : 'transparent', border: `1px solid ${budget === b ? accent : Z.line}` }}>${b}</button>
                )}
                </div>
              </div>
            </div>

            {/* per-agent override */}
            <label style={{ fontFamily: Z.mono, fontSize: 10, letterSpacing: '0.14em', color: Z.inkFaint, textTransform: 'uppercase', display: 'block', marginTop: 18 }}>Override modelu / thinking pro tenhle běh</label>
            <div style={{ marginTop: 8, border: `1px solid ${Z.line}`, borderRadius: 3, overflow: 'hidden' }}>
              {pipeline.phases.map((ph, i) =>
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < pipeline.phases.length - 1 ? `1px solid ${Z.line}` : 'none', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <Icon name={agentByName(ph.agent).glyph} size={14} style={{ color: accent }} />
                  <Mono style={{ fontSize: 11.5, color: Z.ink, flex: 1 }}>{ph.agent}</Mono>
                  <ModelBadge model={over[i].model} onClick={() => setOver((o) => o.map((x, j) => j === i ? { ...x, model: next(CYCLE_MODEL, x.model) } : x))} />
                  <ThinkBadge level={over[i].thinking} onClick={() => setOver((o) => o.map((x, j) => j === i ? { ...x, thinking: next(CYCLE_THINK, x.thinking) } : x))} />
                </div>
            )}
            </div>
            <Mono style={{ fontSize: 9, color: Z.inkFaint, display: 'block', marginTop: 7 }}>klikni na badge pro override · defaulty z agent.md, push do branche čeká na tvé schválení</Mono>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
              <GhostBtn icon="edit">Edit raw .pipeline.md</GhostBtn>
              <RunBtn accent={accent} label={`Spustit · max $${budget}`} onClick={() => setLaunched(true)} />
            </div>
          </div> :

        <div style={{ padding: '30px 20px 24px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, margin: '0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', color: accent, border: `1.5px solid ${accent}`, boxShadow: `0 0 24px ${accent}55` }}><Icon name="flow" size={22} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 16 }}>Pipeline spuštěna na pozadí</div>
            <Mono style={{ fontSize: 12, color: Z.inkDim, display: 'block', marginTop: 6 }}>{pipeline.name} → {proj} · strop ${budget}</Mono>
            <div style={{ fontSize: 12.5, color: Z.inkDim, marginTop: 8 }}>Sleduj fáze v sekci <span style={{ color: accent }}>Běžící agenti</span> · pracuje v izolované branchi.</div>
            <div style={{ marginTop: 20 }}><GhostBtn icon="pulse" onClick={onClose}>Zavřít</GhostBtn></div>
          </div>
        }
      </div>
    </div>);

};

// ---- helpers -------------------------------------------------------------
const pipeSlug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// ---- main body -----------------------------------------------------------
const PipelinesBody = ({ accent }) => {
  const [list, setList] = useStateP(PIPELINES);
  const [selId, setSelId] = useStateP(list[0] ? list[0].id : null);
  const [runP, setRunP] = useStateP(null);
  const [editor, setEditor] = useStateP(null); // { mode, pipeline }
  const sel = list.find((p) => p.id === selId) || list[0];

  const clonePhases = (phs) => phs.map((p) => ({ ...p, loop: p.loop ? { ...p.loop } : undefined }));
  const savePipeline = (p, isNew) => {
    if (isNew) {
      let id = pipeSlug(p.name) || 'pipeline';
      if (list.some((x) => x.id === id)) id = id + '-' + Date.now().toString().slice(-4);
      const final = { ...p, id, file: `~/zibby/pipelines/${id}.pipeline.md`, lastRun: '—', lastState: 'idle' };
      setList((prev) => [...prev, final]);
      setSelId(id);
    } else {
      setList((prev) => prev.map((x) => x.id === p.id ? p : x));
    }
    setEditor(null);
  };
  const openNew = () => setEditor({ mode: 'new', pipeline: null });
  const openEdit = () => sel && setEditor({ mode: 'edit', pipeline: { ...sel, phases: clonePhases(sel.phases) } });
  const openDuplicate = () => sel && setEditor({ mode: 'new', pipeline: { ...sel, id: undefined, name: sel.name + ' kopie', phases: clonePhases(sel.phases) } });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Orchestrace</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {list.length} pipeline{list.length === 1 ? '' : list.length >= 2 && list.length <= 4 ? 'y' : ''} · sekvenče agentů s automatickým předáváním
            </Mono>
          </div>
          <RunBtn accent={accent} icon="plus" label="Přidat pipeline" onClick={openNew} />
        </div>
      </HudPanel>
      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      {/* left: list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{list.length}</Mono>}>Pipeline</SectionLabel>
        {list.map((p) => <PipelineCard key={p.id} p={p} accent={accent} selected={p.id === selId} onSelect={setSelId} />)}
        {list.length === 0 && <Mono style={{ fontSize: 12, color: Z.inkFaint, padding: 16 }}>Zatím žádné pipeline.</Mono>}
      </div>

      {/* right: detail / editor */}
      {sel &&
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ position: 'relative', background: Z.panel, border: `1px solid ${Z.line}`, borderRadius: Z.rPanel, overflow: 'hidden' }}>
            <EntityHero
              image={sel.avatar} glyph="flow" accent={accent} height={220} fit="contain"
              name={sel.name}
              meta={<Mono style={{ fontSize: 10.5, color: Z.inkDim }}>{sel.phases.length} fází · sekvenční orchestrace</Mono>}
              desc={sel.desc}
              editable
              placeholder="Nahraj obrázek orchestrace"
              onUpload={(url) => setList((prev) => prev.map((x) => x.id === sel.id ? { ...x, avatar: url } : x))}
              onRemove={() => setList((prev) => prev.map((x) => x.id === sel.id ? { ...x, avatar: null } : x))}
            />
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="file" size={12} style={{ color: Z.inkFaint }} />
                  <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{sel.file}</Mono>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GhostBtn icon="edit" accent={accent} onClick={openEdit}>Editovat</GhostBtn>
                  <GhostBtn icon="link" accent={accent} onClick={openDuplicate}>Duplikovat</GhostBtn>
                  <RunBtn accent={accent} label="Spustit pipeline" onClick={() => setRunP(sel)} />
                </div>
              </div>

              {/* budget strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${Z.line}`, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="dollar" size={16} style={{ color: accent }} />
                  <div>
                    <Mono style={{ fontSize: 8.5, color: Z.inkFaint, letterSpacing: '0.1em', display: 'block' }}>STROP PIPELINE</Mono>
                    <Mono style={{ fontSize: 15, fontWeight: 700, color: Z.ink }}>${sel.budget}</Mono>
                  </div>
                </div>
                <div style={{ width: 1, height: 30, background: Z.line }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="branch" size={16} style={{ color: Z.inkDim }} />
                  <Mono style={{ fontSize: 11, color: Z.inkDim }}>výstup → izolovaná branch · PR k ranní review</Mono>
                </div>
                <div style={{ width: 1, height: 30, background: Z.line }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="checkpoint" size={16} style={{ color: Z.inkDim }} />
                  <Mono style={{ fontSize: 11, color: Z.inkDim }}>checkpoint po každé fázi</Mono>
                </div>
              </div>
            </div>
          </div>

          {/* visual chain */}
          <HudPanel accent={accent} title="zřetězení fází · soubory = předání" pad={20}>
            <PhaseChain pipeline={sel} accent={accent} />
          </HudPanel>
        </div>
        }

      </div>
      {runP && <PipelineRunModal key={runP.id} pipeline={runP} accent={accent} onClose={() => setRunP(null)} />}
      {editor && <PipelineGraphEditor key={editor.mode + (editor.pipeline ? editor.pipeline.id || 'dup' : 'new')} pipeline={editor.pipeline} mode={editor.mode} accent={accent} onClose={() => setEditor(null)} onSave={savePipeline} />}
    </div>);

};

Object.assign(window, { PipelinesBody, PhaseChain, PipelineRunModal, Pill, ModelBadge, ThinkBadge });
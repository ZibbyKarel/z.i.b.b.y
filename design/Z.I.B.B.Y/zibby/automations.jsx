// ZIBBY velín — Automatizace: cron/event triggery → agent / pipeline / briefing
// Tady vzniká autonomie. Rizikový výsledek ale stejně projde approval frontou.
const { useState: useStateAu, useEffect: useEffectAu } = React;

const TRIG = {
  cron:  { glyph: 'clock', label: 'cron',  c: '#5b8def' },
  event: { glyph: 'bolt',  label: 'event', c: '#f0b429' },
};

const AU_STATE = {
  done:      { canon: 'done',              label: 'hotovo',      c: Z.ok },
  await:     { canon: 'awaiting-approval', label: 'čeká',        c: Z.warn },
  running:   { canon: 'running',           label: 'běží',        c: Z.run },
  error:     { canon: 'error',             label: 'chyba',       c: Z.bad },
  interrupt: { canon: 'interrupted',       label: 'přerušeno',   c: Z.inkFaint },
  ready:     { canon: 'idle',              label: 'připraveno',  c: Z.inkFaint },
};

// ---- automation card -----------------------------------------------------
const AutomationCard = ({ au, accent, onToggle }) => {
  const [h, setH] = useStateAu(false);
  const tg = TRIG[au.trigger.type];
  const sm = AU_STATE[au.lastState] || AU_STATE.done;
  const off = !au.enabled;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: h && !off ? Z.panelHi : Z.panel,
        border: `1px solid ${off ? Z.line : (h ? accent + '55' : Z.line)}`, borderRadius: Z.rPanel, padding: 16,
        transition: 'all .15s', opacity: off ? 0.6 : 1, boxShadow: h && !off ? '0 8px 26px rgba(0,0,0,0.35)' : 'none',
      }}>
      {h && !off && <Corners color={accent} inset={5} />}

      {/* top: name + enable switch */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Dot color={off ? Z.inkFaint : (au.lastState === 'running' ? Z.run : Z.ok)} pulse={!off && au.lastState === 'running'} size={7} />
            <div style={{ fontSize: 15, fontWeight: 600, color: Z.ink }}>{au.name}</div>
          </div>
          <div style={{ fontSize: 12, color: Z.inkDim, marginTop: 6, lineHeight: 1.45, maxWidth: 520 }}>{au.desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto' }}>
          <Mono style={{ fontSize: 9.5, color: off ? Z.inkFaint : accent }}>{off ? 'vypnuto' : 'aktivní'}</Mono>
          <Switch on={au.enabled} accent={accent} onToggle={() => onToggle(au.id)} />
        </div>
      </div>

      {/* trigger → target flow */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 14 }}>
        {/* trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: Z.bg0, border: `1px solid ${tg.c}33`, borderRadius: 3, flex: '1 1 0', minWidth: 0 }}>
          <div style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${tg.c}16`, color: tg.c, border: `1px solid ${tg.c}44` }}><Icon name={tg.glyph} size={16} /></div>
          <div style={{ minWidth: 0 }}>
            <Mono style={{ fontSize: 8.5, color: tg.c, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block' }}>{tg.label}</Mono>
            <Mono style={{ fontSize: 11.5, color: Z.ink, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{au.trigger.spec}</Mono>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', flex: '0 0 auto' }}><Icon name="arrow" size={18} style={{ color: Z.inkFaint }} /></div>

        {/* target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: Z.bg0, border: `1px solid ${accent}33`, borderRadius: 3, flex: '1 1 0', minWidth: 0 }}>
          <div style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}16`, color: accent, border: `1px solid ${accent}44` }}><Icon name={au.target.glyph} size={16} /></div>
          <div style={{ minWidth: 0 }}>
            <Mono style={{ fontSize: 8.5, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block' }}>{au.target.kind}</Mono>
            <Mono style={{ fontSize: 11.5, color: Z.ink, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{au.target.kind === 'briefing' ? 'nový briefing' : au.target.name}</Mono>
          </div>
        </div>
      </div>

      {/* approval gate */}
      {au.requiresApproval && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, padding: '8px 12px', background: `${Z.warn}0e`, border: `1px solid ${Z.warn}33`, borderRadius: 3 }}>
          <Icon name="shield" size={13} style={{ color: Z.warn, flex: '0 0 auto' }} />
          <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>výsledek (<span style={{ color: Z.warn }}>{au.gate}</span>) projde frontou schválení — neproběhne autonomně</Mono>
        </div>
      )}
      {au.actionSafeAfter && <ActionBoundaryNote value={au.actionSafeAfter} style={{ marginTop: 9 }} />}

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 12, borderTop: `1px solid ${Z.line}`, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.c, display: 'inline-block' }} />
            <Mono style={{ fontSize: 10, color: Z.inkFaint }} title={`stav: ${sm.canon}`}>poslední {au.lastRun} · <span style={{ color: sm.c }}>{sm.label}</span></Mono>
          </div>
          <Mono style={{ fontSize: 10, color: Z.inkFaint }}>příště {au.nextRun}</Mono>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GhostBtn icon="edit" accent={accent}>Upravit</GhostBtn>
          <RunBtn accent={accent} size="sm" label="Spustit teď" />
        </div>
      </div>
    </div>
  );
};

// ---- new-automation dialog ----------------------------------------------
// a action boundary. Drží stejný princip: výsledek = soubor *.cron/event.md.

const AutomationDialog = ({ accent, onClose, onAdd }) => {
  const [name, setName] = useStateAu('');
  const [trigType, setTrigType] = useStateAu('cron');
  const [spec, setSpec] = useStateAu('');
  const [tKind, setTKind] = useStateAu('agent');
  const [tName, setTName] = useStateAu('');
  const [prompt, setPrompt] = useStateAu('');
  const [gate, setGate] = useStateAu(false);
  const [gateText, setGateText] = useStateAu('');
  const [safeKind, setSafeKind] = useStateAu('time');
  const [safeAfter, setSafeAfter] = useStateAu('');
  useEffectAu(() => { setTName(''); }, [tKind]);

  const targetList = tKind === 'agent' ? AGENTS : PIPELINES;
  const glyphFor = (kind, nm) => {
    if (kind === 'pipeline') return 'flow';
    const o = AGENTS.find((x) => x.name === nm);
    return o ? o.glyph : (kind === 'agent' ? 'bot' : 'spark');
  };
  const tg = TRIG[trigType];
  const isBriefing = tKind === 'briefing';
  const valid = name.trim() && spec.trim() && (isBriefing ? prompt.trim() : tName);
  const submit = () => {
    if (!valid) return;
    const slug = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = 'au-' + (slug || ('a' + Date.now()));
    onAdd({
      id, name: name.trim(), enabled: true,
      trigger: { type: trigType, spec: spec.trim(), human: spec.trim() },
      target: { kind: tKind, name: isBriefing ? 'briefing' : tName, glyph: glyphFor(tKind, tName) },
      prompt: prompt.trim() || null,
      lastRun: '—', lastState: 'ready', nextRun: trigType === 'event' ? '— (na událost)' : spec.trim(),
      requiresApproval: gate, gate: gate ? (gateText.trim() || 'rizikový výsledek') : null,
      actionSafeAfter: safeAfter.trim() || null,
      file: `~/zibby/automations/${id}.${trigType}.md`,
    });
    onClose();
  };

  const inputStyle = (ok) => ({
    width: '100%', marginTop: 7, padding: '10px 12px', background: Z.bg0,
    border: `1px solid ${ok ? accent + '88' : Z.line}`, borderRadius: 3,
    color: Z.ink, fontFamily: Z.mono, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', background: 'rgba(3,6,12,0.72)', backdropFilter: 'blur(2px)', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 95vw)', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: Z.bg1, border: `1px solid ${accent}55`, borderRadius: 4, boxShadow: `0 0 0 1px ${accent}22, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '17px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}16`, color: accent, border: `1px solid ${accent}44` }}><Icon name="clock" size={19} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: Z.ink }}>Nová automatizace</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>trigger → cíl → gate</Mono>
          </div>
          <button onClick={onClose} style={{ display: 'flex', padding: 6, cursor: 'pointer', color: Z.inkDim, background: 'transparent', border: 'none' }}><Icon name="x" size={16} /></button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 20px', overflow: 'auto' }}>
          <FieldLabel>Název</FieldLabel>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Ranní standup" style={{ ...inputStyle(name.trim()), fontFamily: Z.sans, fontSize: 14 }} />

          {/* trigger */}
          <FieldLabel style={{ marginTop: 18 }}>Trigger</FieldLabel>
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            {['cron', 'event'].map((k) => (
              <ChipToggle key={k} active={trigType === k} accent={accent} onClick={() => setTrigType(k)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={TRIG[k].glyph} size={12} /> {k === 'cron' ? 'čas · cron' : 'událost · event'}</span>
              </ChipToggle>
            ))}
          </div>
          <input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder={trigType === 'cron' ? 'např. Po–Pá · 08:00' : 'např. soubor přibyl v /media/downloads'} style={inputStyle(spec.trim())} />

          {/* target */}
          <FieldLabel style={{ marginTop: 18 }}>Cíl</FieldLabel>
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            {[['agent', 'agent'], ['pipeline', 'pipeline'], ['briefing', 'briefing']].map(([k, lbl]) => (
              <ChipToggle key={k} active={tKind === k} accent={accent} onClick={() => setTKind(k)}>{lbl}</ChipToggle>
            ))}
          </div>

          {!isBriefing && (
            <React.Fragment>
              <FieldLabel style={{ marginTop: 18 }}>Co se má provést <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· prompt pro agenta / pipeline</span></FieldLabel>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="např. Shrň dnešní emaily a pošli mi souhrn" rows={3} style={{ ...inputStyle(prompt.trim()), fontFamily: Z.sans, fontSize: 13, resize: 'vertical', lineHeight: 1.55 }} />
            </React.Fragment>
          )}

          {isBriefing ? (
            <div style={{ marginTop: 10, padding: '11px 13px', background: Z.bg0, border: `1px solid ${accent}33`, borderRadius: 3, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon name="spark" size={14} style={{ color: accent, flex: '0 0 auto', marginTop: 1 }} />
              <Mono style={{ fontSize: 11, color: Z.inkDim, lineHeight: 1.6 }}>Trigger spustí nový briefing s výše zadaným promptem. Výsledek přistane v sekci Tasky.</Mono>
            </div>
          ) : (
            <select value={tName} onChange={(e) => setTName(e.target.value)} style={{ ...inputStyle(tName), cursor: 'pointer', appearance: 'none' }}>
              <option value="">— vyber {tKind} —</option>
              {targetList.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          )}

          {/* approval gate + action boundary — skryto pro briefing */}
          {!isBriefing && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, padding: '11px 13px', background: Z.bg0, border: `1px solid ${gate ? Z.warn + '44' : Z.line}`, borderRadius: 3 }}>
                <Icon name="shield" size={15} style={{ color: gate ? Z.warn : Z.inkFaint, flex: '0 0 auto' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Mono style={{ fontSize: 11.5, color: Z.ink }}>Výsledek projde frontou schválení</Mono>
                  <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 2 }}>rizikový výsledek neproběhne autonomně</Mono>
                </div>
                <Switch on={gate} accent={Z.warn} onToggle={() => setGate((g) => !g)} />
              </div>
              {gate && <input value={gateText} onChange={(e) => setGateText(e.target.value)} placeholder="co se gatuje, např. odeslání do Slacku" style={inputStyle(false)} />}
              <FieldLabel style={{ marginTop: 18 }}>Akce bezpečná až po <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· volitelné</span></FieldLabel>
              <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                <ChipToggle active={safeKind === 'time'} accent={accent} onClick={() => setSafeKind('time')}>čas</ChipToggle>
                <ChipToggle active={safeKind === 'cond'} accent={accent} onClick={() => setSafeKind('cond')}>podmínka</ChipToggle>
              </div>
              <input value={safeAfter} onChange={(e) => setSafeAfter(e.target.value)} placeholder={safeKind === 'cond' ? 'např. po potvrzení jídelníčku' : 'např. po 09:00'} style={inputStyle(false)} />
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 7, lineHeight: 1.5 }}>Dokud nenastane, projde i jinak bezpečná akce frontou schválení.</Mono>
            </React.Fragment>
          )}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}`, background: Z.bg0 }}>
          <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '9px 15px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
          <button onClick={submit} disabled={!valid} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, fontWeight: 600, padding: '9px 16px', cursor: valid ? 'pointer' : 'not-allowed', borderRadius: 2, color: Z.bg0, background: accent, border: 'none', opacity: valid ? 1 : 0.4 }}><Icon name="check" size={14} stroke={2} /> Vytvořit automatizaci</button>
        </div>
      </div>
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const AutomationsBody = ({ accent }) => {
  const [autos, setAutos] = useStateAu(AUTOMATIONS);
  const [adding, setAdding] = useStateAu(false);
  const toggle = (id) => setAutos((prev) => prev.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
  const add = (au) => setAutos((prev) => [au, ...prev]);
  const active = autos.filter((a) => a.enabled).length;
  const gated = autos.filter((a) => a.requiresApproval && a.enabled).length;
  const crons = autos.filter((a) => a.trigger.type === 'cron');
  const events = autos.filter((a) => a.trigger.type === 'event');

  const Section = ({ type, items }) => {
    const tg = TRIG[type];
    if (!items.length) return null;
    return (
      <div>
        <SectionLabel right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{items.length}</Mono>}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name={tg.glyph} size={13} style={{ color: tg.c }} /> {type === 'cron' ? 'Časové triggery · cron' : 'Událostní triggery · event'}
          </span>
        </SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {items.map((au) => <AutomationCard key={au.id} au={au} accent={accent} onToggle={toggle} />)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Automatizace</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              <span style={{ color: accent }}>{active} aktivních</span> · {autos.length} celkem · výsledky se objeví v ranním brífinku
            </Mono>
          </div>
          <RunBtn accent={accent} label="Nová automatizace" onClick={() => setAdding(true)} />
        </div>
        {/* autonomy / gate note */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${Z.line}` }}>
          <Icon name="shield" size={15} style={{ color: Z.warn, flex: '0 0 auto' }} />
          <Mono style={{ fontSize: 10.5, color: Z.inkDim }}>
            Tady vzniká autonomie — trigger spustí běh bez vyzvání. <span style={{ color: Z.warn }}>{gated} z nich</span> má ale rizikový výsledek, který se zastaví a počká na tvé schválení.
          </Mono>
        </div>
      </HudPanel>

      <Section type="cron" items={crons} />
      <Section type="event" items={events} />

      {autos.length === 0 && (
        <HudPanel accent={accent} pad={44}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, textAlign: 'center' }}>
            <Icon name="clock" size={26} style={{ color: Z.inkFaint }} />
            <div style={{ fontSize: 17, fontWeight: 600 }}>Žádné automatizace</div>
            <Mono style={{ fontSize: 12, color: Z.inkDim, maxWidth: 380, lineHeight: 1.55 }}>Napoj cron nebo událost na agenta, pipeline nebo briefing — a ZIBBY začne pracovat sám.</Mono>
            <RunBtn accent={accent} label="Nová automatizace" onClick={() => setAdding(true)} />
          </div>
        </HudPanel>
      )}

      {adding && <AutomationDialog accent={accent} onClose={() => setAdding(false)} onAdd={add} />}
    </div>
  );
};

Object.assign(window, { AutomationsBody, AutomationCard, AutomationDialog });

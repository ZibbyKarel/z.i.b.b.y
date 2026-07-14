// ZIBBY Velín-B — rozšířený velín (Přehled), který doplňuje mezery vůči finální vizi:
// narativní brífink · 3 tiery autonomie · sebeučení (promote) · standup taháky ·
// self-modification · přirozený příkaz. Stejný design (ZT/Z tokeny, ZtPanel…).
const { useState: useStateVB, useRef: useRefVB } = React;

const vbGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Dobrou noc';
  if (h < 10) return 'Dobré ráno';
  if (h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
};

const vbProjColor = (proj) => {
  const p = (typeof PROJECTS_DATA !== 'undefined' ? PROJECTS_DATA : []).find((x) => x.id === proj);
  return (p && p.ctx === 'home') ? ZT.riskPay : ZT.accent;
};

// malý projektový tag
const VbProj = ({ id }) => (
  <span style={{
    fontFamily: ZT.mono, fontSize: 10, color: ZT.ink3, border: `1px solid ${ZT.line}`,
    borderRadius: 4, padding: '1px 7px', whiteSpace: 'nowrap',
  }}>{id}</span>
);

// ── Tier odznak — barva nese úroveň autonomie ─────────────────────────────
const VB_TIER_META = {
  1: { c: ZT.ink3, name: 'Act silently', cz: 'provedu a zapíšu', glyph: 'shield' },
  2: { c: ZT.run, name: 'Act then report', cz: 'provedu a řeknu ti', glyph: 'pulse' },
  3: { c: ZT.wait, name: 'Surface & wait', cz: 'připravím, čekám na tebe', glyph: 'wait' },
};
const VbTierTag = ({ tier }) => {
  const m = VB_TIER_META[tier];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 7px',
      borderRadius: 999, border: `1px solid ${m.c}44`, background: `${m.c}12`,
      fontFamily: ZT.mono, fontSize: 10.5, fontWeight: 600, color: m.c, whiteSpace: 'nowrap',
    }}>
      <Icon name={m.glyph} size={11} /> Tier {tier}
    </span>
  );
};

// ── Command bar — operátor zadá směr přirozeným jazykem ───────────────────
// Vzor "Claude Code": jeden multiline vstup, @ hledá agenty/pipeliny inline
// v textu (žádné tagy nad/pod), soubory jdou přidat drag&dropem nebo sponkou/
// plus tlačítkem a taky se vloží jako @token přímo do textu. Tlačítko Spustit
// je split-button s dropdownem pro odložený start.

// slug bez diakritiky/mezer — používá se jako @token v textu
const vbSlug = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

// mapa @tokenů → typ (agent / pipeline), postavená z existujících dat
const vbMentionMap = () => {
  const m = {};
  (typeof AGENTS !== 'undefined' ? AGENTS : []).forEach((a) => {
    m[vbSlug(a.id || a.name)] = { type: 'agent', label: a.name, glyph: a.glyph || 'bot' };
  });
  (typeof PIPELINES !== 'undefined' ? PIPELINES : []).forEach((p) => {
    m[vbSlug(p.id || p.name)] = { type: 'pipeline', label: p.name, glyph: 'flow' };
  });
  return m;
};
const VB_MENTIONS = vbMentionMap();
const VB_MENTION_STYLE = {
  agent:    { c: ZT.accent },
  pipeline: { c: ZT.riskPush },
  file:     { c: ZT.ink2 },
};
const MENTION_RE = /@[\w.\-]+/g;

// HTML s inline zvýrazněnými @tokeny (pro backdrop pod textareou)
const vbHighlight = (text) => {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(MENTION_RE, (m) => {
    const slug = m.slice(1).toLowerCase();
    const known = VB_MENTIONS[slug];
    const c = known ? VB_MENTION_STYLE[known.type].c : VB_MENTION_STYLE.file.c;
    return `<mark style="background:${c}1f;box-shadow:0 0 0 1px ${c}55;color:${c};border-radius:4px;padding:1px 5px;margin:0 -5px;font-style:normal;white-space:nowrap">${m}</mark>`;
  });
};

const RUN_MODES = [
  { id: 'now', label: 'Spustit hned', short: 'Spustit', icon: 'arrow' },
  { id: 'hour', label: 'Spustit za hodinu', short: 'Spustit za hodinu', icon: 'clock' },
  { id: 'reset', label: 'Spustit po resetování limitů', short: 'Spustit po resetu limitů', icon: 'clock' },
];

const VbCommandBar = ({ accent }) => {
  const [val, setVal] = useStateVB('');
  const [ack, setAck] = useStateVB(null);
  const [runMode, setRunMode] = useStateVB('now');
  const [optsOpen, setOptsOpen] = useStateVB(false);
  const [mentionQ, setMentionQ] = useStateVB(null); // {query, start} | null
  const [mentionSel, setMentionSel] = useStateVB(0);
  const [dragOver, setDragOver] = useStateVB(false);
  const taRef = useRefVB(null);
  const bdRef = useRefVB(null);
  const fileRef = useRefVB(null);

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(200, Math.max(48, el.scrollHeight)) + 'px';
  };

  const insertToken = (token) => {
    const el = taRef.current;
    const at = el ? el.selectionStart : val.length;
    const before = val.slice(0, at);
    const after = val.slice(at);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    const next = before + sep + token + ' ' + after;
    setVal(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (before + sep + token + ' ').length;
      el.focus();
      el.setSelectionRange(pos, pos);
      autosize();
      syncScroll();
    });
  };

  const addFiles = (files) => {
    [...files].forEach((f) => insertToken('@' + vbSlug(f.name).replace(/-(?=[a-z0-9]{1,5}$)/, '.')));
  };

  const syncScroll = () => { if (bdRef.current && taRef.current) bdRef.current.scrollTop = taRef.current.scrollTop; };

  // @ autocomplete — detekuje "@dotaz" před kurzorem
  const checkMention = (text, caret) => {
    const before = text.slice(0, caret);
    const m = before.match(/@([\w.\-]*)$/);
    if (m) { setMentionQ({ query: m[1].toLowerCase(), start: caret - m[0].length }); setMentionSel(0); }
    else setMentionQ(null);
  };

  const mentionResults = () => {
    if (!mentionQ) return [];
    const q = mentionQ.query;
    const all = [
      ...(typeof AGENTS !== 'undefined' ? AGENTS : []).map((a) => ({ slug: vbSlug(a.id || a.name), label: a.name, glyph: a.glyph || 'bot', type: 'agent' })),
      ...(typeof PIPELINES !== 'undefined' ? PIPELINES : []).map((p) => ({ slug: vbSlug(p.id || p.name), label: p.name, glyph: 'flow', type: 'pipeline' })),
    ];
    return all.filter((x) => !q || x.slug.includes(q) || x.label.toLowerCase().includes(q)).slice(0, 6);
  };

  const pickMention = (item) => {
    const el = taRef.current;
    const before = val.slice(0, mentionQ.start);
    const caret = el ? el.selectionStart : val.length;
    const after = val.slice(caret);
    const token = '@' + item.slug;
    const next = before + token + ' ' + after;
    setVal(next);
    setMentionQ(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (before + token + ' ').length;
      el.focus();
      el.setSelectionRange(pos, pos);
      autosize();
      syncScroll();
    });
  };

  const submit = (text) => {
    const t = (text != null ? text : val).trim();
    if (!t) return;
    const low = t.toLowerCase();
    const route = /(backlog|implement|bug|feature|featur|pr|refactor)/.test(low)
      ? { kind: 'goal loop', exec: 'Build Feature → maker/verifier', glyph: 'flow' }
      : /(standup|sepiš|napiš|shrn)/.test(low)
        ? { kind: 'agent', exec: 'standup-gen', glyph: 'spark' }
        : /(ukliď|smaž|disk|snapshot|holly|zálo)/.test(low)
          ? { kind: 'agent', exec: 'Hospodář', glyph: 'server' }
          : { kind: 'agent', exec: 'Researcher', glyph: 'search' };
    setAck({ text: t, mode: runMode, ...route });
    setVal('');
    requestAnimationFrame(autosize);
  };

  const mode = RUN_MODES.find((m) => m.id === runMode);

  return (
    <ZtPanel pad={18} style={{ background: ZT.surfaceHi, borderColor: dragOver ? accent : ZT.lineHi, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Icon name="spark" size={15} style={{ color: accent }} />
        <span style={T.label}>Zadej směr · přirozeným jazykem</span>
        <span style={{ ...T.micro, marginLeft: 'auto' }}>@ hledá agenty a pipeliny · přetáhni soubor, nebo použij sponku</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        style={{
          position: 'relative', borderRadius: ZT.rCtl, border: `1px solid ${dragOver ? accent : ZT.line}`,
          background: ZT.bg, transition: 'border-color .14s',
        }}
      >
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, background: `${accent}12`, border: `1.5px dashed ${accent}`, borderRadius: ZT.rCtl,
            fontFamily: ZT.mono, fontSize: 12, color: accent, pointerEvents: 'none',
          }}>
            <Icon name="upload" size={15} /> Pustit sem — přidá se jako @soubor do textu
          </div>
        )}

        {/* text oblast s inline zvýrazněním @tokenů (backdrop technika) */}
        <div style={{ position: 'relative', padding: '10px 10px 6px 12px' }}>
          <div
            ref={bdRef} aria-hidden="true"
            style={{
              position: 'absolute', top: 10, left: 12, right: 10, bottom: 6,
              fontFamily: ZT.sans, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: 'transparent', overflow: 'hidden', pointerEvents: 'none', userSelect: 'none', zIndex: 0,
            }}
            dangerouslySetInnerHTML={{ __html: vbHighlight(val) + '\u200b' }}
          />
          <textarea
            ref={taRef} value={val} rows={1}
            onChange={(e) => {
              setVal(e.target.value);
              autosize();
              checkMention(e.target.value, e.target.selectionStart);
            }}
            onScroll={syncScroll}
            onKeyUp={(e) => checkMention(e.target.value, e.target.selectionStart)}
            onClick={(e) => checkMention(e.target.value, e.target.selectionStart)}
            onKeyDown={(e) => {
              if (mentionQ) {
                const res = mentionResults();
                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSel((s) => Math.min(res.length - 1, s + 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSel((s) => Math.max(0, s - 1)); return; }
                if (e.key === 'Enter' && res[mentionSel]) { e.preventDefault(); pickMention(res[mentionSel]); return; }
                if (e.key === 'Escape') { setMentionQ(null); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="Projdi backlog, najdi highest-impact bugy a implementuj je… (@agent, @pipeline, soubory drag&dropem)"
            style={{
              position: 'relative', zIndex: 1, display: 'block', width: '100%', minHeight: 48, maxHeight: 200,
              resize: 'none', overflow: 'auto', background: 'transparent', border: 'none', outline: 'none',
              color: ZT.ink, caretColor: ZT.ink, fontFamily: ZT.sans, fontSize: 14, lineHeight: 1.5,
              boxSizing: 'border-box', padding: 0,
            }}
          />

          {/* @ autocomplete — inline nad kurzorem, ale ukotvené pod textem (jednoduchá paleta) */}
          {mentionQ && mentionResults().length > 0 && (
            <div style={{
              position: 'absolute', left: 12, top: '100%', marginTop: 6, zIndex: 20, minWidth: 240,
              background: ZT.surfaceHi, border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rCtl,
              boxShadow: '0 18px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
            }}>
              {mentionResults().map((r, i) => (
                <div key={r.slug} onMouseDown={(e) => { e.preventDefault(); pickMention(r); }}
                  onMouseEnter={() => setMentionSel(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', cursor: 'pointer',
                    background: i === mentionSel ? 'rgba(255,255,255,0.06)' : 'transparent',
                  }}>
                  <Icon name={r.glyph} size={13} style={{ color: r.type === 'agent' ? ZT.accent : ZT.riskPush, flex: '0 0 auto' }} />
                  <span style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, flex: 1 }}>{r.label}</span>
                  <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.ink3 }}>@{r.slug}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* dolní lišta: sponka/plus vlevo, split run-button vpravo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 10px 10px 10px' }}>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} title="Přidat soubor"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
              borderRadius: ZT.rCtl, background: 'transparent', border: `1px solid ${ZT.line}`, color: ZT.ink2, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = ZT.lineHi; e.currentTarget.style.color = ZT.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ZT.line; e.currentTarget.style.color = ZT.ink2; }}>
            <Icon name="plus" size={13} stroke={2} />
          </button>
          <button onClick={() => fileRef.current && fileRef.current.click()} title="Připnout soubor"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
              borderRadius: ZT.rCtl, background: 'transparent', border: `1px solid ${ZT.line}`, color: ZT.ink2, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = ZT.lineHi; e.currentTarget.style.color = ZT.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ZT.line; e.currentTarget.style.color = ZT.ink2; }}>
            <Icon name="pin" size={13} />
          </button>

          <span style={{ marginLeft: 'auto' }}></span>

          {/* split button: primární akce + caret s "Options" */}
          <div style={{ display: 'inline-flex', position: 'relative' }}>
            <button onClick={() => submit()} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
              fontFamily: ZT.mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
              color: ZT.bg, background: accent, border: '1px solid transparent',
              borderRadius: '6px 0 0 6px', cursor: 'pointer',
            }}>
              <Icon name={mode.icon} size={13} stroke={2} /> {mode.short}
            </button>
            <button onClick={() => setOptsOpen((o) => !o)} title="Options" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26,
              background: accent, borderLeft: `1px solid ${ZT.bg}44`, border: '1px solid transparent',
              borderRadius: '0 6px 6px 0', color: ZT.bg, cursor: 'pointer',
            }}>
              <Icon name="chevron" size={12} stroke={2.2} style={{ transform: 'rotate(90deg)' }} />
            </button>

            {optsOpen && (
              <React.Fragment>
                <div onClick={() => setOptsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}></div>
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 11, minWidth: 240,
                  background: ZT.surfaceHi, border: `1px solid ${ZT.lineHi}`, borderRadius: ZT.rCtl,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4,
                }}>
                  <div style={{ ...T.micro, padding: '6px 9px 4px' }}>Options</div>
                  {RUN_MODES.map((m) => (
                    <div key={m.id} onClick={() => { setRunMode(m.id); setOptsOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 4, cursor: 'pointer',
                        background: m.id === runMode ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = m.id === runMode ? 'rgba(255,255,255,0.05)' : 'transparent'; }}>
                      <Icon name={m.id === runMode ? 'check' : m.icon} size={13} style={{ color: m.id === runMode ? accent : ZT.ink3, flex: '0 0 auto' }} />
                      <span style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      </div>

      {!ack ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {VB_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => submit(s)} style={{
              fontFamily: ZT.mono, fontSize: 11, color: ZT.ink2, cursor: 'pointer',
              padding: '6px 11px', borderRadius: 999, background: 'transparent',
              border: `1px solid ${ZT.line}`, transition: 'all .14s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = ZT.lineHi; e.currentTarget.style.color = ZT.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ZT.line; e.currentTarget.style.color = ZT.ink2; }}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 13, padding: '11px 13px', borderRadius: ZT.rCtl, background: `${ZT.run}10`, border: `1px solid ${ZT.run}33` }}>
          <span className="zt-anim" style={{ width: 14, height: 14, border: `1.6px solid ${ZT.run}44`, borderTopColor: ZT.run, borderRadius: '50%', display: 'inline-block', animation: 'ztSpin .7s linear infinite' }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...T.bodySm, color: ZT.ink }}>
              Klasifikováno jako <span style={{ color: ZT.run, fontFamily: ZT.mono }}>{ack.kind}</span> → spouštím <span style={{ fontFamily: ZT.mono }}>{ack.exec}</span>
              {ack.mode !== 'now' && <span style={{ color: ZT.wait }}> · {RUN_MODES.find((m) => m.id === ack.mode).label.toLowerCase()}</span>}
            </div>
            <div style={{ ...T.micro, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{ack.text}"</div>
          </div>
          <button onClick={() => setAck(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ZT.ink3, padding: 4, display: 'flex' }}><Icon name="x" size={15} /></button>
        </div>
      )}
    </ZtPanel>
  );
};

// ── Status hero — stav + pozdrav + souhrn autonomie přes noc ──────────────
const VbHero = () => {
  const o = VB_OVERNIGHT;
  const Stat = ({ n, label, c }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <span style={{ fontFamily: ZT.mono, fontSize: 19, fontWeight: 700, color: c }}>{String(n).padStart(2, '0')}</span>
      <span style={{ ...T.micro, fontSize: 11 }}>{label}</span>
    </div>
  );
  return (
    <ZtPanel pad={24} live liveColor={ZT.run}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <ZtDot state="ok" size={7} />
        <span style={{ ...T.label, color: ZT.ok }}>Nominal</span>
        <span style={{ ...T.micro, marginLeft: 6 }}>démon na {SYSTEM.host} · vzhůru {SYSTEM.uptime} · caffeinate · noční konsolidace 06:55</span>
      </div>
      <div style={{ ...T.display, marginTop: 14 }}>
        {vbGreeting()}. <span style={{ color: ZT.ink2, fontWeight: 400 }}>Přes noc jsem</span> <span style={{ color: ZT.ink3 }}>{o.silent} vyřídil sám</span>,{' '}
        <span style={{ color: ZT.run }}>{o.reported} ti reportuju</span> a <span style={{ color: ZT.wait }}>{o.waiting} čekají</span>.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ZT.line}` }}>
        <Stat n={o.silent} label="Tier 1 · zalogováno" c={ZT.ink2} />
        <Stat n={o.reported} label="Tier 2 · reporty" c={ZT.run} />
        <Stat n={o.waiting} label="Tier 3 · čeká na tebe" c={ZT.wait} />
        <Stat n={o.learned} label="vzorce naučeno" c={ZT.accent} />
      </div>
    </ZtPanel>
  );
};

// ── Brífink — narativní + řádky s akcí ────────────────────────────────────
const VbBriefRow = ({ row, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <ZtDot state={row.state} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...T.body, fontSize: 13.5, fontWeight: 500 }}>{row.title}</span>
        <VbProj id={row.proj} />
      </div>
      <div style={{ ...T.micro, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.sub}</div>
    </div>
    {row.action && (
      <ZtBtn size="sm" icon={row.action.kind === 'pr' ? 'branch' : 'retry'}>{row.action.label}</ZtBtn>
    )}
  </div>
);

const VbBriefing = () => (
  <ZtPanel title="Ranní brífink · co se stalo přes noc" pad={20} right={<span style={T.micro}>14. 6. · 06:55</span>}>
    <div style={{ ...T.body, fontSize: 14.5, lineHeight: 1.6, color: ZT.ink2, marginBottom: 6, textWrap: 'pretty' }}>
      {VB_NARRATIVE}
    </div>
    <div style={{ marginTop: 8 }}>
      {VB_NIGHT.map((r, i) => <VbBriefRow key={r.id} row={r} last={i === VB_NIGHT.length - 1} />)}
    </div>
  </ZtPanel>
);

// ── Autonomie přes noc — 3 tiery ──────────────────────────────────────────
const VbTierColumn = ({ tier, count, children }) => {
  const m = VB_TIER_META[tier];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <VbTierTag tier={tier} />
        <span style={{ ...T.micro, fontSize: 10.5 }}>{m.cz}</span>
        <span style={{ marginLeft: 'auto', fontFamily: ZT.mono, fontSize: 13, fontWeight: 700, color: m.c }}>{String(count).padStart(2, '0')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
};

const VbTierLine = ({ text, sub, proj, dim }) => (
  <div style={{ padding: '9px 11px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}` }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ ...T.bodySm, fontSize: 12.5, color: dim ? ZT.ink2 : ZT.ink, flex: 1, lineHeight: 1.45 }}>{text}</span>
      {proj && <VbProj id={proj} />}
    </div>
    {sub && <div style={{ ...T.micro, fontSize: 10.5, marginTop: 5 }}>{sub}</div>}
  </div>
);

const VbAutonomy = ({ onNav }) => (
  <ZtPanel title="Autonomie přes noc · co jsem směl a co ne" pad={20}
    right={<span style={T.micro}>gate · per-projekt, per-akce</span>}>
    <div className="vb-tiers">
      <VbTierColumn tier={1} count={VB_OVERNIGHT.silent}>
        {VB_TIER1.slice(0, 3).map((x) => <VbTierLine key={x.id} text={x.text} proj={x.proj} sub={x.at} dim />)}
        <button onClick={() => onNav && onNav('runs')} style={{ ...T.micro, color: ZT.accent, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}>
          + {VB_TIER1.length - 3} dalších v activity logu →
        </button>
      </VbTierColumn>
      <VbTierColumn tier={2} count={VB_OVERNIGHT.reported}>
        {VB_TIER2.map((x) => <VbTierLine key={x.id} text={x.text} sub={x.note} proj={x.proj} />)}
      </VbTierColumn>
      <VbTierColumn tier={3} count={VB_OVERNIGHT.waiting}>
        {VB_TIER3.map((x) => (
          <div key={x.id} style={{ padding: '9px 11px', borderRadius: ZT.rCtl, background: `${ZT.wait}0d`, border: `1px solid ${ZT.wait}33` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{ fontFamily: ZT.mono, fontSize: 12, color: ZT.wait, fontWeight: 600 }}>{x.actor}</span>
              <span style={{ marginLeft: 'auto' }}><ZtRisk risk={x.risk} /></span>
            </div>
            <div style={{ ...T.bodySm, fontSize: 12, color: ZT.ink }}>{x.action}</div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 4 }}>{x.impact} · {x.impactNote}</div>
          </div>
        ))}
        <button onClick={() => onNav && onNav('approvals')} style={{ ...T.micro, color: ZT.wait, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}>
          Vyřídit ve frontě schválení →
        </button>
      </VbTierColumn>
    </div>
  </ZtPanel>
);

// ── Sebeučení — konsolidace + vzorce + návrh promote ──────────────────────
const VbPromotion = () => {
  const [dec, setDec] = useStateVB(null);
  const p = VB_PROMOTION;
  return (
    <div style={{ padding: 15, borderRadius: ZT.rCtl, background: `${ZT.accent}0d`, border: `1px solid ${ZT.accent}40` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Icon name="spark" size={14} style={{ color: ZT.accent }} />
        <span style={{ ...T.label, color: ZT.accent }}>Návrh povýšení autonomie</span>
      </div>
      <div style={{ ...T.body, fontSize: 13.5, lineHeight: 1.5 }}>
        Vzorec <span style={{ fontWeight: 600 }}>„{p.pattern}"</span> jsi {p.evidence}. Mám to od teď dělat sám?
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '11px 0 13px' }}>
        <VbTierTag tier={p.fromTier} />
        <Icon name="arrow" size={15} style={{ color: ZT.ink3 }} />
        <VbTierTag tier={p.toTier} />
        <VbProj id={p.proj} />
      </div>
      {dec ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: ZT.rCtl, background: dec === 'ok' ? `${ZT.ok}10` : 'rgba(255,255,255,0.03)', border: `1px solid ${dec === 'ok' ? ZT.ok + '33' : ZT.line}` }}>
          <Icon name={dec === 'ok' ? 'check' : 'x'} size={14} style={{ color: dec === 'ok' ? ZT.ok : ZT.ink3 }} />
          <span style={{ ...T.bodySm, color: dec === 'ok' ? ZT.ok : ZT.ink3 }}>
            {dec === 'ok' ? 'Povýšeno na Tier 1 · zapsáno do gate pravidel projektu' : 'Necháno na Tier 3 · ptám se dál'}
          </span>
          <button onClick={() => setDec(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', ...T.micro, color: ZT.ink3 }}>vrátit</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 9 }}>
          <ZtBtn variant="primary" size="sm" icon="check" onClick={() => setDec('ok')}>Ano, dělej to sám</ZtBtn>
          <ZtBtn variant="ghost" size="sm" icon="x" onClick={() => setDec('no')}>Ptej se dál</ZtBtn>
        </div>
      )}
    </div>
  );
};

const VbLearning = ({ onNav }) => (
  <ZtPanel title="Co jsem se naučil · noční konsolidace" pad={20}
    right={<span style={{ ...T.micro }}><Icon name="brain" size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5, color: ZT.ink3 }} />semantic memory</span>}>
    <div style={{ ...T.bodySm, marginBottom: 14 }}>{VB_CONSOLIDATION}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
      {VB_PATTERNS.map((p) => (
        <div key={p.id} onClick={() => onNav && onNav('memory')} title="otevřít ve vaultu" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: ZT.rCtl, background: ZT.bg, border: `1px solid ${ZT.line}`, cursor: 'pointer' }}>
          <Icon name="doc" size={15} style={{ color: ZT.ink3, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink }}>{p.text}</div>
            <div style={{ ...T.micro, fontSize: 10, marginTop: 3 }}>vault/patterns/{p.file}</div>
          </div>
          <span style={{ fontFamily: ZT.mono, fontSize: 10.5, color: ZT.ink3, whiteSpace: 'nowrap' }}>{p.evidence}</span>
        </div>
      ))}
    </div>
    <VbPromotion />
  </ZtPanel>
);

// ── Standup taháky ────────────────────────────────────────────────────────
const VbStandupCard = ({ s }) => {
  const [copied, setCopied] = useStateVB(false);
  const c = vbProjColor(s.proj);
  const lines = [
    `Standup — ${s.proj} (${s.time})`,
    `Včera/přes noc: ${s.done.join('; ')}`,
    `Dnes: ${s.today.join('; ')}`,
    s.blockers.length ? `Blokery: ${s.blockers.join('; ')}` : 'Blokery: žádné',
  ].join('\n');
  const copy = () => { try { navigator.clipboard.writeText(lines); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const Row = ({ label, items, color }) => (
    <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
      <span style={{ ...T.micro, fontSize: 10, width: 56, flex: '0 0 56px', color: ZT.ink3 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length ? items.map((it, i) => (
          <span key={i} style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink }}>{it}</span>
        )) : <span style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink3 }}>—</span>}
      </div>
    </div>
  );
  return (
    <ZtPanel pad={16} hi={false} style={{ borderColor: ZT.line }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
        <span style={{ fontFamily: ZT.mono, fontSize: 13, fontWeight: 700, color: ZT.ink }}>{s.proj}</span>
        <span style={{ ...T.micro, fontSize: 10.5 }}>{s.role}</span>
        <span style={{ marginLeft: 'auto', fontFamily: ZT.mono, fontSize: 11, color: s.time === '—' ? ZT.ink3 : c }}>{s.time === '—' ? 'bez standupu' : '⏱ ' + s.time}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row label="HOTOVO" items={s.done} />
        <Row label="DNES" items={s.today} />
        {s.blockers.length > 0 && <Row label="BLOKERY" items={s.blockers} />}
      </div>
      <div style={{ marginTop: 14 }}>
        <ZtBtn size="sm" icon={copied ? 'check' : 'doc'} onClick={copy}>{copied ? 'Zkopírováno' : 'Kopírovat tahák'}</ZtBtn>
      </div>
    </ZtPanel>
  );
};

const VbStandups = () => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
      <span style={T.label}>Standup taháky · per aktivní projekt</span>
      <span style={{ ...T.micro, marginLeft: 'auto' }}>generuje standup-gen z gitu + Jira</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
      {VB_STANDUPS.map((s) => <VbStandupCard key={s.id} s={s} />)}
    </div>
  </div>
);

// ── Self-modification ─────────────────────────────────────────────────────
const VbSelfMod = ({ onNav }) => {
  const [dec, setDec] = useStateVB(null);
  const s = VB_SELFMOD;
  return (
    <ZtPanel title="Self-modification · ZIBBY vylepšuje sebe" pad={20}
      right={<span style={{ ...T.micro, color: ZT.wait }}>{s.gate}</span>}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: ZT.rCtl, display: 'grid', placeItems: 'center', background: `${ZT.riskPush}16`, color: ZT.riskPush, border: `1px solid ${ZT.riskPush}44` }}>
          <Icon name="branch" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...T.body, fontSize: 14.5, fontWeight: 600 }}>{s.title}</div>
          <div style={{ ...T.bodySm, marginTop: 6, textWrap: 'pretty' }}>{s.detail}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
            <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.ink, padding: '3px 9px', borderRadius: 4, background: ZT.bg, border: `1px solid ${ZT.line}` }}>{s.pr}</span>
            <span style={{ fontFamily: ZT.mono, fontSize: 11, color: ZT.ink3 }}>{s.diff}</span>
            <VbTierTag tier={3} />
          </div>
          {dec ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, padding: '9px 11px', borderRadius: ZT.rCtl, background: dec === 'ok' ? `${ZT.ok}10` : 'rgba(255,255,255,0.03)', border: `1px solid ${dec === 'ok' ? ZT.ok + '33' : ZT.line}` }}>
              <Icon name={dec === 'ok' ? 'check' : 'x'} size={14} style={{ color: dec === 'ok' ? ZT.ok : ZT.ink3 }} />
              <span style={{ ...T.bodySm, color: dec === 'ok' ? ZT.ok : ZT.ink3 }}>
                {dec === 'ok' ? 'Merge schválen · ZIBBY tuhle schopnost po nasazení umí' : 'PR ponechán otevřený'}
              </span>
              <button onClick={() => setDec(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', ...T.micro, color: ZT.ink3 }}>vrátit</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <ZtBtn variant="primary" size="sm" icon="check" onClick={() => setDec('ok')}>Schválit merge</ZtBtn>
              <ZtBtn variant="ghost" size="sm" icon="branch" onClick={() => onNav && onNav('runs')}>Zobrazit PR</ZtBtn>
            </div>
          )}
        </div>
      </div>
    </ZtPanel>
  );
};

// ── Pravý rail — schválení · běží · limity ────────────────────────────────
const VbRail = ({ onNav }) => {
  const r = CLAUDE_LIMITS.rolling, w = CLAUDE_LIMITS.weekly;
  const LimRow = ({ label, d }) => {
    const c = d.usedPct >= 85 ? ZT.bad : d.usedPct >= 60 ? ZT.wait : ZT.ink2;
    return (
      <div style={{ padding: '9px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span style={{ ...T.micro, color: ZT.ink2 }}>{label}</span>
          <span style={{ fontFamily: ZT.mono, fontSize: 12, fontWeight: 600, color: d.usedPct >= 60 ? c : ZT.ink }}>{d.usedPct} %</span>
        </div>
        <ZtMeter pct={d.usedPct} color={d.usedPct >= 60 ? c : 'rgba(255,255,255,0.28)'} h={4} />
        <div style={{ ...T.micro, fontSize: 10.5, marginTop: 6 }}>reset {d.resetIn} · {d.tokens}</div>
      </div>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ ...T.label, marginBottom: 12 }}>Čeká na tebe · {VB_TIER3.length}</div>
        <ZtApproval density="rail" onDecide={() => {}} a={{
          actor: VB_TIER3[0].actor, action: VB_TIER3[0].action, risk: VB_TIER3[0].risk,
          impact: VB_TIER3[0].impact, impactNote: VB_TIER3[0].impactNote, detailLink: 'náhled diffu',
        }} />
        <div style={{ marginTop: 10 }}>
          <ZtBtn size="sm" icon="arrow" onClick={() => onNav && onNav('approvals')}>Celá fronta ({VB_TIER3.length})</ZtBtn>
        </div>
      </div>

      <ZtPanel title="Běží" live liveColor={ZT.run} pad={18} right={<span style={T.micro}>{RUNNING_AGENTS.length} agenti</span>}>
        {RUNNING_AGENTS.map((a, i) => (
          <div key={a.id} style={{ padding: '10px 0', borderBottom: i < RUNNING_AGENTS.length - 1 ? `1px solid ${ZT.line}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <ZtDot state="run" size={6} />
              <span style={{ fontFamily: ZT.mono, fontSize: 12.5, fontWeight: 600, color: ZT.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.skill}</span>
              <span style={{ ...T.micro, color: ZT.run }}>{a.pct} %</span>
            </div>
            <div style={{ ...T.micro, margin: '5px 0 7px', paddingLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.prompt}</div>
            <div style={{ paddingLeft: 14 }}><ZtMeter pct={a.pct} color={ZT.run} /></div>
          </div>
        ))}
        <div style={{ marginTop: 10 }}><ZtBtn size="sm" icon="pulse" onClick={() => onNav && onNav('runs')}>Otevřít aktivitu</ZtBtn></div>
      </ZtPanel>

      <ZtPanel title="Limity" pad={18} right={<span style={T.micro}>jediný domov limitů</span>}>
        <LimRow label="Claude · 5h" d={r} />
        <LimRow label="Claude · týden" d={w} />
      </ZtPanel>
    </div>
  );
};

// ── Tělo Velínu-B ─────────────────────────────────────────────────────────
const VelinBBody = ({ onNav }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
    <VbHero />
    <VbCommandBar accent={ZT.accent} />
    <VbBriefing />
    <VbAutonomy onNav={onNav} />
    <VbLearning onNav={onNav} />
    <VbStandups />
    <VbSelfMod onNav={onNav} />
  </div>
);

// ── App-B ─────────────────────────────────────────────────────────────────
function AppB() {
  const [lang, setLang] = useStateVB('cs');
  const accent = accentOf();
  // mimo Přehled žije ve full velínu (ZIBBY Velin.html)
  const go = (id) => { if (id && id !== 'overview') window.location.href = 'ZIBBY Velin.html'; };

  return (
    <Frame skin="velin">
      <Sidebar active="overview" accent={accent} onNav={go} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar accent={accent} nav="overview" lang={lang} onLang={setLang} />
        <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '24px 26px' }}>
          <VelinBBody onNav={go} />
        </div>
      </div>
      <div style={{ width: 340, flex: '0 0 340px', borderLeft: `1px solid ${ZT.line}`, background: ZT.bg, overflow: 'auto', padding: '24px 18px' }}>
        <VbRail onNav={go} />
      </div>
    </Frame>
  );
}

Object.assign(window, { AppB });

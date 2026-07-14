// ZIBBY Velín-D — chatovací HUD dokovaný uprostřed spodní části obrazovky.
// Historie postupně mizí směrem nahoru (mask-image), aby nezasahovala do
// prostoru orbů. Vstupní pole je vždy pevně dole, jako zadávání úkolů.
const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat, useMemo: useMemoChat } = React;

const VC_CHAT_SEED = [
  { who: 'zibby', text: 'Dobré ráno. Přes noc doběhly 2 úlohy, čekám na tvé schválení u plateb dodavatelům.' },
  { who: 'me',    text: 'Ukaž mi ty platby.' },
  { who: 'zibby', text: 'Otevírám Finance — 3 faktury, celkem 42 300 Kč. Nejvyšší je od Studio Lumen.' },
];

// ── Zdroje pro "@" nápovědu — subsystémy, pipeliny, agenti, projekty ──────
const VC_PROJECTS = ['auth-svc', 'zibby-core', 'home-ops'];
const VC_MENTION_ITEMS = (() => {
  const items = [];
  VC_SUBSYSTEMS.forEach((s) => {
    items.push({ kind: 'subsystem', label: s.name, sub: s.mandate, hue: s.hue, glyph: s.glyph });
    (s.pipelines || []).forEach((p) => items.push({ kind: 'pipeline', label: p, sub: `pipelina · ${s.name}`, hue: s.hue, glyph: 'flow' }));
    (s.crew || []).forEach((c) => {
      const name = typeof c === 'string' ? c : c.name;
      const glyph = typeof c === 'string' ? 'bot' : (c.glyph || 'bot');
      if (!items.some((it) => it.kind === 'agent' && it.label === name)) items.push({ kind: 'agent', label: name, sub: `agent · ${s.name}`, hue: s.hue, glyph });
    });
  });
  VC_PROJECTS.forEach((p) => items.push({ kind: 'project', label: p, sub: 'projekt', hue: ZT.ink3, glyph: 'doc' }));
  return items;
})();
const VC_MENTION_KIND_LABEL = { subsystem: 'subsystém', pipeline: 'pipelina', agent: 'agent', project: 'projekt' };

const VC_DETECT_MENTION = (text, caret) => {
  const upto = text.slice(0, caret);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(upto);
  if (!m) return null;
  return { start: m.index + m[0].indexOf('@'), query: m[1] };
};

// Zprávy rozlišujeme jen barvou/zarovnáním — bez popisku "ZIBBY" u každé zprávy.
const VcChatMsg = ({ m }) => {
  const mine = m.who === 'me';
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '82%', padding: '9px 13px', borderRadius: ZT.rPanel,
        background: mine ? ZT.accent : 'rgba(255,255,255,0.05)',
        border: `1px solid ${mine ? ZT.accent : ZT.lineHi}`,
        color: mine ? ZT.bg : ZT.ink,
        fontFamily: ZT.sans, fontSize: 13, fontWeight: mine ? 500 : 400, lineHeight: 1.5, textWrap: 'pretty',
      }}>
        {m.text}
      </div>
    </div>
  );
};

// ── Nápovědní plachta pro "@" — subsystémy / pipeliny / agenty / projekty ──
const VcMentionMenu = ({ query, active, onPick }) => {
  const filtered = useMemoChat(() => {
    const q = query.toLowerCase();
    return VC_MENTION_ITEMS.filter((it) => it.label.toLowerCase().includes(q)).slice(0, 7);
  }, [query]);
  if (filtered.length === 0) return null;
  return (
    <div style={{
      position: 'absolute', left: 10, right: 10, bottom: 'calc(100% + 8px)', zIndex: 20,
      borderRadius: ZT.rPanel, background: ZT.surfaceHi, border: `1px solid ${ZT.lineHi}`,
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)', overflow: 'hidden', animation: 'ztFadeUp .16s ease both',
    }}>
      {filtered.map((it, i) => (
        <div key={it.kind + it.label} onMouseDown={(e) => { e.preventDefault(); onPick(it); }} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
          background: i === active ? 'rgba(255,255,255,0.07)' : 'transparent', cursor: 'pointer',
          borderTop: i === 0 ? 'none' : `1px solid ${ZT.line}`,
        }}>
          <span style={{ width: 24, height: 24, borderRadius: ZT.rCtl, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `${it.hue}22`, color: it.hue, border: `1px solid ${it.hue}44` }}>
            <Icon name={it.glyph} size={13} />
          </span>
          <span style={{ ...T.bodySm, fontSize: 13, color: ZT.ink, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <span style={{ ...T.micro, fontSize: 10, flex: '0 0 auto' }}>{VC_MENTION_KIND_LABEL[it.kind]}</span>
        </div>
      ))}
    </div>
  );
};

const VC_HANDSFREE_TURNS = [
  { me: 'Kolik úloh teď běží?', zibby: '4 úlohy pracují — Forge, Scout, Sentinel a Puls. Nic nečeká na tvé schválení kromě plateb.' },
  { me: 'Dej mi vědět, až Sentinel skončí sken.', zibby: 'Jasně, ozvu se hlasem, jakmile Sentinel dokončí sken závislostí.' },
];

const VcChatDock = ({ dimmed, onFocusChange }) => {
  const [msgs, setMsgs] = useStateChat(VC_CHAT_SEED);
  const [val, setVal] = useStateChat('');
  const [focused, setFocused] = useStateChat(false);
  const [files, setFiles] = useStateChat([]);
  const [mention, setMention] = useStateChat(null); // { start, query, active }
  const [handsFree, setHandsFree] = useStateChat(false);
  const histRef = useRefChat(null);
  const taRef = useRefChat(null);
  const fileInputRef = useRefChat(null);
  const stickToBottom = useRefChat(true);
  const handsFreeTurn = useRefChat(0);
  const handsFreeTimer = useRefChat(null);

  useEffectChat(() => {
    if (histRef.current && stickToBottom.current) histRef.current.scrollTop = histRef.current.scrollHeight;
  }, [msgs, focused]);

  useEffectChat(() => {
    if (!handsFree) { clearTimeout(handsFreeTimer.current); return; }
    const runTurn = () => {
      const turn = VC_HANDSFREE_TURNS[handsFreeTurn.current % VC_HANDSFREE_TURNS.length];
      handsFreeTurn.current += 1;
      stickToBottom.current = true;
      setMsgs((m) => [...m, { who: 'me', text: turn.me }]);
      handsFreeTimer.current = setTimeout(() => {
        stickToBottom.current = true;
        setMsgs((m) => [...m, { who: 'zibby', text: turn.zibby }]);
        handsFreeTimer.current = setTimeout(runTurn, 4200);
      }, 1100);
    };
    handsFreeTimer.current = setTimeout(runTurn, 1400);
    return () => clearTimeout(handsFreeTimer.current);
  }, [handsFree]);

  const send = () => {
    const t = val.trim();
    if (!t) return;
    stickToBottom.current = true;
    setMsgs((m) => [...m, { who: 'me', text: t }]);
    setVal('');
    setFiles([]);
    setMention(null);
    setTimeout(() => {
      stickToBottom.current = true;
      setMsgs((m) => [...m, { who: 'zibby', text: 'Rozumím, zpracovávám to.' }]);
    }, 700);
  };

  const onChangeVal = (e) => {
    const t = e.target.value;
    setVal(t);
    const caret = e.target.selectionStart;
    const found = VC_DETECT_MENTION(t, caret);
    setMention(found ? { ...found, active: 0 } : null);
  };

  const pickMention = (item) => {
    if (!mention) return;
    const before = val.slice(0, mention.start);
    const after = val.slice(mention.start + 1 + mention.query.length);
    const insert = '@' + item.label + ' ';
    const next = before + insert + after;
    setVal(next);
    setMention(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      const pos = before.length + insert.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const mentionList = useMemoChat(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return VC_MENTION_ITEMS.filter((it) => it.label.toLowerCase().includes(q)).slice(0, 7);
  }, [mention]);

  const onKey = (e) => {
    if (mention && mentionList.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => ({ ...m, active: (m.active + 1) % mentionList.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => ({ ...m, active: (m.active - 1 + mentionList.length) % mentionList.length })); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[mention.active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onHistScroll = () => {
    const el = histRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || []).map((f) => f.name);
    if (list.length) setFiles((f) => [...f, ...list]);
    e.target.value = '';
  };

  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 26, transform: 'translateX(-50%)',
      width: 'min(640px, 92%)', zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      opacity: dimmed ? 0.28 : 1, filter: dimmed ? 'blur(2px)' : 'none',
      pointerEvents: dimmed ? 'none' : 'auto', transition: 'opacity .4s, filter .4s',
    }}>
      {mention && <VcMentionMenu query={mention.query} active={mention.active} onPick={pickMention} />}
      {/* jedno "liquid glass" tělo — vstup je vždy na stejném místě dole,
          historie se nad ním jen rozbaluje/sbaluje, nic neposkakuje pod kurzorem */}
      <div style={{
        display: 'flex', flexDirection: 'column', position: 'relative',
        borderRadius: 26,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: `1px solid ${focused ? ZT.accent + '4d' : 'rgba(255,255,255,0.12)'}`,
        boxShadow: focused
          ? `0 0 0 1px ${ZT.accent}30, inset 0 1px 0 rgba(255,255,255,0.16), 0 26px 60px rgba(0,0,0,0.55)`
          : `inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)`,
        transition: 'border-color .25s, box-shadow .3s',
        overflow: 'hidden',
      }}>
        {msgs.length > 0 && (
          <button onClick={() => { setMsgs([]); setVal(''); setFiles([]); setMention(null); stickToBottom.current = true; }}
            title="Nový chat (smazat historii)" style={{
              position: 'absolute', right: 10, bottom: 58, zIndex: 5,
              width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
              border: `1px solid ${ZT.lineHi}`, cursor: 'pointer', background: 'rgba(16,21,28,0.85)', color: ZT.ink3,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'color .16s, background .16s, border-color .16s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = ZT.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,21,28,0.85)'; e.currentTarget.style.color = ZT.ink3; }}>
            <Icon name="trash" size={13} />
          </button>
        )}
        {/* historie — sbalená pořád scrollovatelná, focus jen zvětší okno */}
        <div
          ref={histRef}
          onScroll={onHistScroll}
          style={{
            maxHeight: focused ? 'min(50vh, 460px)' : 128,
            overflowY: 'auto', overflowX: 'hidden',
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: '14px 14px 10px',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 20px)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20px)',
            transition: 'max-height .38s cubic-bezier(.2,.8,.2,1)',
          }}>
          {msgs.map((m, i) => <VcChatMsg key={i} m={m} />)}
        </div>

        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 10px' }}>
            {files.map((f, i) => (
              <span key={f + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: ZT.mono, fontSize: 10.5, color: ZT.ink2, border: `1px solid ${ZT.lineHi}`, borderRadius: 999, padding: '3px 9px 3px 10px', background: 'rgba(255,255,255,0.04)' }}>
                <Icon name="file" size={10} style={{ color: ZT.ink3 }} /> {f}
                <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', cursor: 'pointer', color: ZT.ink3 }}><Icon name="x" size={10} /></button>
              </span>
            ))}
          </div>
        )}

        {/* vstupní pole — pevná pozice, nikdy se nehýbe */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 6, padding: '10px 10px 10px 8px',
          borderTop: `1px solid ${focused ? ZT.accent + '30' : 'rgba(255,255,255,0.08)'}`,
          transition: 'border-color .25s',
        }}>
          <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Přidat přílohu" style={{
            width: 32, height: 32, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
            border: 'none', cursor: 'pointer', background: 'transparent', color: ZT.ink3, transition: 'color .16s, background .16s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = ZT.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ZT.ink3; }}>
            <Icon name="paperclip" size={16} />
          </button>
          <button onClick={() => setHandsFree((h) => !h)} title={handsFree ? 'Vypnout hands-free' : 'Zapnout hands-free (diktování)'} style={{
            width: 32, height: 32, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', position: 'relative',
            border: 'none', cursor: 'pointer', background: handsFree ? ZT.accent : 'transparent', color: handsFree ? ZT.bg : ZT.ink3, transition: 'color .16s, background .16s',
          }}
            onMouseEnter={(e) => { if (!handsFree) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = ZT.ink; } }}
            onMouseLeave={(e) => { if (!handsFree) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ZT.ink3; } }}>
            {handsFree && <span className="zt-anim" style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1.5px solid ${ZT.accent}`, animation: 'ztRingOut 1.6s ease-out infinite' }} />}
            <Icon name="mic" size={16} />
          </button>
          <textarea
            ref={taRef}
            value={val}
            onChange={onChangeVal}
            onKeyDown={onKey}
            onFocus={() => { setFocused(true); onFocusChange && onFocusChange(true); }}
            onBlur={() => { setFocused(false); onFocusChange && onFocusChange(false); setTimeout(() => setMention(null), 120); }}
            placeholder={handsFree ? 'Poslouchám…' : 'Zadej úkol ZIBBY… ("@" pro subsystém, agenta, pipelinu…)'}
            disabled={handsFree}
            rows={1}
            style={{
              flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none',
              fontFamily: ZT.sans, fontSize: 14, lineHeight: 1.4, color: ZT.ink, padding: '4px 0 4px 4px',
              maxHeight: 90, minHeight: 22,
            }}
          />
          <button onClick={send} disabled={!val.trim()} title="Odeslat" style={{
            width: 32, height: 32, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
            border: 'none', cursor: val.trim() ? 'pointer' : 'default',
            background: val.trim() ? ZT.accent : 'rgba(255,255,255,0.08)',
            color: val.trim() ? ZT.bg : ZT.ink3, transition: 'background .16s, color .16s',
          }}>
            <Icon name="arrow" size={15} stroke={2.2} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { VcChatDock });

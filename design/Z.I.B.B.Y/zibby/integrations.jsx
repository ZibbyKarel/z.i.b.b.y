// ZIBBY velín — Integrace: připojené nástrojové zdroje.
// Dva druhy: MCP servery a CLI nástroje. Karta = jeden zdroj nástrojů.
// Rizikové nástroje (risky[]) jsou označené a krmí approval gate skillů/agentů.
const { useState: useStateIn } = React;

// druh integrace
const INT_KIND = {
  mcp: { label: 'MCP server', glyph: 'plug', c: '#56c4d6' },
  cli: { label: 'CLI nástroj', glyph: 'code', c: '#7fd98a' },
};

// tool chip — rizikové nástroje (objednat/smazat/push/odeslat) označené
const PermChip = ({ tool, risky }) => {
  const c = risky ? Z.warn : '#56c4d6';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 9.5, fontWeight: 600,
      padding: '3px 8px', borderRadius: 2, color: c, background: `${c}16`, border: `1px solid ${c}44`, whiteSpace: 'nowrap',
    }}>
      {risky && <Icon name="shield" size={10} />}{tool}
    </span>
  );
};

// malý odznak druhu (MCP / CLI)
const KindBadge = ({ kind }) => {
  const k = INT_KIND[kind] || INT_KIND.mcp;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2,
      color: k.c, background: `${k.c}16`, border: `1px solid ${k.c}44`, whiteSpace: 'nowrap',
    }}>
      <Icon name={k.glyph} size={10} /> {kind}
    </span>
  );
};

// ---- integration card ----------------------------------------------------
const IntegrationCard = ({ it, accent, onOpen }) => {
  const [h, setH] = useStateIn(false);
  const k = INT_KIND[it.kind] || INT_KIND.mcp;
  const off = !it.enabled;
  return (
    <div onClick={() => onOpen(it.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: h && !off ? Z.panelHi : Z.panel,
        border: `1px solid ${h && !off ? accent + '55' : Z.line}`, borderRadius: Z.rPanel,
        padding: 16, cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column',
        boxShadow: h && !off ? '0 8px 26px rgba(0,0,0,0.4)' : 'none', opacity: off ? 0.6 : 1,
      }}>
      {h && !off && <Corners color={accent} inset={5} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${k.c}14`, color: k.c, border: `1px solid ${k.c}33` }}>
          <Icon name={it.glyph} size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: Z.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
            <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}><Dot color={off ? Z.inkFaint : Z.ok} pulse={!off} size={7} /></span>
          </div>
          <div style={{ fontSize: 11.5, color: Z.inkDim, marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.desc}</div>
        </div>
      </div>

      {/* kind + transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <KindBadge kind={it.kind} />
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.transport}</Mono>
      </div>

      {/* tools */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
        {it.tools.map((t) => <PermChip key={t} tool={t} risky={it.risky.includes(t)} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTop: `1px solid ${Z.line}` }}>
        <Mono style={{ fontSize: 9.5, color: Z.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{it.usedBy.length} skill{it.usedBy.length === 1 ? '' : 'ů'}{it.risky.length ? ` · ${it.risky.length} rizik.` : ''}</Mono>
        <GhostBtn icon="gear" accent={accent}>Spravovat</GhostBtn>
      </div>
    </div>
  );
};

// ---- detail / manage modal ----------------------------------------------
const IntegrationModal = ({ it, accent, onClose, onToggle, onRemove }) => {
  const k = INT_KIND[it.kind] || INT_KIND.mcp;
  const off = !it.enabled;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '100%', maxHeight: '90%', display: 'flex', flexDirection: 'column', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${k.c}14`, color: k.c, border: `1px solid ${k.c}44` }}><Icon name={it.glyph} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{it.name}</div>
              <KindBadge kind={it.kind} />
            </div>
            <Mono style={{ fontSize: 10.5, color: Z.inkDim, display: 'block', marginTop: 4 }}>{it.transport}</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: 20, overflow: 'auto' }}>
          <div style={{ fontSize: 13.5, color: Z.inkDim, lineHeight: 1.55 }}>{it.desc}</div>

          {/* enable */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '11px 13px', background: Z.bg0, border: `1px solid ${off ? Z.line : Z.ok + '33'}`, borderRadius: 3 }}>
            <Dot color={off ? Z.inkFaint : Z.ok} pulse={!off} size={7} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Mono style={{ fontSize: 11.5, color: Z.ink }}>{off ? 'Vypnuto' : 'Povoleno'}</Mono>
              <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 2 }}>{off ? 'skilly/agenti tento zdroj nedostanou' : `naposledy použito ${it.lastUsed}`}</Mono>
            </div>
            <Switch on={it.enabled} accent={accent} onToggle={() => onToggle(it.id)} />
          </div>

          {/* tools */}
          <FieldLabel style={{ marginTop: 18 }}>Nástroje</FieldLabel>
          <Mono style={{ fontSize: 10, color: Z.inkFaint, display: 'block', marginTop: 5 }}>Rizikové nástroje (<span style={{ color: Z.warn }}>⛨</span>) vždy projdou approval frontou, i když je zdroj povolený.</Mono>
          <div style={{ marginTop: 10, border: `1px solid ${Z.line}`, borderRadius: 3, overflow: 'hidden' }}>
            {it.tools.map((t, i) => {
              const risky = it.risky.includes(t);
              return (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderBottom: i < it.tools.length - 1 ? `1px solid ${Z.line}` : 'none', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  {risky ? <Icon name="shield" size={14} style={{ color: Z.warn }} /> : <Icon name={k.glyph} size={14} style={{ color: k.c }} />}
                  <Mono style={{ fontSize: 12, color: Z.ink, flex: 1 }}>{t}</Mono>
                  {risky && <Mono style={{ fontSize: 9, color: Z.warn, letterSpacing: '0.06em' }}>RIZIKOVÉ</Mono>}
                </div>
              );
            })}
          </div>

          {/* used by */}
          <FieldLabel style={{ marginTop: 18 }}>Používají</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {it.usedBy.length ? it.usedBy.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: Z.mono, fontSize: 11, color: Z.inkDim, padding: '5px 10px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 2 }}>
                <Icon name="spark" size={11} style={{ color: accent }} />{s}
              </span>
            )) : <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Zatím nikdo — volné k použití.</Mono>}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          <button onClick={() => { onRemove(it.id); onClose(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}><Icon name="trash" size={13} /> Odebrat</button>
          <RunBtn accent={accent} label="Hotovo" onClick={onClose} />
        </div>
      </div>
    </div>
  );
};

// ---- main body -----------------------------------------------------------
const IntegrationsBody = ({ accent }) => {
  const [list, setList] = useStateIn(INTEGRATIONS);
  const [openId, setOpenId] = useStateIn(null);
  const open = list.find((i) => i.id === openId) || null;
  const toggle = (id) => setList((prev) => prev.map((i) => i.id === id ? { ...i, enabled: !i.enabled } : i));
  const remove = (id) => setList((prev) => prev.filter((i) => i.id !== id));

  const mcp = list.filter((i) => i.kind === 'mcp');
  const cli = list.filter((i) => i.kind === 'cli');
  const riskyCount = list.reduce((n, i) => n + i.risky.length, 0);

  const Section = ({ kind, items }) => {
    const k = INT_KIND[kind];
    if (!items.length) return null;
    return (
      <div>
        <SectionLabel right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{items.length}</Mono>}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name={k.glyph} size={13} style={{ color: k.c }} /> {kind === 'mcp' ? 'MCP servery' : 'CLI nástroje'}</span>
        </SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 13 }}>
          {items.map((it) => <IntegrationCard key={it.id} it={it} accent={accent} onOpen={setOpenId} />)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Integrace</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              <span style={{ color: '#56c4d6' }}>{mcp.length} MCP</span> · <span style={{ color: '#7fd98a' }}>{cli.length} CLI</span> · <span style={{ color: Z.warn }}>{riskyCount} rizikových nástrojů</span> · brány k nástrojům pro skilly &amp; agenty
            </Mono>
          </div>
          <RunBtn accent={accent} label="Přidat integraci" />
        </div>
      </HudPanel>

      <Section kind="mcp" items={mcp} />
      <Section kind="cli" items={cli} />

      {/* catalog (add more) */}
      <div>
        <SectionLabel>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="plus" size={13} style={{ color: Z.inkFaint }} /> Dostupné k připojení</span>
        </SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 13 }}>
          {INTEGRATION_CATALOG.map((c) => {
            const ck = INT_KIND[c.kind] || INT_KIND.mcp;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: Z.panel, border: `1px dashed ${Z.line}`, borderRadius: 2 }}>
                <div style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: Z.bg0, color: ck.c, border: `1px solid ${Z.line}` }}><Icon name={c.glyph} size={18} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: Z.inkDim }}>{c.name}</div>
                  <Mono style={{ fontSize: 9.5, color: Z.inkFaint, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.desc}</Mono>
                </div>
                <button title="Připojit" style={{ width: 28, height: 28, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: 2, cursor: 'pointer', color: accent, background: 'transparent', border: `1px solid ${accent}55` }}><Icon name="plus" size={14} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {open && <IntegrationModal key={open.id} it={open} accent={accent} onClose={() => setOpenId(null)} onToggle={toggle} onRemove={remove} />}
    </div>
  );
};

Object.assign(window, { IntegrationsBody, IntegrationCard, IntegrationModal });

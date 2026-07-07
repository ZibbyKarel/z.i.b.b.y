// ZIBBY redesign — canvas boardy: approval before/after · tokeny · flow

// poznámka na boardu
const ZtNote = ({ children, style }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', ...style }}>
    <span style={{ width: 14, height: 1.5, background: ZT.accent, flex: '0 0 auto', marginTop: 7 }}></span>
    <span style={{ fontFamily: ZT.mono, fontSize: 10.5, lineHeight: 1.6, color: ZT.ink2 }}>{children}</span>
  </div>
);

// ---- APPROVAL · BEFORE — tři dnešní podoby vedle sebe -------------------------
const ApprovalBeforeBoard = () => (
  <div style={{ width: '100%', height: '100%', background: Z.bg1, padding: 28, display: 'grid', gridTemplateColumns: '320px minmax(0,1fr) 250px', gap: 26, alignItems: 'start', fontFamily: Z.sans, color: Z.ink, overflow: 'hidden' }}>
    <div>
      <div style={{ ...T.label, marginBottom: 12 }}>1 · rail karta (overview)</div>
      <ApprovalCard hud />
      <ZtNote style={{ marginTop: 14 }}>CTA stejně silné pro platbu 1 248 Kč i neškodný read · riziko jako 9px chip v rohu · částka ve 12px řádku</ZtNote>
    </div>
    <div>
      <div style={{ ...T.label, marginBottom: 12 }}>2 · stránka Schválení (detail)</div>
      <ApprovalDetail a={APPROVAL_QUEUE[0]} accent={Z.work} decided={{}} onDecide={() => {}} />
      <ZtNote style={{ marginTop: 14 }}>jiný layout, jiné labely („Awaiting approval“ EN), jiná tlačítka než rail — druhý vzor k učení</ZtNote>
    </div>
    <div>
      <div style={{ ...T.label, marginBottom: 12 }}>3 · voice rohový panel</div>
      <div style={{ background: 'rgba(9,11,15,0.84)', border: `1px solid ${Z.lineHi}`, borderRadius: 4, padding: '11px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
          <Icon name="shield" size={12} style={{ color: Z.inkFaint }} />
          <Mono style={{ fontSize: 8.5, letterSpacing: '0.2em', color: Z.inkFaint, textTransform: 'uppercase' }}>Čekají na schválení</Mono>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: Z.warn, boxShadow: `0 0 6px ${Z.warn}` }}></span>
          <Mono style={{ fontSize: 11, color: Z.ink }}>rohlik</Mono>
        </div>
        <div style={{ fontSize: 11, color: Z.inkDim, marginTop: 2, paddingLeft: 12, lineHeight: 1.4 }}>14 položek · 1 248 Kč · doručení zítra 18–20h</div>
      </div>
      <ZtNote style={{ marginTop: 14 }}>třetí podoba: bez akcí, bez rizika, 8.5px titulek — z hlasové plochy nejde rozhodnout</ZtNote>
    </div>
  </div>
);

// ---- mini náhled košíku pro after page density --------------------------------
const ZtCartPreview = () => (
  <div style={{ border: `1px solid ${ZT.line}`, borderRadius: ZT.rCtl, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderBottom: `1px solid ${ZT.line}` }}>
      <Icon name="cart" size={13} style={{ color: ZT.ink3 }} />
      <span style={{ ...T.micro, color: ZT.ink2 }}>náhled košíku · rohlik.cz</span>
      <span style={{ ...T.micro, marginLeft: 'auto' }}>14 položek</span>
    </div>
    {[['Mléko polotučné 1 l × 4', '107 Kč'], ['Chléb žitný kvasový', '69 Kč'], ['Lososový filet 400 g', '239 Kč'], ['+ 11 dalších položek', '833 Kč']].map(([n, p], i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 13px', borderBottom: `1px solid ${ZT.line}`, fontFamily: ZT.sans, fontSize: 12.5, color: n.startsWith('+') ? ZT.ink3 : ZT.ink2 }}>
        <span>{n}</span><span style={{ fontFamily: ZT.mono, fontSize: 11.5, color: ZT.ink }}>{p}</span>
      </div>
    ))}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 13px' }}>
      <span style={T.label}>celkem</span>
      <span style={{ fontFamily: ZT.mono, fontSize: 16, fontWeight: 700, color: ZT.riskPay }}>1 248 Kč</span>
    </div>
  </div>
);

// ---- APPROVAL · AFTER — jedna karta, tři hustoty -------------------------------
const ApprovalAfterBoard = () => {
  const rohlik = {
    actor: 'rohlik', action: 'objednat košík', risk: 'platba',
    impact: '1 248 Kč', impactNote: '14 položek · doručení zítra 18–20 h', detailLink: 'náhled košíku',
  };
  const push = {
    actor: 'PR Guard', action: 'push → main', risk: 'push',
    impact: '+214 −38', impactNote: 'feat/api-rate-limit · review.md čistý', detailLink: 'náhled diffu',
  };
  return (
    <div style={{ width: '100%', height: '100%', background: ZT.bg, padding: 28, display: 'grid', gridTemplateColumns: '320px minmax(0,1fr) 360px', gap: 26, alignItems: 'start', fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ ...T.label, marginBottom: 12 }}>rail · kompakt</div>
          <ZtApproval density="rail" a={rohlik} />
        </div>
        <div>
          <div style={{ ...T.label, marginBottom: 12 }}>rail · nízké riziko = běžný klik</div>
          <ZtApproval density="rail" a={push} />
        </div>
        <ZtNote>stejná anatomie vždy: stav → CO chce → DOPAD číslem → rozhodnutí. Vysoké riziko (platba, mazání) = podržet 0,9 s; omyl jedním klikem nejde.</ZtNote>
      </div>
      <div>
        <div style={{ ...T.label, marginBottom: 12 }}>stránka · plný detail</div>
        <ZtApproval density="page" a={rohlik} preview={<ZtCartPreview />} />
        <ZtNote style={{ marginTop: 14 }}>náhled přesné akce zůstává — jen uvnitř téže karty, ne jako jiný vzor. „Co se stane po schválení“ nese impactNote, ne extra panel.</ZtNote>
      </div>
      <div>
        <div style={{ ...T.label, marginBottom: 12 }}>voice · čitelné z dálky</div>
        <ZtApproval density="voice" a={rohlik} />
        <ZtNote style={{ marginTop: 14 }}>na hlasové ploše jde nově rozhodnout — větší typografie, stejná karta. Hlasem: „schvaluji rohlik“.</ZtNote>
      </div>
    </div>
  );
};

// ---- TOKENS BOARD — mini design system ------------------------------------------
const SwatchRow = ({ c, name, role }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0', borderBottom: `1px solid ${ZT.line}` }}>
    <span style={{ width: 26, height: 26, borderRadius: 6, background: c, border: `1px solid ${ZT.lineHi}`, flex: '0 0 auto' }}></span>
    <span style={{ fontFamily: ZT.mono, fontSize: 11.5, color: ZT.ink, width: 92, flex: '0 0 auto' }}>{name}</span>
    <span style={{ ...T.micro, fontSize: 10.5 }}>{role}</span>
  </div>
);

const TokensBoard = () => (
  <div style={{ width: '100%', height: '100%', background: ZT.bg, padding: 30, display: 'grid', gridTemplateColumns: '360px minmax(0,1fr) 430px', gap: 30, fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden', alignContent: 'start' }}>

    {/* barvy */}
    <div>
      <div style={{ ...T.label, marginBottom: 14 }}>Barvy — role, ne místa</div>
      <SwatchRow c={ZT.bg} name="bg" role="scéna · vinětace radialem" />
      <SwatchRow c={ZT.surface} name="surface" role="panel" />
      <SwatchRow c={ZT.surfaceHi} name="surface-hi" role="modal, dropdown" />
      <SwatchRow c={ZT.ink} name="ink" role="text primární" />
      <SwatchRow c={ZT.ink2} name="ink-2" role="sekundární" />
      <SwatchRow c={ZT.ink3} name="ink-3" role="popisky (zesvětleno)" />
      <SwatchRow c={ZT.accent} name="accent" role="hlas systému — už ne „běží“" />
      <div style={{ ...T.label, margin: '20px 0 12px' }}>Stavy — jediné, co smí svítit</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ZtChip state="ok" /><ZtChip state="run" /><ZtChip state="wait" /><ZtChip state="bad" /><ZtChip state="idle" />
      </div>
      <div style={{ ...T.label, margin: '20px 0 12px' }}>Riziko — jediná kategorická paleta</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ZtRisk risk="platba" /><ZtRisk risk="mazani" /><ZtRisk risk="push" /><ZtRisk risk="odeslani" />
      </div>
      <ZtNote style={{ marginTop: 16 }}>modely / tooly / kategorie = glyf + text, bez barvy. Tři zelené a dvě oranžové končí.</ZtNote>
    </div>

    {/* typo */}
    <div>
      <div style={{ ...T.label, marginBottom: 14 }}>Typografie — 8 kroků · minimum 11 px</div>
      {[
        ['display · 30 · Geist 600', <span style={T.display}>Dobré ráno. 2 tasky běží.</span>],
        ['title · 21 · Geist 600', <span style={T.title}>Běhy &amp; aktivita</span>],
        ['body · 14 · Geist 400', <span style={T.body}>Tester zaparkoval běh k rannímu review.</span>],
        ['body-sm · 13 · Geist 400', <span style={T.bodySm}>Sekundární popis karty nebo řádku.</span>],
        ['num · 26 · Mono 600', <span style={T.num}>$128 <span style={{ fontSize: 13, color: ZT.ink3, fontWeight: 400 }}>/ $200</span></span>],
        ['data · 12 · Mono 400', <span style={T.data}>~/zibby/agents/kurator.agent.md</span>],
        ['label · 11 · Mono 500 · 0.14em', <span style={T.label}>Běžící agenti</span>],
        ['micro · 11 · Mono 400', <span style={T.micro}>reset 2 h 11 m · 128k / 200k</span>],
      ].map(([meta, el], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '168px 1fr', gap: 16, alignItems: 'baseline', padding: '9px 0', borderBottom: `1px solid ${ZT.line}` }}>
          <span style={{ ...T.micro, fontSize: 10 }}>{meta}</span>
          {el}
        </div>
      ))}
      <ZtNote style={{ marginTop: 14 }}>mono mluví daty (hodnoty, cesty, labely), sans mluví s tebou. Nikdy mono na souvislé věty.</ZtNote>
    </div>

    {/* komponenty + stavy */}
    <div>
      <div style={{ ...T.label, marginBottom: 14 }}>Tlačítka — 3 varianty × stavy</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <ZtBtn variant="primary" icon="check">Schválit</ZtBtn>
          <ZtBtn variant="ghost" icon="retry">Retry</ZtBtn>
          <ZtBtn variant="danger" icon="x">Zamítnout</ZtBtn>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <ZtBtn variant="primary" disabled>Disabled</ZtBtn>
          <ZtBtn variant="primary" loading>Spouštím…</ZtBtn>
          <ZtBtn variant="ghost" size="sm">sm ghost</ZtBtn>
        </div>
        <ZtNote>focus-visible: 2px accent ring vždy (Tab to ukáže) · loading drží label · disabled = 45 % opacity, ne šedý akcent</ZtNote>
      </div>
      <div style={{ ...T.label, margin: '22px 0 12px' }}>Hold-to-confirm · vysoké riziko</div>
      <ZtHold color={ZT.riskPay} label="Podržet pro schválení · 1 248 Kč" />
      <div style={{ ...T.label, margin: '22px 0 12px' }}>Meter — bez glow</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ZtMeter pct={64} color={ZT.wait} />
        <ZtMeter pct={36} color={'rgba(255,255,255,0.28)'} />
      </div>
      <div style={{ ...T.label, margin: '22px 0 12px' }}>Panel · klidný vs. živý</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ZtPanel title="Limity" pad={14}><span style={T.micro}>klidný — bez závorek</span></ZtPanel>
        <ZtPanel title="Běží" live pad={14}><span style={T.micro}>živý — závorky = podpis</span></ZtPanel>
      </div>
      <ZtNote style={{ marginTop: 14 }}>radius 6/10 · spacing 4px mřížka · elevace 3 úrovně · motion 160/240 ms ease-out, pulz 2 s jen run/wait</ZtNote>
    </div>
  </div>
);

// ---- FLOW BOARD — kde ubyly kroky ------------------------------------------------
const FlowStep = ({ children, dim = false, cut = false }) => (
  <span style={{
    fontFamily: ZT.mono, fontSize: 11, padding: '5px 10px', borderRadius: ZT.rCtl, whiteSpace: 'nowrap',
    color: cut ? ZT.ink3 : dim ? ZT.ink2 : ZT.ink,
    background: cut ? 'transparent' : 'rgba(255,255,255,0.04)',
    border: `1px ${cut ? 'dashed' : 'solid'} ${cut ? ZT.line : ZT.lineHi}`,
    textDecoration: cut ? 'line-through' : 'none', opacity: cut ? 0.6 : 1,
  }}>{children}</span>
);

const FlowArrow = () => <span style={{ color: ZT.ink3, fontFamily: ZT.mono, fontSize: 11 }}>→</span>;

const FlowRow = ({ name, before, after, note, last = false }) => (
  <div style={{ padding: '20px 0', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 13 }}>
      <span style={{ ...T.body, fontWeight: 600 }}>{name}</span>
      <span style={{ ...T.micro }}>{before.filter((s) => !s.cut).length} kroků → <span style={{ color: ZT.ok }}>{after.length}</span></span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center' }}>
      <span style={{ ...T.micro, fontSize: 10 }}>před</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {before.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <FlowArrow />}
            <FlowStep dim cut={s.cut}>{s.t}</FlowStep>
          </React.Fragment>
        ))}
      </div>
      <span style={{ ...T.micro, fontSize: 10, color: ZT.ok }}>po</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
        {after.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <FlowArrow />}
            <FlowStep>{s}</FlowStep>
          </React.Fragment>
        ))}
      </div>
    </div>
    <div style={{ ...T.micro, fontSize: 10.5, marginTop: 11, color: ZT.ink2 }}>{note}</div>
  </div>
);

const FlowBoard = () => (
  <div style={{ width: '100%', height: '100%', background: ZT.bg, padding: '26px 32px', fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden' }}>
    <FlowRow name="Schválení akce"
      before={[{ t: 'všimnout si rail karty' }, { t: 'Otevřít Tasky', cut: true }, { t: 'najít položku ve frontě', cut: true }, { t: 'otevřít detail', cut: true }, { t: 'rozhodnout' }]}
      after={['karta kdekoliv (rail · brífink · voice)', 'rozhodnout na místě']}
      note="karta vždy nese co / riziko / dopad — detail (diff, košík) je na rozkliknutí, ne podmínka rozhodnutí" />
    <FlowRow name="Spuštění úlohy"
      before={[{ t: 'New Task' }, { t: 'dialog — co dělat' }, { t: 'kategorizace' }, { t: 'potvrdit přiřazeného agenta', cut: true }, { t: 'Dispatch', cut: true }]}
      after={['New Task', 'dialog — co dělat', 'auto: kategorizace + agent → spuštěno']}
      note="po vyplnění dialogu jde task do stavu „kategorizace“ (asynchronní, neblokuje UI) — automaticky se zkategorizuje a přiřadí agentovi; jakmile je hotovo, spustí se sám · potvrzovací dialog s agentem a tlačítko Dispatch zmizely" />
    <FlowRow name="Ranní účet nočních běhů" last
      before={[{ t: 'brífink řádek' }, { t: 'klik do detailu', cut: true }, { t: 'Runs / Tasky', cut: true }, { t: 'akce (retry · PR · approve)' }]}
      after={['brífink řádek s inline akcí', 'hotovo']}
      note="hotovo → Otevřít PR · zaparkováno → Retry / Zahodit · approval → Schválit přímo — celý noční účet z jednoho panelu" />
  </div>
);

Object.assign(window, { ApprovalBeforeBoard, ApprovalAfterBoard, TokensBoard, FlowBoard, ZtNote, ZtCartPreview });

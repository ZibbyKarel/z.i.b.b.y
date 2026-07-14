// ZIBBY redesign — Changelog & nezapracované nálezy (závěr etapy)
// Mapuje 18 nálezů auditu → kde a čím jsou zapracované · co je odloženo a proč.

// ---- stavový štítek (hotovo / částečně / odloženo) ---------------------------
const ClStatus = ({ kind }) => {
  const map = {
    done: { c: ZT.ok,   t: 'hotovo' },
    part: { c: ZT.wait, t: 'částečně' },
    defer:{ c: ZT.ink3, t: 'odloženo' },
  };
  const s = map[kind] || map.done;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 7px',
      borderRadius: 999, border: `1px solid ${s.c}33`, background: `${s.c}10`,
      fontFamily: ZT.mono, fontSize: 10.5, color: s.c, whiteSpace: 'nowrap', flex: '0 0 auto',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.c, display: 'inline-block' }}></span>
      {s.t}
    </span>
  );
};

// ---- prioritní tag -----------------------------------------------------------
const ClPrio = ({ p }) => {
  const c = p === 'P0' ? ZT.bad : p === 'P1' ? ZT.wait : ZT.ink3;
  return (
    <span style={{
      fontFamily: ZT.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
      color: c, border: `1px solid ${c}44`, background: `${c}12`, borderRadius: 4,
      padding: '3px 6px', flex: '0 0 auto', height: 'fit-content', marginTop: 1,
    }}>{p}</span>
  );
};

// ---- řádek nálezu ------------------------------------------------------------
const ClRow = ({ p, status, title, where, last = false }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <ClPrio p={p} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...T.bodySm, color: ZT.ink, fontWeight: 500, lineHeight: 1.4 }}>{title}</div>
      <div style={{ ...T.micro, fontSize: 11, marginTop: 5, lineHeight: 1.55 }}>
        <span style={{ color: ZT.accent }}>→ </span>{where}
      </div>
    </div>
    <ClStatus kind={status} />
  </div>
);

const ClHead = ({ children }) => (
  <div style={{ ...T.label, color: ZT.ink2, margin: '0 0 4px', paddingTop: 4 }}>{children}</div>
);

// ---- rozhodnutí k ověřovací otázce ------------------------------------------
const ClDecision = ({ q, a, decided = true, last = false }) => (
  <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 0', borderBottom: last ? 'none' : `1px solid ${ZT.line}` }}>
    <span style={{
      fontFamily: ZT.mono, fontSize: 11, color: decided ? ZT.ok : ZT.wait, flex: '0 0 auto', marginTop: 1,
    }}>{decided ? '✓' : '?'}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...T.micro, fontSize: 11, color: ZT.ink3, lineHeight: 1.5 }}>{q}</div>
      <div style={{ ...T.bodySm, fontSize: 12.5, color: ZT.ink, marginTop: 3, lineHeight: 1.45 }}>{a}</div>
    </div>
  </div>
);

const ChangelogBoard = () => (
  <div style={{ width: '100%', height: '100%', background: ZT.bg, padding: '30px 34px', fontFamily: ZT.sans, color: ZT.ink, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

    {/* hlavička + souhrn */}
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, paddingBottom: 18, borderBottom: `1px solid ${ZT.lineHi}`, marginBottom: 24 }}>
      <div>
        <div style={{ ...T.label, color: ZT.accent }}>Changelog · co bylo z auditu zapracováno</div>
        <div style={{ ...T.title, fontSize: 24, marginTop: 8 }}>18 nálezů → <span style={{ color: ZT.ok }}>15 zapracováno</span> · <span style={{ color: ZT.wait }}>1 částečně</span> · <span style={{ color: ZT.ink3 }}>2 odloženo</span></div>
      </div>
      <div style={{ display: 'flex', gap: 22, flex: '0 0 auto' }}>
        {[['4', 'P0', ZT.bad], ['8', 'P1', ZT.wait], ['6', 'P2', ZT.ink3]].map(([n, l, c]) => (
          <div key={l} style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: ZT.mono, fontSize: 26, fontWeight: 600, color: c, lineHeight: 1 }}>{n}</div>
            <div style={{ ...T.micro, fontSize: 10.5, marginTop: 4 }}>{l} nálezů</div>
          </div>
        ))}
      </div>
    </div>

    {/* dva sloupce */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, minHeight: 0 }}>

      {/* LEVÝ: zapracováno P0 + P1 */}
      <div>
        <ClHead>P0 · zapracováno do foundation a sdílených komponent</ClHead>
        <ClRow p="P0" status="done" title="Barva = stav: kolize stavových a kategorických barev rozdělena"
          where="4 stavové barvy (hotovo / běží / čeká / chyba) jen pro stav · 3 zelené a 2 oranžové sjednoceny · ZT_STATE, ZtChip, ZtDot" />
        <ClRow p="P0" status="done" title="Approval: 3 nesladěné podoby → jedna karta"
          where="ZtApproval ve třech hustotách (rail / stránka / voice) · vždy CO · ČÍM rizikové · JAKÝ dopad" />
        <ClRow p="P0" status="done" title="Voice: „poslouchám“ ≠ „mluvím“, přidán error"
          where="ZtOrb — 5 stavů odlišených tvarem pohybu · živý přepis = potvrzení „slyším tě“ · error s retry/únikem" />
        <ClRow p="P0" status="done" title="Typografická škála: 23 velikostí → 8 kroků, min 11 px"
          where="objekt T (display→micro) · mono = data, sans = řeč · žádná informace pod 11 px" last />

        <div style={{ height: 22 }}></div>

        <ClHead>P1 · systémové sjednocení</ClHead>
        <ClRow p="P1" status="done" title="Glow na všem → světlo jen na živém"
          where="pulz 2 s a glow jen u běží/čeká · ZtDot live, ZtPanel live · bary, badge, navigace matné" />
        <ClRow p="P1" status="done" title="17+ barev, jedna barva = 6 významů"
          where="zůstává jediná kategorická paleta — riziko (ZT_RISK) · modely / tooly / kategorie → glyf + text" />
        <ClRow p="P1" status="done" title="5 druhů tlačítek, žádný systém stavů"
          where="jeden ZtBtn (primary/ghost/danger · sm/md · hover/focus-visible/disabled/loading) + ZtHold" />
        <ClRow p="P1" status="done" title="Duplikace informací (totéž 3×)"
          where="headline nese stav (bez stat řádku) · limity mají jediný domov v railu · VelinAfter" />
        <ClRow p="P1" status="done" title="Pravý rail soupeří s obsahem"
          where="rail jen na Přehledu (324 px) jako periferní vidění · jinde se zúží — ověř. otázka 1" />
        <ClRow p="P1" status="done" title="Radius chaos (0/2/3/4/10/12)"
          where="6 px ovládací prvky a chipy · 10 px panely a modaly · ZT.rCtl / ZT.rPanel" />
        <ClRow p="P1" status="done" title="Povrchy: 5 tokenů + 4 ad-hoc"
          where="3 úrovně (bg / surface / surface-hi) · hloubka radial vinětací, ne druhým pozadím" />
        <ClRow p="P1" status="done" title="Top bar: absolutní ⌘K koliduje s TASK"
          where="search ve flow (flex 0 1 360 px) místo position:absolute · nepřekrývá se · VaTopBar" last />
      </div>

      {/* PRAVÝ: P2 + nezapracováno + rozhodnutí */}
      <div>
        <ClHead>P2 · doladění</ClHead>
        <ClRow p="P2" status="done" title="Scanlines + mřížka na každé ploše"
          where="odstraněno · scénu drží radial gradient + vinětace pozadí (HUD i Voice)" />
        <ClRow p="P2" status="done" title="HUD závorky na každém panelu"
          where="rohové závorky jen na živých panelech (podpis znovu nese význam) · ZtCorners přes ZtPanel live" />
        <ClRow p="P2" status="done" title="Spacing mimo mřížku"
          where="4px mřížka (4·8·12·16·20·24·32·48) · panel padding 20, gap 20" />
        <ClRow p="P2" status="done" title="13 hodnot letter-spacingu"
          where="jen 2: 0.14em labely · 0.30em wordmark · T.label" />
        <ClRow p="P2" status="done" title="Voice transcript bez historie"
          where="poslední 3 repliky + odkaz „celý přepis v logu běhu“ · ověř. otázka 6" />
        <ClRow p="P2" status="part" title="Míchání jazyků v UI"
          where="nové komponenty drží CZ · plný průchod 25 modulů + i18n ovládacích řetězců odložen (viz níže)" last />

        <div style={{ height: 22 }}></div>

        <ClHead>Nezapracováno · k rozhodnutí</ClHead>
        <div style={{ background: ZT.surface, border: `1px solid ${ZT.line}`, borderRadius: ZT.rPanel, padding: '4px 16px' }}>
          <ClRow p="P2" status="defer" title="Sjednocení jazyka napříč všemi 25 moduly"
            where="potřebuje produktové rozhodnutí o politice EN technických termínů + i18n vrstvu · ad-hoc změna by zavedla nové nekonzistence" />
          <ClRow p="P2" status="defer" title="Mrtvý kód: skiny zen/balanced/hud, kontexty home/work"
            where="čistka kódu, ne vizuální redesign · audit (ověř. otázka 3) doporučuje odstranění — mimo rozsah canvasu" />
          <ClRow p="P1" status="defer" title="Propagace tokenů na ~22 sekundárních obrazovek"
            where="foundation, sdílené komponenty a 3 klíčové HUD plochy + Voice hotové · rozkutí na Runs / Definice / Gate rules / Skills … je navazující implementace" last />
        </div>

        <div style={{ height: 22 }}></div>

        <ClHead>Rozhodnutí k ověřovacím otázkám auditu (§05)</ClHead>
        <ClDecision q="Persistentní pravý rail na všech stránkách?" a="Rail jen na Přehledu; jinde tenký stavový proužek." />
        <ClDecision q="Scanlines + mřížka — pryč, nebo jemná stopa?" a="Úplně pryč; atmosféru nese hloubka pozadí." />
        <ClDecision q="Mrtvé skiny / kontexty — odstranit?" a="Doporučeno odstranit; odloženo do čistky kódu." decided={false} />
        <ClDecision q="Kategorické barvy modelů — držet?" a="Modely přecházejí na glyf + text, bez barvy." />
        <ClDecision q="Vysoké riziko — dvojité potvrzení?" a="Hold-to-confirm 0,9 s (ZtHold) u platby a mazání." />
        <ClDecision q="Voice transcript — plná historie?" a="Poslední 3 + odkaz do logu běhu; efemérnost cílená." last />
      </div>
    </div>
  </div>
);

Object.assign(window, { ChangelogBoard, ClStatus, ClPrio, ClRow, ClDecision });

// ZIBBY velín — Nastavení systému: předvolby (jazyk CZ/EN, výchozí kontext, caffeinate) + systém
const { useState: useStateSet, useEffect: useEffectSet } = React;

// ---- Voice shortcut helpers (shared with app.jsx via window) -----------

const DEFAULT_VOICE_SHORTCUT = { key: 'v', ctrl: false, meta: false, alt: false, shift: false };
const SHORTCUT_BLOCKED = new Set(['Escape','Tab','CapsLock','NumLock','ScrollLock','Pause','PrintScreen','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);

const matchesShortcut = (e, sc) => {
  if (!sc || !sc.key) return false;
  return (
    e.key.toLowerCase() === sc.key.toLowerCase() &&
    !!e.ctrlKey  === !!sc.ctrl &&
    !!e.metaKey  === !!sc.meta &&
    !!e.altKey   === !!sc.alt  &&
    !!e.shiftKey === !!sc.shift
  );
};

const formatShortcutParts = (sc) => {
  const s = sc || DEFAULT_VOICE_SHORTCUT;
  const parts = [];
  if (s.ctrl)  parts.push('Ctrl');
  if (s.meta)  parts.push('⌘');
  if (s.alt)   parts.push('Alt');
  if (s.shift) parts.push('⇧');
  parts.push((s.key || 'V').length === 1 ? (s.key || 'V').toUpperCase() : (s.key || 'V'));
  return parts;
};

const ShortcutBadge = ({ sc }) => (
  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
    {formatShortcutParts(sc).map((p, i) => (
      <Mono key={i} style={{
        fontSize: 12, fontWeight: 700, padding: '4px 9px',
        background: Z.bg0, border: `1px solid ${Z.lineHi}`,
        borderRadius: 3, color: Z.ink, userSelect: 'none',
        boxShadow: '0 2px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>{p}</Mono>
    ))}
  </div>
);

const ShortcutCapture = ({ value, accent, onChange }) => {
  const [capturing, setCapturing] = useStateSet(false);
  const sc = value || DEFAULT_VOICE_SHORTCUT;
  const isDefault = sc.key === DEFAULT_VOICE_SHORTCUT.key && !sc.ctrl && !sc.meta && !sc.alt && !sc.shift;

  useEffectSet(() => {
    if (!capturing) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setCapturing(false); return; }
      if (SHORTCUT_BLOCKED.has(e.key)) return;
      if (['Control','Meta','Alt','Shift'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      onChange({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <ShortcutBadge sc={sc} />
      <button
        onClick={() => setCapturing(c => !c)}
        style={{
          padding: '6px 13px', cursor: 'pointer', borderRadius: 3,
          fontFamily: Z.mono, fontSize: 11, minWidth: 130,
          background: capturing ? `${accent}14` : 'transparent',
          border: `1px solid ${capturing ? accent : Z.line}`,
          color: capturing ? accent : Z.inkDim,
          transition: 'all .15s',
        }}
        onMouseEnter={e => { if (!capturing) { e.currentTarget.style.borderColor = Z.lineHi; e.currentTarget.style.color = Z.ink; } }}
        onMouseLeave={e => { if (!capturing) { e.currentTarget.style.borderColor = Z.line; e.currentTarget.style.color = Z.inkDim; } }}
      >
        {capturing ? '↩ stiskni klávesu…' : 'Změnit zkratku'}
      </button>
      {!isDefault && (
        <button
          onClick={() => onChange(DEFAULT_VOICE_SHORTCUT)}
          style={{
            padding: '6px 10px', cursor: 'pointer', borderRadius: 3,
            fontFamily: Z.mono, fontSize: 10, color: Z.inkFaint,
            background: 'transparent', border: `1px solid ${Z.line}`,
            transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = Z.inkDim; }}
          onMouseLeave={e => { e.currentTarget.style.color = Z.inkFaint; }}
        >
          reset
        </button>
      )}
    </div>
  );
};

// i18n pro tuhle obrazovku — důkaz, že přepínač funguje (zbytek rozhraní se překládá postupně)
const SETTINGS_I18N = {
  cs: {
    title: 'Nastavení systému', sub: 'démon na', preferences: 'Předvolby',
    language: 'Jazyk rozhraní', languageHint: 'Plný překlad rozhraní se postupně dopisuje — zatím je dostupná čeština a angličtina.',
    defaultCtx: 'Výchozí kontext', defaultCtxHint: 'Kontext, ve kterém se velín otevře po spuštění.',
    caffeinate: 'Držet Mac vzhůru (caffeinate)', caffeinateHint: 'Nechá démona běžet i v noci pro naplánované běhy agentů.',
    voiceShortcut: 'Klávesová zkratka — Voice Mode', voiceShortcutHint: 'Stiskni přiřazenou kombinaci odkudkoliv ve velínu pro přepnutí do hlasového režimu. Esc vždy vrátí zpět do HUD.',
    system: 'Systém', daemon: 'Démon', host: 'Stroj', uptime: 'Uptime', status: 'Stav',
    nominal: 'NOMINAL · vzhůru', langNote: 'Vybráno: čeština',
  },
  en: {
    title: 'System settings', sub: 'daemon on', preferences: 'Preferences',
    language: 'Interface language', languageHint: 'Full interface translation is rolling out gradually — Czech and English are available for now.',
    defaultCtx: 'Default context', defaultCtxHint: 'The context the cockpit opens in on launch.',
    caffeinate: 'Keep Mac awake (caffeinate)', caffeinateHint: 'Keeps the daemon running overnight for scheduled agent runs.',
    voiceShortcut: 'Keyboard shortcut — Voice Mode', voiceShortcutHint: 'Press the assigned key combination from anywhere in the cockpit to switch to voice mode. Esc always returns to HUD.',
    system: 'System', daemon: 'Daemon', host: 'Host', uptime: 'Uptime', status: 'Status',
    nominal: 'NOMINAL · awake', langNote: 'Selected: English',
  },
};

// segmented control (velín styl)
const Segmented = ({ value, options, accent, onChange }) => (
  <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3 }}>
    {options.map((o) => {
      const on = value === o.id;
      return (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          fontFamily: Z.mono, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer',
          color: on ? Z.bg0 : Z.inkDim, background: on ? accent : 'transparent',
          boxShadow: on ? `0 0 12px ${accent}55` : 'none', transition: 'all .15s',
        }}>{o.label}</button>
      );
    })}
  </div>
);

// toggle switch
const Switch = ({ on, accent, onToggle }) => (
  <button onClick={onToggle} title={on ? 'zapnuto' : 'vypnuto'} style={{
    width: 46, height: 26, borderRadius: 26, padding: 3, cursor: 'pointer', display: 'flex',
    justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
    border: `1px solid ${on ? accent : Z.line}`, background: on ? `${accent}26` : Z.bg0,
    transition: 'all .15s',
  }}>
    <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? accent : Z.inkFaint, boxShadow: on ? `0 0 10px ${accent}88` : 'none', transition: 'all .15s' }} />
  </button>
);

const SettingRow = ({ label, hint, control, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '16px 0', borderBottom: last ? 'none' : `1px solid ${Z.line}` }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, color: Z.ink, fontWeight: 500 }}>{label}</div>
      {hint && <Mono style={{ fontSize: 10.5, color: Z.inkFaint, display: 'block', marginTop: 5, lineHeight: 1.45, maxWidth: 460 }}>{hint}</Mono>}
    </div>
    <div style={{ flex: '0 0 auto' }}>{control}</div>
  </div>
);

const InfoRow = ({ label, value, valueColor, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${Z.line}` }}>
    <Mono style={{ fontSize: 11, color: Z.inkFaint, letterSpacing: '0.04em' }}>{label}</Mono>
    <Mono style={{ fontSize: 12, color: valueColor || Z.ink, fontWeight: 600 }}>{value}</Mono>
  </div>
);

const SettingsBody = ({ accent, settings, saveSettings, gateRules, setGateRules, agents, skills, gateCats, setGateCats }) => {
  const t = SETTINGS_I18N[settings.lang] || SETTINGS_I18N.cs;
  const en = settings.lang === 'en';
  const [sub, setSub] = useStateSet('general');
  const subItems = [
    { id: 'general', label: en ? 'General' : 'Obecné', glyph: 'gear' },
    { id: 'gate',    label: en ? 'Approval rules' : 'Pravidla schvalování', glyph: 'shield' },
  ];
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header */}
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 42, height: 42, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: accentDimOf(), color: accent, border: `1px solid ${accent}44` }}>
            <Icon name="gear" size={21} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{t.title}</div>
            <Mono style={{ fontSize: 11, color: Z.inkDim, display: 'block', marginTop: 5 }}>{SYSTEM.daemon} · {t.sub} {SYSTEM.host}</Mono>
          </div>
        </div>
      </HudPanel>

      {/* sekundární menu + obsah */}
      <div style={{ display: 'grid', gridTemplateColumns: '212px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {subItems.map((it) => {
            const on = sub === it.id;
            return (
              <div key={it.id} onClick={() => setSub(it.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: Z.rCtl, cursor: 'pointer',
                color: on ? Z.ink : Z.inkDim, background: on ? Z.workDim : 'transparent',
                fontSize: 13.5, fontWeight: on ? 600 : 500, transition: 'background .14s',
              }}>
                <span style={{ color: on ? accent : Z.inkFaint, display: 'flex' }}><Icon name={it.glyph} size={16} /></span>
                <span>{it.label}</span>
              </div>
            );
          })}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {sub === 'general' ? (
            <React.Fragment>
              {/* preferences */}
              <HudPanel accent={accent} title={t.preferences} pad={20}>
                <SettingRow
                  label={t.language}
                  hint={t.languageHint}
                  control={
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <Segmented value={settings.lang} accent={accent} onChange={(v) => saveSettings({ lang: v })}
                        options={[{ id: 'cs', label: 'Čeština' }, { id: 'en', label: 'English' }]} />
                      <Mono style={{ fontSize: 9, color: accent }}>{t.langNote}</Mono>
                    </div>
                  } />
                <SettingRow
                  label={t.caffeinate}
                  hint={t.caffeinateHint}
                  control={<Switch on={settings.caffeinate} accent={accent} onToggle={() => saveSettings({ caffeinate: !settings.caffeinate })} />} />
                <SettingRow
                  last
                  label={t.voiceShortcut}
                  hint={t.voiceShortcutHint}
                  control={
                    <ShortcutCapture
                      value={settings.voiceShortcut}
                      accent={accent}
                      onChange={(sc) => saveSettings({ voiceShortcut: sc })}
                    />
                  } />
              </HudPanel>

              {/* system info */}
              <HudPanel accent={accent} title={t.system} pad={20}>
                <InfoRow label={t.daemon} value={SYSTEM.daemon} />
                <InfoRow label={t.host} value={SYSTEM.host} />
                <InfoRow label={t.uptime} value={SYSTEM.uptime} />
                <InfoRow last label={t.status} value={t.nominal} valueColor={Z.ok} />
              </HudPanel>
            </React.Fragment>
          ) : (
            gateRules && (
              <GateRulesBody
                accent={accent}
                gateRules={gateRules}
                setGateRules={setGateRules}
                agents={agents || AGENTS}
                skills={skills || SKILLS}
                cats={gateCats || GATE_RULE_CATEGORIES}
                setCats={setGateCats || (() => {})}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SettingsBody, Segmented, Switch, SETTINGS_I18N, matchesShortcut, DEFAULT_VOICE_SHORTCUT, ShortcutBadge, ShortcutCapture, formatShortcutParts });

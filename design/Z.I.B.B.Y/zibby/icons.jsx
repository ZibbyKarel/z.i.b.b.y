// ZIBBY velín — inline stroke icon set (1.5 stroke, currentColor)
const Icon = ({ name, size = 18, stroke = 1.6, style }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" {...p} /><rect x="14" y="3" width="7" height="7" {...p} /><rect x="3" y="14" width="7" height="7" {...p} /><rect x="14" y="14" width="7" height="7" {...p} /></>,
    spark: <path d="M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z" {...p} />,
    plug: <><path d="M9 2v6M15 2v6" {...p} /><path d="M7 8h10v3a5 5 0 0 1-10 0z" {...p} /><path d="M12 16v6" {...p} /></>,
    clock: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 7v5l3 2" {...p} /></>,
    brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18a3 3 0 0 0 5 .8 3 3 0 0 0 5-.8 3 3 0 0 0 2-5.2A3 3 0 0 0 18 7a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 4z" {...p} />,
    pulse: <path d="M2 12h4l2.5-7 4 14 2.5-7H22" {...p} />,
    cart: <><circle cx="9" cy="20" r="1.4" {...p} /><circle cx="18" cy="20" r="1.4" {...p} /><path d="M2 3h2.5l2.2 12.3a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 7H6" {...p} /></>,
    film: <><rect x="3" y="4" width="18" height="16" rx="2" {...p} /><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" {...p} /></>,
    server: <><rect x="3" y="4" width="18" height="7" rx="1.5" {...p} /><rect x="3" y="13" width="18" height="7" rx="1.5" {...p} /><path d="M7 7.5h.01M7 16.5h.01" {...p} /></>,
    doc: <><path d="M6 2h8l4 4v16H6z" {...p} /><path d="M14 2v4h4M9 13h6M9 17h6" {...p} /></>,
    play: <path d="M7 4l13 8-13 8z" {...p} />,
    run: <circle cx="12" cy="12" r="4" {...p} />,
    wait: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 8v4l2.5 1.5" {...p} /></>,
    ok: <><circle cx="12" cy="12" r="9" {...p} /><path d="M8.5 12.5l2.2 2.2 4.8-5" {...p} /></>,
    edit: <path d="M4 20h4L20 8l-4-4L4 16z" {...p} />,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" {...p} />,
    check: <path d="M5 12.5l4 4 10-10.5" {...p} />,
    x: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    chevron: <path d="M9 6l6 6-6 6" {...p} />,
    dots: <><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" /></>,
    file: <><path d="M7 2h7l4 4v16H7z" {...p} /><path d="M14 2v4h4" {...p} /></>,
    shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...p} />,
    search: <><circle cx="11" cy="11" r="7" {...p} /><path d="M16 16l5 5" {...p} /></>,
    gear: <><circle cx="12" cy="12" r="3.2" {...p} /><path d="M19.4 13.5a1.5 1.5 0 0 0 .3 1.65l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.5 1.5 0 0 0-2.55 1.06V20a2 2 0 0 1-4 0v-.07a1.5 1.5 0 0 0-2.55-1.06l-.05.05A2 2 0 1 1 2.84 16.1l.05-.05A1.5 1.5 0 0 0 1.83 13.5H1.7a2 2 0 0 1 0-4h.13a1.5 1.5 0 0 0 1.06-2.55l-.05-.05A2 2 0 1 1 5.7 4.07l.05.05a1.5 1.5 0 0 0 1.65.3H7.5a1.5 1.5 0 0 0 .9-1.37V3a2 2 0 0 1 4 0v.07a1.5 1.5 0 0 0 2.55 1.06l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.5 1.5 0 0 0-.3 1.65V8.5a1.5 1.5 0 0 0 1.37.9H22a2 2 0 0 1 0 4h-.07a1.5 1.5 0 0 0-1.37.9z" {...p} /></>,
    bot: <><rect x="4" y="8" width="16" height="11" rx="2.5" {...p} /><path d="M12 4v4M9 13h.01M15 13h.01M9 8h6" {...p} /><circle cx="12" cy="3.5" r="1.3" {...p} /></>,
    flow: <><rect x="3" y="4" width="6" height="5" rx="1" {...p} /><rect x="15" y="4" width="6" height="5" rx="1" {...p} /><rect x="9" y="15" width="6" height="5" rx="1" {...p} /><path d="M6 9v3a2 2 0 0 0 2 2h1M18 9v3a2 2 0 0 1-2 2h-1" {...p} /></>,
    compass: <><circle cx="12" cy="12" r="9" {...p} /><path d="M15.5 8.5l-2 5-5 2 2-5z" {...p} /></>,
    code: <><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" {...p} /></>,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" {...p} /><path d="M7.5 15h9" {...p} /></>,
    dollar: <><path d="M12 2v20M16 6.5C16 4.6 14.2 3.5 12 3.5S8 4.6 8 6.5 9.8 9.5 12 9.5s4 1.1 4 3-1.8 3-4 3-4-1.1-4-3" {...p} /></>,
    branch: <><circle cx="6" cy="5" r="2.2" {...p} /><circle cx="6" cy="19" r="2.2" {...p} /><circle cx="18" cy="7" r="2.2" {...p} /><path d="M6 7.2v9.6M18 9.2c0 4-6 2.8-6 7.8" {...p} /></>,
    pause: <><rect x="7" y="5" width="3.5" height="14" rx="1" {...p} /><rect x="13.5" y="5" width="3.5" height="14" rx="1" {...p} /></>,
    retry: <><path d="M3 12a9 9 0 1 0 2.6-6.4" {...p} /><path d="M3 4v5h5" {...p} /></>,
    checkpoint: <><path d="M5 21V4l7 3 7-3v17l-7-3z" {...p} /><path d="M12 7v14" {...p} /></>,
    moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" {...p} />,
    coffee: <><path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" {...p} /><path d="M17 9h2.5a2.5 2.5 0 0 1 0 5H17M7 3v2M11 3v2" {...p} /></>,
    link: <><path d="M9 15l6-6" {...p} /><path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" {...p} /></>,
    warn: <><path d="M12 3l9 16H3z" {...p} /><path d="M12 10v4M12 17h.01" {...p} /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    pin: <><path d="M9 3.5h6M10.6 3.5l-.5 6.2-2.1 1.8v1.5h8v-1.5l-2.1-1.8-.5-6.2" {...p} /><path d="M12 13v7.5" {...p} /></>,
    trash: <><path d="M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13" {...p} /><path d="M10 11v6M14 11v6" {...p} /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" {...p} /><circle cx="8.5" cy="9.5" r="1.6" {...p} /><path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L4 19" {...p} /></>,
    upload: <><path d="M12 16V4M7 8l5-5 5 5" {...p} /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" {...p} /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" {...p} /><path d="M5 11a7 7 0 0 0 14 0" {...p} /><path d="M12 18v3M8.5 21h7" {...p} /></>,
    paperclip: <path d="M7.5 13.8l7-7a3.3 3.3 0 0 1 4.7 4.7l-8 8a5 5 0 0 1-7-7L12 4.7" {...p} />,
    building: <><rect x="4" y="3" width="11" height="18" rx="1" {...p} /><path d="M15 9h5v12h-5" {...p} /><path d="M7.5 7h.01M11.5 7h.01M7.5 11h.01M11.5 11h.01M7.5 15h.01M11.5 15h.01" {...p} /></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2" {...p} /><path d="M7 9l3.5 3-3.5 3M13 15h4" {...p} /></>,
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', flex: '0 0 auto', ...style }}>{paths[name] || null}</svg>;
};

// ZIBBY top-hat mark (cylindr) — small butler glyph
const ZibbyMark = ({ size = 22, color = '#e6edf3' }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }}>
    <ellipse cx="16" cy="25" rx="12" ry="2.4" fill={color} opacity="0.18" />
    <path d="M9 24h14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path d="M11 24V11a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v13" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" />
    <path d="M11 19h10" stroke={color} strokeWidth="2" />
  </svg>
);

// ---- Avatar — drop-in replacement for the glyph-in-a-box pattern --------
// Renders a custom-uploaded image when present, otherwise falls back to the
// existing glyph-in-tinted-box look so untouched entities are unaffected.
const Avatar = ({ src, glyph = 'bot', size = 36, radius = 2, accent = '#5b8def', dim, style, imgStyle }) => {
  if (src) {
    return (
      <div style={{
        width: size, height: size, flex: '0 0 auto', borderRadius: radius, overflow: 'hidden',
        border: `1px solid ${accent}44`, background: '#000', ...style,
      }}>
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...imgStyle }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, flex: '0 0 auto', borderRadius: radius, display: 'grid', placeItems: 'center',
      background: dim || `${accent}22`, color: accent, border: `1px solid ${accent}33`, ...style,
    }}>
      <Icon name={glyph} size={Math.round(size * 0.5)} />
    </div>
  );
};

Object.assign(window, { Icon, ZibbyMark, Avatar });

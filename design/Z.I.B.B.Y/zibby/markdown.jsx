// ZIBBY velín — Markdown editor + renderer (sdílený pro Skilly, Agenty, …)
// Lehký parser → React uzly (žádné dangerouslySetInnerHTML), styl velínu.
const { useState: useStateMd, useRef: useRefMd } = React;

// ---- frontmatter helper: oddělí YAML hlavičku od obsahu -------------------
// Frontmatter (--- … ---) se needituje v Markdown editoru — řídí se levým sloupcem.
function splitFrontmatter(src = '') {
  const m = /^---\n([\s\S]*?)\n---\s*\n?/.exec(src);
  if (m) return { front: m[1], content: src.slice(m[0].length) };
  return { front: null, content: src };
}

// ---- inline parsing: **bold**, *italic*/_italic_, `code`, [text](url) -----
function mdInline(text, keyBase) {
  const nodes = [];
  // token regex (order matters): code, bold, italic, link
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0,m,i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;
    if (m[1]) {
      nodes.push(<code key={key} style={{ fontFamily: Z.mono, fontSize: '0.92em', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3, padding: '1px 5px', color: Z.work }}>{tok.slice(1, -1)}</code>);
    } else if (m[2]) {
      nodes.push(<strong key={key} style={{ color: Z.ink, fontWeight: 700 }}>{tok.slice(2, -2)}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={key} style={{ color: Z.ink }}>{tok.slice(1, -1)}</em>);
    } else if (m[4]) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      nodes.push(<a key={key} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: Z.work, textDecoration: 'underline', textUnderlineOffset: 2 }}>{mm[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ---- block parsing → React ------------------------------------------------
function MarkdownView({ source = '', accent = Z.work }) {
  let body = source;
  let front = null;

  // frontmatter (--- … ---)
  const fm = /^---\n([\s\S]*?)\n---\s*\n?/.exec(body);
  if (fm) {
    front = fm[1].split('\n').filter(Boolean).map((line) => {
      const idx = line.indexOf(':');
      if (idx === -1) return { k: line, v: '' };
      return { k: line.slice(0, idx).trim(), v: line.slice(idx + 1).trim() };
    });
    body = body.slice(fm[0].length);
  }

  const lines = body.split('\n');
  const blocks = [];
  let i = 0,key = 0;

  const txtStyle = { color: Z.inkDim, fontSize: 13.5, lineHeight: 1.65, margin: '0 0 12px' };

  while (i < lines.length) {
    let line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {buf.push(lines[i]);i++;}
      i++; // closing fence
      blocks.push(
        <pre key={key++} style={{ margin: '0 0 14px', padding: '12px 14px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 4, overflow: 'auto' }}>
          {lang && <div style={{ fontFamily: Z.mono, fontSize: 9.5, color: Z.inkFaint, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{lang}</div>}
          <code style={{ fontFamily: Z.mono, fontSize: 12, lineHeight: 1.6, color: Z.ink, whiteSpace: 'pre' }}>{buf.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const sizes = { 1: 21, 2: 17, 3: 14.5, 4: 13 };
      blocks.push(
        <div key={key++} style={{
          color: Z.ink, fontWeight: lvl <= 2 ? 700 : 600, fontSize: sizes[lvl], lineHeight: 1.3,
          margin: lvl === 1 ? '4px 0 12px' : '18px 0 9px',
          paddingBottom: lvl <= 2 ? 7 : 0, borderBottom: lvl <= 2 ? `1px solid ${Z.line}` : 'none'
        }}>{mdInline(h[2], `h${key}`)}</div>
      );
      i++;
      continue;
    }

    // horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key++} style={{ border: 'none', borderTop: `1px solid ${Z.line}`, margin: '16px 0' }} />);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {buf.push(lines[i].replace(/^>\s?/, ''));i++;}
      blocks.push(
        <blockquote key={key++} style={{ margin: '0 0 12px', padding: '6px 0 6px 14px', borderLeft: `2px solid ${accent}`, color: Z.inkDim, fontStyle: 'italic' }}>
          {mdInline(buf.join(' '), `q${key}`)}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {items.push(lines[i].replace(/^\s*[-*]\s+/, ''));i++;}
      blocks.push(
        <ul key={key++} style={{ margin: '0 0 13px', paddingLeft: 4, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, j) =>
          <li key={j} style={{ display: 'flex', gap: 9, color: Z.inkDim, fontSize: 13.5, lineHeight: 1.55 }}>
              <span style={{ color: accent, flex: '0 0 auto', marginTop: 1 }}>▸</span>
              <span>{mdInline(it, `ul${key}-${j}`)}</span>
            </li>
          )}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));i++;}
      blocks.push(
        <ol key={key++} style={{ margin: '0 0 13px', paddingLeft: 4, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, counterReset: 'mdli' }}>
          {items.map((it, j) =>
          <li key={j} style={{ display: 'flex', gap: 9, color: Z.inkDim, fontSize: 13.5, lineHeight: 1.55 }}>
              <span style={{ fontFamily: Z.mono, fontSize: 12, color: accent, flex: '0 0 auto', minWidth: 16 }}>{j + 1}.</span>
              <span>{mdInline(it, `ol${key}-${j}`)}</span>
            </li>
          )}
        </ol>
      );
      continue;
    }

    // blank line
    if (line.trim() === '') {i++;continue;}

    // paragraph (gather consecutive non-empty, non-special lines)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' &&
    !/^(#{1,4}\s|```|>\s?|\s*[-*]\s|\s*\d+\.\s|(---|\*\*\*|___)\s*$)/.test(lines[i])) {
      buf.push(lines[i]);i++;
    }
    blocks.push(<p key={key++} style={txtStyle}>{mdInline(buf.join(' '), `p${key}`)}</p>);
  }

  return (
    <div>
      {front &&
      <div style={{ marginBottom: 16, padding: '11px 13px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 4 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 9, color: Z.inkFaint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>frontmatter</div>
          <div style={{ display: 'grid', gridTemplateColumns: '128px minmax(0, 1fr)', columnGap: 12, rowGap: 6, alignItems: 'baseline' }}>
            {front.map((f, j) =>
          <React.Fragment key={j}>
                <span style={{ fontFamily: Z.mono, fontSize: 11, color: Z.inkFaint, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.k}</span>
                <span style={{ fontFamily: Z.mono, fontSize: 11.5, color: f.v ? accent : Z.inkFaint, lineHeight: 1.5, wordBreak: 'break-word', minWidth: 0 }}>{f.v || '—'}</span>
              </React.Fragment>
          )}
          </div>
        </div>
      }
      {blocks}
    </div>);

}

// ---- toolbar button -------------------------------------------------------
const MdToolBtn = ({ onClick, title, children, accent }) =>
<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title} style={{
  minWidth: 30, height: 28, padding: '0 7px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}`,
  fontFamily: Z.mono, fontSize: 12, fontWeight: 600, transition: 'all .12s'
}}
onMouseEnter={(e) => {e.currentTarget.style.color = accent;e.currentTarget.style.borderColor = `${accent}66`;}}
onMouseLeave={(e) => {e.currentTarget.style.color = Z.inkDim;e.currentTarget.style.borderColor = Z.line;}}>
  {children}</button>;


// ---- the editor: toolbar + Editor/Náhled tabs -----------------------------
function MarkdownEditor({ value = '', onChange, accent = Z.work, minHeight = 240, placeholder = '' }) {
  const [tab, setTab] = useStateMd('edit'); // 'edit' | 'preview'
  const ref = useRefMd(null);

  // wrap / insert helper operating on the current selection
  const apply = (fn) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart,end = ta.selectionEnd;
    const sel = value.slice(start, end);
    const { text, selStart, selEnd } = fn(sel, value, start, end);
    onChange(text);
    requestAnimationFrame(() => {ta.focus();ta.setSelectionRange(selStart, selEnd);});
  };

  const wrap = (before, after = before, ph = 'text') => apply((sel, val, s, e) => {
    const inner = sel || ph;
    const text = val.slice(0, s) + before + inner + after + val.slice(e);
    return { text, selStart: s + before.length, selEnd: s + before.length + inner.length };
  });

  const linePrefix = (prefix) => apply((sel, val, s, e) => {
    // expand to full lines
    const ls = val.lastIndexOf('\n', s - 1) + 1;
    const le = val.indexOf('\n', e);const end = le === -1 ? val.length : le;
    const chunk = val.slice(ls, end).split('\n').map((l) => prefix + l).join('\n');
    const text = val.slice(0, ls) + chunk + val.slice(end);
    return { text, selStart: ls, selEnd: ls + chunk.length };
  });

  const insertLink = () => apply((sel, val, s, e) => {
    const label = sel || 'odkaz';
    const snippet = `[${label}](https://)`;
    const text = val.slice(0, s) + snippet + val.slice(e);
    const urlStart = s + label.length + 3;
    return { text, selStart: urlStart, selEnd: urlStart + 8 };
  });

  const insertFence = () => apply((sel, val, s, e) => {
    const inner = sel || 'kód';
    const snippet = '```\n' + inner + '\n```';
    const pad = s > 0 && val[s - 1] !== '\n' ? '\n' : '';
    const text = val.slice(0, s) + pad + snippet + val.slice(e);
    const innerStart = s + pad.length + 4;
    return { text, selStart: innerStart, selEnd: innerStart + inner.length };
  });

  const tabBtn = (id, label) => {
    const on = tab === id;
    return (
      <button type="button" onClick={() => setTab(id)} style={{
        fontFamily: Z.mono, fontSize: 11, fontWeight: 600, padding: '6px 13px', cursor: 'pointer', borderRadius: 2, border: 'none',
        color: on ? Z.bg0 : Z.inkDim, background: on ? accent : 'transparent', transition: 'all .12s'
      }}>{label}</button>);

  };

  return (
    <div style={{ marginTop: 8, border: `1px solid ${Z.line}`, borderRadius: 4, overflow: 'hidden', background: Z.bg0 }}>
      {/* top bar: toolbar + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', borderBottom: `1px solid ${Z.line}`, background: Z.bg1, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: tab === 'edit' ? 1 : 0.35, pointerEvents: tab === 'edit' ? 'auto' : 'none', transition: 'opacity .12s' }}>
          <MdToolBtn accent={accent} title="Nadpis" onClick={() => linePrefix('## ')}>H</MdToolBtn>
          <MdToolBtn accent={accent} title="Tučně (⌘B)" onClick={() => wrap('**')}><span style={{ fontWeight: 800 }}>B</span></MdToolBtn>
          <MdToolBtn accent={accent} title="Kurzíva (⌘I)" onClick={() => wrap('*')}><span style={{ fontStyle: 'italic' }}>I</span></MdToolBtn>
          <MdToolBtn accent={accent} title="Kód" onClick={() => wrap('`', '`', 'kód')}>{'</>'}</MdToolBtn>
          <div style={{ width: 1, height: 18, background: Z.line, margin: '0 2px' }} />
          <MdToolBtn accent={accent} title="Odrážky" onClick={() => linePrefix('- ')}>•—</MdToolBtn>
          <MdToolBtn accent={accent} title="Číslovaný seznam" onClick={() => linePrefix('1. ')}>1.</MdToolBtn>
          <MdToolBtn accent={accent} title="Citace" onClick={() => linePrefix('> ')}>❝</MdToolBtn>
          <MdToolBtn accent={accent} title="Blok kódu" onClick={insertFence}>```</MdToolBtn>
          <MdToolBtn accent={accent} title="Odkaz" onClick={insertLink}><Icon name="link" size={14} /></MdToolBtn>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: 3 }}>
          {tabBtn('edit', 'Editor')}
          {tabBtn('preview', 'Náhled')}
        </div>
      </div>

      {/* body */}
      {tab === 'edit' ?
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {e.preventDefault();wrap('**');}
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {e.preventDefault();wrap('*');}
          if (e.key === 'Tab') {e.preventDefault();apply((sel, val, s) => ({ text: val.slice(0, s) + '  ' + val.slice(s), selStart: s + 2, selEnd: s + 2 }));}
        }}
        style={{
          display: 'block', width: '100%', minHeight, padding: '14px 15px', resize: 'vertical',
          background: Z.bg0, border: 'none', color: Z.ink, fontFamily: Z.mono, fontSize: 12.5, lineHeight: 1.6,
          outline: 'none', boxSizing: 'border-box'
        }} /> :


      <div style={{ minHeight, padding: '16px 18px', background: Z.bg0, overflow: 'auto', maxHeight: 420 }}>
          {value.trim() ? <MarkdownView source={value} accent={accent} /> : <Mono style={{ fontSize: 12, color: Z.inkFaint }}>Nic k zobrazení.</Mono>}
        </div>
      }
    </div>);

}

Object.assign(window, { MarkdownView, MarkdownEditor, splitFrontmatter });
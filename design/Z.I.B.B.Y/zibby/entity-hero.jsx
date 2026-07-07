// ZIBBY velín — sdílený "profilový" hero pro Agenty a Pipeline (Orchestrace).
// Obrázek nese hlavní identitu entity — nahrazuje glyph ve všech kartách,
// řetězení fází i rychlém spuštění. Editace je navržena jako editace profilu:
// obrázek na pozadí, přes něj dole název + popis, pod ním se obrázek ztrácí
// do panelu a pokračuje zbytek formuláře/detailu.
const { useState: useStateEH, useRef: useRefEH } = React;

const fileToDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

// malé kruhové tlačítko nad hero (upload / odebrat)
const HeroIconBtn = ({ icon, title, onClick, danger = false }) => (
  <button
    onClick={onClick} title={title}
    style={{
      width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 2, cursor: 'pointer',
      background: 'rgba(9,12,17,0.72)', border: `1px solid ${danger ? 'rgba(255,107,107,0.5)' : 'rgba(255,255,255,0.18)'}`,
      color: danger ? '#ff6b6b' : '#e6edf3', backdropFilter: 'blur(3px)', transition: 'all .13s',
    }}
  >
    <Icon name={icon} size={14} stroke={1.8} />
  </button>
);

// ---- EntityHero -----------------------------------------------------------
// image     — dataURL/URL aktuálního avataru (null = zatím žádný)
// glyph     — fallback glyf, když avatar chybí
// accent    — akcentní barva entity
// name      — jméno (živě z draftu)
// tag       — volitelný uzel (pill/badge) nad jménem
// meta      — volitelný uzel pod jménem (kategorie, počet fází…)
// desc      — krátký popis pod meta
// editable  — zapne upload/drag&drop/odebrání
// onUpload(dataURL) / onRemove()
// height    — výška hero pásu
const EntityHero = ({ image, glyph = 'bot', accent = '#5b8def', name, tag, meta, desc, editable = false, onUpload, onRemove, height = 190, placeholder = 'Nahraj obrázek', controlsSide = 'right', extraControls, fit = 'cover' }) => {
  const [drag, setDrag] = useStateEH(false);
  const [hover, setHover] = useStateEH(false);
  const inputRef = useRefEH(null);

  const handleFiles = async (files) => {
    const f = files && files[0];
    if (!f || !f.type || !f.type.startsWith('image/')) return;
    const url = await fileToDataURL(f);
    onUpload && onUpload(url);
  };

  return (
    <div
      onMouseEnter={() => editable && setHover(true)}
      onMouseLeave={() => editable && setHover(false)}
      onDragOver={(e) => { if (!editable) return; e.preventDefault(); setDrag(true); }}
      onDragLeave={() => editable && setDrag(false)}
      onDrop={(e) => { if (!editable) return; e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => editable && !image && inputRef.current && inputRef.current.click()}
      style={{
        position: 'relative', height, flex: '0 0 auto', overflow: 'hidden',
        background: image ? '#05070a' : `linear-gradient(135deg, ${accent}26, ${Z.bg0} 72%)`,
        cursor: editable && !image ? 'pointer' : 'default',
        outline: drag ? `2px dashed ${accent}` : 'none', outlineOffset: -2,
      }}
    >
      {image && (
        <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition: 'center' }} />
      )}
      {!image && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Icon name={glyph} size={Math.round(height * 0.36)} style={{ color: accent, opacity: 0.25 }} />
        </div>
      )}

      {/* fade to panel bg at the bottom — image "dissolves" into the rest of the form */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, rgba(5,7,10,0) 38%, ${Z.panelHi} 97%)` }} />
      {/* light top scrim so top-right controls stay legible on bright images */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />

      {/* upload / remove controls */}
      {editable && (
        <div style={{ position: 'absolute', top: 12, [controlsSide]: 12, display: 'flex', gap: 7, opacity: (hover || !image) ? 1 : 0, transition: 'opacity .15s' }}>
          <HeroIconBtn icon={image ? 'edit' : 'upload'} title={image ? 'Nahradit obrázek' : 'Nahrát obrázek'} onClick={(e) => { e.stopPropagation(); inputRef.current && inputRef.current.click(); }} />
          {image && <HeroIconBtn icon="trash" title="Odebrat obrázek" danger onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }} />}
        </div>
      )}
      {editable && (
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      )}
      {extraControls && (
        <div style={{ position: 'absolute', top: 12, [controlsSide === 'right' ? 'left' : 'right']: 12, display: 'flex', gap: 7, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
          {extraControls}
        </div>
      )}

      {/* empty-state hint (editable, no image) */}
      {editable && !image && (
        <div style={{ position: 'absolute', top: 14, left: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="image" size={13} style={{ color: accent }} />
          <Mono style={{ fontSize: 10, color: accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{placeholder}</Mono>
        </div>
      )}

      {/* name / meta / desc overlay */}
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 14, zIndex: 1 }}>
        {tag && <div style={{ marginBottom: 7 }}>{tag}</div>}
        <div style={{ fontFamily: Z.mono, fontSize: 22, fontWeight: 700, color: Z.ink, textShadow: '0 2px 14px rgba(0,0,0,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        {meta && <div style={{ marginTop: 6 }}>{meta}</div>}
        {desc && <div style={{ fontSize: 12.5, color: Z.inkDim, marginTop: 5, lineHeight: 1.4, maxWidth: '62ch', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>{desc}</div>}
      </div>
    </div>
  );
};

// ---- AvatarSwap — compact clickable avatar for toolbars/editors ----------
// Same upload/remove behaviour as EntityHero but sized like a normal icon
// box, for places too tight for a full hero (e.g. the graph editor toolbar).
const AvatarSwap = ({ image, glyph = 'bot', accent = '#5b8def', size = 36, onUpload, onRemove }) => {
  const [hover, setHover] = useStateEH(false);
  const inputRef = useRefEH(null);
  const handleFiles = async (files) => {
    const f = files && files[0];
    if (!f || !f.type || !f.type.startsWith('image/')) return;
    onUpload && onUpload(await fileToDataURL(f));
  };
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => inputRef.current && inputRef.current.click()}
      title="Nahrát obrázek"
      style={{
        position: 'relative', width: size, height: size, flex: '0 0 auto', borderRadius: 2, cursor: 'pointer',
        overflow: 'hidden', background: image ? '#000' : `${accent}1c`, border: `1px solid ${accent}44`,
      }}
    >
      {image
        ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: accent }}><Icon name={glyph} size={Math.round(size * 0.52)} /></div>}
      {hover && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,10,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon name="upload" size={13} style={{ color: '#e6edf3' }} />
        </div>
      )}
      {image && hover && (
        <button onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }} title="Odebrat obrázek"
          style={{ position: 'absolute', top: -2, right: -2, width: 15, height: 15, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#0b0e13', border: '1px solid rgba(255,107,107,0.6)', color: '#ff6b6b', cursor: 'pointer', padding: 0 }}>
          <Icon name="x" size={9} />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

Object.assign(window, { EntityHero, fileToDataURL, HeroIconBtn, AvatarSwap });

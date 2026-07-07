// ZIBBY velín — Projekty: katalog cílových adresářů pro agenty a skilly
const { useState: useStatePJ } = React;

// ── Karta projektu ────────────────────────────────────────────────────────
const ProjectCard = ({ project, accent, onOpen }) => {
  const [h, setH] = useStatePJ(false);

  return (
    <div
      onClick={() => onOpen(project.id)} onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', background: h ? Z.panelHi : Z.panel,
        border: `1px solid ${h ? accent + '55' : Z.line}`, borderRadius: Z.rPanel, padding: 16,
        cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: h ? '0 8px 26px rgba(0,0,0,0.4)' : 'none',
      }}>
      {h && <Corners color={accent} inset={5} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}>
          <Icon name="code" size={18} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.mono, fontSize: 13.5, fontWeight: 700, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</div>
          <div style={{ fontFamily: Z.mono, fontSize: 10, color: Z.inkFaint, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.path}</div>
        </div>
      </div>

      {project.desc && (
        <div style={{ fontSize: 11.5, color: Z.inkDim, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{project.desc}</div>
      )}


    </div>
  );
};

// ── Modal editoru ─────────────────────────────────────────────────────────
const ProjectModal = ({ project, isNew, accent, cats, onClose, onSave, onDelete }) => {
  const [name, setName] = useStatePJ(project.name || '');
  const [path, setPath] = useStatePJ(project.path || '~/Projects/');
  const [desc, setDesc] = useStatePJ(project.desc || '');
  const [category, setCategory] = useStatePJ(project.category || (cats && cats[0]) || '');
  const [confirm, setConfirm] = useStatePJ(false);

  const valid = name.trim().length > 0 && path.trim().length > 0;

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: 4, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}>
            <Icon name="code" size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.mono, fontSize: 15, fontWeight: 700, color: Z.ink }}>{isNew ? 'Nový projekt' : 'Upravit projekt'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>název · cesta · kategorie · popis</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>

        {/* body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <FieldLabel>Název projektu</FieldLabel>
            <TextInput mono onChange={setName} placeholder="media-vault" value={name} />
          </div>
          <div>
            <FieldLabel>Cesta k rootu <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· na hostitelském systému</span></FieldLabel>
            <TextInput mono onChange={setPath} placeholder="~/Projects/media-vault" value={path} />
          </div>
          <div>
            <FieldLabel>Kategorie</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
              {(cats || []).map(c => (
                <ChipToggle accent={accent} active={category === c} key={c} onClick={() => setCategory(c)}>{c}</ChipToggle>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>Popis <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· volitelné</span></FieldLabel>
            <TextInput onChange={setDesc} placeholder="Čím se projekt zabývá" value={desc} />
          </div>

        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew
            ? <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}>
                <Icon name="trash" size={13} /> Smazat
              </button>
            : <div></div>
          }
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: 2, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            <RunBtn accent={accent} icon="plus" label={isNew ? 'Vytvořit projekt' : 'Uložit změny'}
              onClick={() => valid && onSave({ ...project, name: name.trim(), path: path.trim(), desc: desc.trim(), category })} />
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          message={<span>Opravdu smazat projekt <Mono style={{ color: Z.ink }}>{project.name}</Mono>? Soubory na disku zůstanou, odebere se jen záznam z velínu.</span>}
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); onDelete(project.id); }}
          title="Smazat projekt?"
        />
      )}
    </div>
  );
};

// ── ProjectsBody ──────────────────────────────────────────────────────────
const ProjectsBody = ({ accent, projects, setProjects, cats = [], setCats }) => {
  const [openId, setOpenId] = useStatePJ(null);
  const [newDraft, setNewDraft] = useStatePJ(null);

  const openProject = (projects || []).find(p => p.id === openId) || null;

  const save = (proj, isNew) => {
    if (isNew) {
      const id = (proj.name || 'projekt').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('project-' + Date.now());
      setProjects(prev => [...prev, { ...proj, id }]);
      setNewDraft(null);
    } else {
      setProjects(prev => prev.map(p => p.id === proj.id ? proj : p));
      setOpenId(null);
    }
  };
  const del = id => { setProjects(prev => prev.filter(p => p.id !== id)); setOpenId(null); };
  const startNew = () => setNewDraft({ id: '', name: '', path: '~/Projects/', desc: '', category: cats[0] || '' });

  const addCat = (name) => setCats(prev => prev.includes(name) ? prev : [...prev, name]);
  const delCat = (name) => {
    if ((projects || []).some(p => p.category === name)) return;
    setCats(prev => prev.filter(c => c !== name));
  };

  const total = (projects || []).length;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <HudPanel accent={accent} pad={20}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Projekty</div>
            <Mono style={{ fontSize: 11.5, color: Z.inkDim, display: 'block', marginTop: 7 }}>
              {total} projekt{total === 1 ? '' : total <= 4 ? 'y' : 'ů'} · cílové adresáře pro spouštění agentů a skillů
            </Mono>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CatAdder accent={accent} existing={cats} onAdd={addCat} />
            <RunBtn accent={accent} icon="plus" label="Přidat projekt" onClick={startNew} />
          </div>
        </div>
      </HudPanel>

      {cats.map(cat => {
        const items = (projects || []).filter(p => p.category === cat);
        const empty = items.length === 0;
        return (
          <div key={cat}>
            <SectionLabel right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{items.length}</Mono>
                {empty && (
                  <button onClick={() => delCat(cat)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: Z.mono, fontSize: 10, padding: '4px 9px', cursor: 'pointer', borderRadius: 2, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}44` }} title="Smazat prázdnou kategorii">
                    <Icon name="trash" size={12} /> Smazat
                  </button>
                )}
              </div>
            }>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="code" size={13} style={{ color: accent }} /> {cat}
              </span>
            </SectionLabel>
            {items.length > 0
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 13 }}>
                  {items.map(p => <ProjectCard accent={accent} key={p.id} onOpen={setOpenId} project={p} />)}
                </div>
              : <div style={{ padding: '18px 16px', border: `1px dashed ${Z.line}`, borderRadius: 3, textAlign: 'center' }}>
                  <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Prázdná kategorie — přidej sem projekt, nebo ji smaž.</Mono>
                </div>
            }
          </div>
        );
      })}

      {openProject && (
        <ProjectModal accent={accent} cats={cats} isNew={false} key={openProject.id} onClose={() => setOpenId(null)}
          onDelete={del} onSave={p => save(p, false)} project={openProject} />
      )}
      {newDraft && (
        <ProjectModal accent={accent} cats={cats} isNew={true} key="new" onClose={() => setNewDraft(null)}
          onDelete={del} onSave={p => save(p, true)} project={newDraft} />
      )}
    </div>
  );
};

Object.assign(window, { ProjectsBody, ProjectCard, ProjectModal });

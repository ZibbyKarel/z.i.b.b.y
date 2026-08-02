// ZIBBY velín — Firmy (Companies): super-entita nad projekty.
// Net-new (P0 #2 z promptu design/refresh) — katalog + detail: kanonický tým,
// výchozí rozpočet (dědí se do projektů), propojení/odpojení projektů.
const { useState: useStateCo } = React;

const NumberField = ({ label, value, onChange, suffix }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{
        width: 90, padding: '8px 10px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl,
        color: Z.ink, fontFamily: Z.mono, fontSize: 13, outline: 'none',
      }} />
      {suffix && <Mono style={{ fontSize: 11, color: Z.inkFaint }}>{suffix}</Mono>}
    </div>
  </div>
);

const VipBadge = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, border: `1px solid ${Z.warn}55`, background: `${Z.warn}18`, fontFamily: Z.mono, fontSize: 9.5, fontWeight: 700, color: Z.warn, letterSpacing: '0.04em' }}>VIP</span>
);

// ── Karta firmy (seznam) ───────────────────────────────────────────────────
const CompanyCard = ({ company, accent, active, onOpen }) => {
  const nProj = company.projectIds.length;
  return (
    <div onClick={() => onOpen(company.id)} style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '15px 16px', cursor: 'pointer',
      background: active ? Z.panelHi : Z.panel, border: `1px solid ${active ? accent + '66' : Z.line}`, borderRadius: Z.rPanel,
      boxShadow: active ? `0 0 0 1px ${accent}22` : 'none', transition: 'all .14s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}>
          <Icon name="building" size={17} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: Z.sans, fontSize: 14.5, fontWeight: 600, color: Z.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: Z.inkDim, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{company.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{nProj} projekt{nProj === 1 ? '' : nProj >= 2 && nProj <= 4 ? 'y' : 'ů'}</Mono>
        <Mono style={{ fontSize: 10, color: Z.inkFaint }}>{company.team.length} lidí</Mono>
        <Mono style={{ fontSize: 10, color: Z.inkFaint, marginLeft: 'auto' }}>${company.budget.monthly}/měs</Mono>
      </div>
    </div>
  );
};

// ── Modal: nová / upravit firma (jméno, popis) ────────────────────────────
const CompanyFormModal = ({ company, isNew, accent, onClose, onSave, onDelete }) => {
  const [name, setName] = useStateCo(company.name || '');
  const [desc, setDesc] = useStateCo(company.desc || '');
  const [confirm, setConfirm] = useStateCo(false);
  const valid = name.trim().length > 0;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <div style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: Z.rCtl, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}44` }}>
            <Icon name="building" size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>{isNew ? 'Nová firma' : 'Upravit firmu'}</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>název · popis</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <FieldLabel>Název firmy</FieldLabel>
            <TextInput value={name} onChange={setName} placeholder="Acme Corp" />
          </div>
          <div>
            <FieldLabel>Popis <span style={{ color: Z.inkFaint, textTransform: 'none', letterSpacing: 0 }}>· volitelné</span></FieldLabel>
            <TextInput value={desc} onChange={setDesc} placeholder="Čím se firma zabývá" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          {!isNew ? (
            <button onClick={() => setConfirm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: Z.mono, fontSize: 12, padding: '8px 13px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.bad, background: 'transparent', border: `1px solid ${Z.bad}55` }}>
              <Icon name="trash" size={13} /> Smazat
            </button>
          ) : <div></div>}
          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
            <RunBtn accent={accent} icon="plus" label={isNew ? 'Vytvořit firmu' : 'Uložit změny'}
              onClick={() => valid && onSave({ ...company, name: name.trim(), desc: desc.trim() })} />
          </div>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog title="Smazat firmu?"
          message={<span>Opravdu smazat firmu <Mono style={{ color: Z.ink }}>{company.name}</Mono>? Propojené projekty zůstanou, jen ztratí vazbu na firmu.</span>}
          onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDelete(company.id); }} />
      )}
    </div>
  );
};

// ── Modal: propojit projekt(y) ─────────────────────────────────────────────
const LinkProjectDialog = ({ company, allProjects, allCompanies, accent, onClose, onApply }) => {
  const [sel, setSel] = useStateCo(new Set(company.projectIds));
  const toggle = (id) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ownerOf = (pid) => allCompanies.find((c) => c.id !== company.id && c.projectIds.includes(pid));
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,7,10,0.72)', backdropFilter: 'blur(3px)', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: Z.panelHi, border: `1px solid ${Z.lineHi}`, borderRadius: Z.rPanel, boxShadow: `0 0 0 1px ${accent}33, 0 30px 80px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${Z.line}` }}>
          <Icon name="link" size={18} style={{ color: accent }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 15, fontWeight: 600, color: Z.ink }}>Propojit projekty</div>
            <Mono style={{ fontSize: 10.5, color: Z.inkFaint }}>{company.name}</Mono>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: '10px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allProjects.map((p) => {
            const owner = ownerOf(p.id);
            const on = sel.has(p.id);
            return (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 10px', borderRadius: Z.rCtl, cursor: 'pointer', background: on ? `${accent}12` : 'transparent', border: `1px solid ${on ? accent + '55' : Z.line}` }}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} style={{ accentColor: accent, width: 15, height: 15, flex: '0 0 auto' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: Z.mono, fontSize: 12.5, color: Z.ink }}>{p.name}</div>
                  <div style={{ fontFamily: Z.mono, fontSize: 10, color: Z.inkFaint }}>{p.path}</div>
                </div>
                {owner && !on && <Mono style={{ fontSize: 9.5, color: Z.inkFaint, flex: '0 0 auto' }}>u {owner.name}</Mono>}
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, padding: '14px 20px', borderTop: `1px solid ${Z.line}` }}>
          <button onClick={onClose} style={{ fontFamily: Z.mono, fontSize: 12, padding: '8px 15px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
          <RunBtn accent={accent} icon="check" label="Uložit propojení" onClick={() => onApply(Array.from(sel))} />
        </div>
      </div>
    </div>
  );
};

// ── Přidat člena týmu (inline formulář) ───────────────────────────────────
const AddTeamMemberRow = ({ accent, onAdd }) => {
  const [open, setOpen] = useStateCo(false);
  const [name, setName] = useStateCo('');
  const [role, setRole] = useStateCo('');
  if (!open) return <GhostBtn icon="plus" accent={accent} onClick={() => setOpen(true)}>Přidat člena týmu</GhostBtn>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 12, background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jméno" autoFocus style={{ flex: 1, padding: '7px 10px', background: Z.panel, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, color: Z.ink, fontSize: 12.5, outline: 'none' }} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" style={{ width: 140, padding: '7px 10px', background: Z.panel, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl, color: Z.ink, fontSize: 12.5, outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => setOpen(false)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 12px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zrušit</button>
        <RunBtn accent={accent} size="sm" icon="plus" label="Přidat" onClick={() => { if (!name.trim()) return; onAdd({ id: 'p' + Date.now(), name: name.trim(), role: role.trim() || 'Člen týmu', email: '', commStyle: '', vip: false }); setName(''); setRole(''); setOpen(false); }} />
      </div>
    </div>
  );
};

// ── Detail firmy ───────────────────────────────────────────────────────────
const CompanyDetailScreen = ({ company, accent, allProjects, allCompanies, onEdit, onUpdate }) => {
  const [linkOpen, setLinkOpen] = useStateCo(false);
  const [budgetDraft, setBudgetDraft] = useStateCo(null);

  const linkedProjects = company.projectIds.map((id) => allProjects.find((p) => p.id === id)).filter(Boolean);
  const budget = budgetDraft || company.budget;

  const saveBudget = () => { onUpdate({ ...company, budget }); setBudgetDraft(null); };
  const removeMember = (id) => onUpdate({ ...company, team: company.team.filter((m) => m.id !== id) });
  const addMember = (m) => onUpdate({ ...company, team: [...company.team, m] });
  const unlinkProject = (id) => onUpdate({ ...company, projectIds: company.projectIds.filter((x) => x !== id) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: Z.rPanel, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}>
          <Icon name="building" size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: Z.sans, fontSize: 21, fontWeight: 600, color: Z.ink }}>{company.name}</div>
          <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>{company.desc}</div>
        </div>
        <GhostBtn icon="edit" onClick={onEdit}>Upravit</GhostBtn>
      </div>

      <HudPanel accent={accent} title="Výchozí rozpočet" right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>dědí se do projektů</Mono>}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <NumberField label="Denní limit" value={budget.daily} onChange={(v) => setBudgetDraft({ ...budget, daily: v })} suffix="$/den" />
          <NumberField label="Týdenní limit" value={budget.weekly} onChange={(v) => setBudgetDraft({ ...budget, weekly: v })} suffix="$/týd" />
          <NumberField label="Měsíční limit" value={budget.monthly} onChange={(v) => setBudgetDraft({ ...budget, monthly: v })} suffix="$/měs" />
          <NumberField label="Cost cap" value={budget.costCap} onChange={(v) => setBudgetDraft({ ...budget, costCap: v })} suffix="$ tvrdý strop" />
        </div>
        <div style={{ fontSize: 11.5, color: Z.inkFaint, marginTop: 12, lineHeight: 1.5 }}>
          Projekt bez vlastního rozpočtu dědí tyto limity. Efektivní rozpočet projektu = přísnější z vlastního a firemního.
        </div>
        {budgetDraft && (
          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <RunBtn accent={accent} size="sm" icon="check" label="Uložit rozpočet" onClick={saveBudget} />
            <button onClick={() => setBudgetDraft(null)} style={{ fontFamily: Z.mono, fontSize: 11, padding: '6px 12px', cursor: 'pointer', borderRadius: Z.rCtl, color: Z.inkDim, background: 'transparent', border: `1px solid ${Z.line}` }}>Zahodit</button>
          </div>
        )}
      </HudPanel>

      <HudPanel accent={accent} title="Kanonický tým" right={<Mono style={{ fontSize: 10, color: Z.inkFaint }}>{company.team.length}</Mono>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {company.team.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
              <div style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent, fontFamily: Z.mono, fontSize: 12, fontWeight: 700 }}>{m.name.slice(0, 1)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: Z.ink, fontWeight: 500 }}>{m.name}</span>
                  {m.vip && <VipBadge />}
                </div>
                <div style={{ fontSize: 11, color: Z.inkDim, marginTop: 2 }}>{m.role}{m.commStyle ? ` · ${m.commStyle}` : ''}</div>
              </div>
              <button onClick={() => removeMember(m.id)} title="Odebrat z týmu" style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={14} /></button>
            </div>
          ))}
          {!company.team.length && <Mono style={{ fontSize: 11, color: Z.inkFaint, fontStyle: 'italic' }}>zatím žádní lidé</Mono>}
        </div>
        <div style={{ marginTop: 12 }}><AddTeamMemberRow accent={accent} onAdd={addMember} /></div>
      </HudPanel>

      <HudPanel accent={accent} title="Propojené projekty" right={<RunBtn accent={accent} size="sm" icon="link" label="Propojit projekt" onClick={() => setLinkOpen(true)} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkedProjects.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', background: Z.bg0, border: `1px solid ${Z.line}`, borderRadius: Z.rCtl }}>
              <div style={{ width: 28, height: 28, flex: '0 0 auto', borderRadius: 2, display: 'grid', placeItems: 'center', background: `${accent}1c`, color: accent }}><Icon name="code" size={14} /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: Z.mono, fontSize: 12.5, color: Z.ink }}>{p.name}</div>
                <div style={{ fontFamily: Z.mono, fontSize: 10, color: Z.inkFaint }}>{p.path}</div>
              </div>
              <button onClick={() => unlinkProject(p.id)} title="Odpojit projekt" style={{ background: 'transparent', border: 'none', color: Z.inkFaint, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="x" size={14} /></button>
            </div>
          ))}
          {!linkedProjects.length && (
            <div style={{ padding: '16px 12px', border: `1px dashed ${Z.line}`, borderRadius: Z.rCtl, textAlign: 'center' }}>
              <Mono style={{ fontSize: 11, color: Z.inkFaint }}>Žádný projekt zatím není propojen.</Mono>
            </div>
          )}
        </div>
      </HudPanel>

      {linkOpen && (
        <LinkProjectDialog company={company} allProjects={allProjects} allCompanies={allCompanies} accent={accent}
          onClose={() => setLinkOpen(false)}
          onApply={(ids) => { onUpdate({ ...company, projectIds: ids }); setLinkOpen(false); }} />
      )}
    </div>
  );
};

// ── Root: katalog + master-detail ─────────────────────────────────────────
const CompaniesScreen = ({ accent }) => {
  const [companies, setCompanies] = useStateCo(COMPANIES);
  const [projects] = useStateCo(PROJECTS_DATA);
  const [selectedId, setSelectedId] = useStateCo(COMPANIES[0].id);
  const [editing, setEditing] = useStateCo(null); // company object being edited, or null
  const [creating, setCreating] = useStateCo(false);

  const company = companies.find((c) => c.id === selectedId) || companies[0];

  const updateCompany = (next) => setCompanies((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  const saveEdit = (next) => { updateCompany(next); setEditing(null); };
  const deleteCompany = (id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    setEditing(null);
    if (selectedId === id) setSelectedId((prev2) => (companies.find((c) => c.id !== id) || {}).id);
  };
  const createCompany = (draft) => {
    const id = (draft.name || 'firma').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('company-' + Date.now());
    const next = { id, name: draft.name, desc: draft.desc, glyph: 'building', budget: { daily: 10, weekly: 40, monthly: 150, costCap: 200 }, team: [], projectIds: [] };
    setCompanies((prev) => [...prev, next]);
    setSelectedId(id);
    setCreating(false);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ flex: '0 0 340px', minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: Z.sans, fontSize: 22, fontWeight: 600, color: Z.ink }}>Firmy</div>
            <div style={{ fontSize: 13, color: Z.inkDim, marginTop: 4 }}>Super-entita nad projekty — tým a rozpočet se dědí dolů.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {companies.map((c) => <CompanyCard key={c.id} company={c} accent={accent} active={c.id === company.id} onOpen={setSelectedId} />)}
          </div>
          <div style={{ marginTop: 16 }}><RunBtn accent={accent} label="Nová firma" icon="plus" onClick={() => setCreating(true)} /></div>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {company && (
            <CompanyDetailScreen key={company.id} company={company} accent={accent} allProjects={projects} allCompanies={companies}
              onEdit={() => setEditing(company)} onUpdate={updateCompany} />
          )}
        </div>
      </div>
      {editing && (
        <CompanyFormModal company={editing} isNew={false} accent={accent}
          onClose={() => setEditing(null)} onSave={saveEdit} onDelete={deleteCompany} />
      )}
      {creating && (
        <CompanyFormModal company={{ name: '', desc: '' }} isNew={true} accent={accent}
          onClose={() => setCreating(false)} onSave={createCompany} onDelete={() => {}} />
      )}
    </div>
  );
};

Object.assign(window, { CompaniesScreen, CompanyCard, CompanyDetailScreen, LinkProjectDialog, CompanyFormModal });

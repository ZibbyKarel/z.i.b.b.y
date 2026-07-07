// ZIBBY Velín-B — data pro rozšířený velín (mezery vůči finální vizi).
// Drží stejné projekty/jména jako zbytek velínu (auth-svc, media-vault, home-ops…).

// ── Souhrn autonomie přes noc (3 tiery z vize) ────────────────────────────
const VB_OVERNIGHT = { silent: 9, reported: 2, waiting: 3, learned: 3 };

// ── Narativní úvod ranního brífinku (hlas komorníka) ──────────────────────
const VB_NARRATIVE =
  "Noc proběhla klidně. Doběhly tři běhy, jeden jsem zaparkoval kvůli flaky testu. " +
  "Devět drobností jsem vyřídil sám a zalogoval, dvě věci jsem udělal a reportuji ti je níže, " +
  "tři čekají na tvoje slovo. Přes noc jsem si všiml tří vzorců — jeden ti navrhuju zautomatizovat.";

// ── Brífink: co se stalo přes noc (řádky s akcí podle stavu) ──────────────
const VB_NIGHT = [
  {
    id: 'n1', state: 'ok', proj: 'auth-svc',
    title: 'Build Feature dokončil feat/search-filters',
    sub: '4 fáze · 42 min · test-report zelený · diff +214 −38',
    action: { kind: 'pr', label: 'Otevřít PR' },
  },
  {
    id: 'n2', state: 'wait', proj: 'auth-svc',
    title: 'Build Feature zaparkován po 3 pokusech',
    sub: 'Tester: flaky test v checkout-flow — kandidát na quarantine',
    action: { kind: 'retry', label: 'Retry' },
  },
  {
    id: 'n3', state: 'ok', proj: 'media-vault',
    title: 'Kurátor srovnal 25 souborů podle TMDB',
    sub: 'seriály/ · 0 kolizí · zapsáno do daily/2026-06-14.md',
    action: null,
  },
];

// ── Tier 1 — Act silently (provedeno, zalogováno, neruší) ─────────────────
const VB_TIER1 = [
  { id: 't1a', text: 'Zařadil 3 bug reporty z #bugs do Jira', proj: 'auth-svc', at: '02:14' },
  { id: 't1b', text: 'Odpověděl na 2 interní Slack dotazy v #dev-general', proj: 'auth-svc', at: '03:40' },
  { id: 't1c', text: 'Smazal 4 dočasné větve po merge', proj: 'auth-svc', at: '04:02' },
  { id: 't1d', text: 'Ověřil noční zálohu vaultu na Holly', proj: 'home-ops', at: '04:00' },
  { id: 't1e', text: 'Aktualizoval daily/2026-06-14.md', proj: 'zibby-core', at: '06:55' },
];

// ── Tier 2 — Act then report (provedeno, notifikuje výsledek) ─────────────
const VB_TIER2 = [
  {
    id: 't2a', text: 'Odeslal interní e-mail s release notes',
    note: 'tým auth-svc · ja@firma-a.cz → #dev · 06:31', proj: 'auth-svc',
  },
  {
    id: 't2b', text: 'Naplnil Rohlík košík podle seznamu',
    note: '14 položek · 1 248 Kč · platba zůstává na tobě', proj: 'rohlik-list',
  },
];

// ── Tier 3 — Surface & wait (čeká na tebe) ────────────────────────────────
const VB_TIER3 = [
  { id: 't3a', actor: 'PR Guard', action: 'push origin feat/api-rate-limit → main', risk: 'push', impact: '+214 −38', impactNote: 'review.md čistý · CI zelené' },
  { id: 't3b', actor: 'rohlik', action: 'zaplatit košík', risk: 'platba', impact: '1 248 Kč', impactNote: '14 položek · doručení zítra 18–20 h' },
  { id: 't3c', actor: 'Hospodář', action: 'smazat 6 starých snapshotů (> 1 GB)', risk: 'mazani', impact: '8,4 GB', impactNote: 'Holly · snapshoty starší 90 dní' },
];

// ── Sebeučení — noční konsolidace + vzorce + návrh promote ────────────────
const VB_CONSOLIDATION =
  "Prošel jsem epizodickou paměť za 14. 6. a uložil 3 vzorce do vault/patterns/.";

const VB_PATTERNS = [
  { id: 'p1', file: 'approval-patterns.md', text: 'Push na feat/* po zeleném CI vždy schvaluješ.', evidence: '5 / 5' },
  { id: 'p2', file: 'communication-style.md', text: 'Na Slack odpovídáš stručně, bez pozdravu, v 1–2 větách.', evidence: '11 zpráv' },
  { id: 'p3', file: 'project-auth-svc.md', text: 'Flaky test v checkout-flow se opakuje — navrhuju quarantine.', evidence: '3× za týden' },
];

// návrh povýšení autonomie z Tier 3 → Tier 1 (z approval signálů)
const VB_PROMOTION = {
  pattern: 'Odpověď na technický Slack dotaz v #dev-general',
  evidence: '5× po sobě schváleno · 0× zamítnuto',
  fromTier: 3, toTier: 1, proj: 'auth-svc',
};

// ── Standup taháky per aktivní projekt ────────────────────────────────────
const VB_STANDUPS = [
  {
    id: 's1', proj: 'auth-svc', time: '09:45', role: 'Junior Frontend Developer',
    done: ['JIRA-142 — rate-limiter (merged)', 'JIRA-143 — JWT refresh flow'],
    today: ['JIRA-144 — search filtry (PR čeká na push)'],
    blockers: ['flaky test v checkout-flow (eskalováno)'],
  },
  {
    id: 's2', proj: 'media-vault', time: '—', role: 'osobní knihovna',
    done: ['srovnáno 25 souborů (TMDB)', 'stáhnuto S02E04–E08'],
    today: ['doplnit chybějící plakáty'],
    blockers: [],
  },
];

// ── Self-modification (ZIBBY si vylepšuje sebe) ───────────────────────────
const VB_SELFMOD = {
  title: 'Rozpad Agent SDK kreditu po projektech',
  detail: 'Detekoval jsem chybějící schopnost: ve velínu nevidíš, který projekt spaluje kolik kreditu. Zpracoval jsem to jako standardní dev task na vlastním repozitáři.',
  pr: 'zibby-core#214', diff: '+180 −12', gate: 'Tier 3 — vždy se ptám',
};

// ── Návrhy přirozeným jazykem (command bar) ───────────────────────────────
const VB_SUGGESTIONS = [
  'Projdi backlog a implementuj highest-impact bugy',
  'Sepiš mi standup pro auth-svc',
  'Ukliď na Holly snapshoty nad 1 GB',
];

Object.assign(window, {
  VB_OVERNIGHT, VB_NARRATIVE, VB_NIGHT, VB_TIER1, VB_TIER2, VB_TIER3,
  VB_CONSOLIDATION, VB_PATTERNS, VB_PROMOTION, VB_STANDUPS, VB_SELFMOD, VB_SUGGESTIONS,
});

// ZIBBY velín — demo seed.
//
// The whole `apps/api/data/` dir is gitignored, so mock data can't be committed.
// This script writes a full set of demo skills / agents / pipelines / automations /
// memory-vault / approvals / runs into the API's data dir so every screen is
// populated when you run the app. It mirrors the Claude Design handoff
// (`ZIBBY velín`, data.jsx / data-extra.jsx) mapped onto the real contracts.
//
//   node apps/api/scripts/seed.mjs          # seed everything (stop the API first)
//
// Then (re)start the API so it reconciles the seeded runs from disk:
//   npm run api:dev
//
// Notes on the run states (see DESIGN_VS_API_NOTES.md): the runner relabels a
// `running` run with no live process to `interrupted` on restart, and drops
// done/error runs older than 30 min — so this script stamps fresh timestamps and
// spawns ONE long-lived, token-free demo emitter to give a genuine `running` run.

import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, "..", "data")
const dir = (...p) => path.join(DATA, ...p)

const now = Date.now()
const iso = (msAgo = 0) => new Date(now - msAgo).toISOString()
const MIN = 60_000

async function writeFile(p, contents) {
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, contents, "utf8")
}

/** matter.stringify with a leading blank line + trailing newline (matches the API serializers). */
const md = (body, data) => matter.stringify(`\n${body.trim()}\n`, data)

// ---------------------------------------------------------------- skills ----
// Contract Skill: { id, name, glyph, desc, requires_approval?, risk?, instructions }.
// No category/tools/model in the contract — those design fields can't round-trip.
const SKILLS = [
  { id: "rohlik", name: "rohlik", glyph: "cart", desc: "Naplní košík podle seznamu", tools: ["web", "read"], approval: true, risk: "high", gateRuleIds: ["gr-big-purchase"], when: "Před nákupem — když máš seznam a chceš hotový košík ke schválení." },
  { id: "tmdb-renamer", name: "tmdb-renamer", glyph: "film", desc: "Přejmenuje média podle TMDB", tools: ["read", "write", "web"], risk: "low", when: "Po stažení dávky souborů, které mají rozházené názvy." },
  { id: "holly", name: "holly", glyph: "server", desc: "Ovládá NAS démona Holly", tools: ["bash", "read"], approval: true, risk: "high", when: "Když potřebuješ spravovat NAS — snapshoty, služby, místo na disku." },
  { id: "task-spec-writer", name: "task-spec-writer", glyph: "doc", desc: "Sepíše spec z volného zadání", tools: ["read", "write"], risk: "low", when: "Když máš nápad v hlavě a chceš z něj čitelné zadání." },
  { id: "webshare-downloader", name: "webshare-downloader", glyph: "film", desc: "Stáhne epizody z Webshare", tools: ["web", "bash"], risk: "medium", when: "Když chceš stáhnout konkrétní epizody nebo sezónu." },
  { id: "meal-planner", name: "meal-planner", glyph: "cart", desc: "Sestaví jídelníček na týden", tools: ["web", "write"], risk: "low", when: "V neděli večer, než plánuješ nákup na týden." },
  { id: "photo-cull", name: "photo-cull", glyph: "film", desc: "Vybere nejlepší fotky z dávky", tools: ["read", "write"], risk: "low", when: "Po focení — když máš stovky snímků a chceš výběr." },
  { id: "nas-backup", name: "nas-backup", glyph: "server", desc: "Naplánuje a ověří zálohy vaultu", tools: ["bash", "read"], risk: "medium", when: "Pravidelně — nebo když chceš ověřit, že zálohy sedí." },
  { id: "journal-digest", name: "journal-digest", glyph: "doc", desc: "Shrne týden z poznámek do digestu", tools: ["read", "write"], risk: "low", when: "V pátek — když chceš ohlédnutí za týdnem." },
  { id: "spec-skeleton", name: "spec→skeleton", glyph: "doc", desc: "Spec → kostra PR", tools: ["read", "write", "git"], risk: "medium", when: "Když máš hotový design.md a chceš rozjet implementaci." },
  { id: "pr-prereview", name: "pr-prereview", glyph: "check", desc: "Pre-review otevřeného PR", tools: ["read", "git"], risk: "medium", when: "Před tím, než pošleš PR kolegům na review." },
  { id: "ci-doctor", name: "ci-doctor", glyph: "shield", desc: "Diagnostikuje padající CI", tools: ["read", "bash", "git"], risk: "medium", when: "Když spadne pipeline a nevíš proč." },
  { id: "standup-gen", name: "standup-gen", glyph: "spark", desc: "Vygeneruje standup z gitu", tools: ["read", "git"], approval: true, risk: "medium", gateRuleIds: ["gr-feature-push"], when: "Ráno před standupem." },
  { id: "changelog-gen", name: "changelog-gen", glyph: "doc", desc: "Sestaví changelog z merge commitů", tools: ["read", "git", "write"], risk: "medium", when: "Před releasem — z merge commitů od poslední verze." },
]

const skillBody = (s) => `# ${s.name}

${s.desc}.

## Kdy použít
${s.when}

## Postup
1. Načti vstup a ověř, že dává smysl.
2. Proveď hlavní práci skillu (${s.desc.toLowerCase()}).
3. Vrať shrnutí výsledku${s.tools.includes("write") ? " a zapiš výstup na disk" : ""}.

## Nástroje
${s.tools.map((t) => `- ${t}`).join("\n")}`

async function seedSkills() {
  for (const s of SKILLS) {
    const fm = { name: s.name }
    if (s.glyph) fm.glyph = s.glyph
    if (s.desc) fm.desc = s.desc
    if (s.approval) fm.requires_approval = true
    if (s.risk) fm.risk = s.risk
    if (s.gateRuleIds) fm.gateRuleIds = s.gateRuleIds
    await writeFile(dir("skills", `${s.id}.md`), md(skillBody(s), fm))
  }
  return SKILLS.length
}

// ---------------------------------------------------------------- agents ----
// Contract Agent: full shape incl. category + gates (GateRuleInput[]).
const AGENTS = [
  { id: "architect", name: "Architekt", glyph: "compass", role: "Navrhne řešení a rozepíše plán do design.md", model: "opus", thinking: "high", tools: ["read", "web", "write"], category: "Vývoj" },
  { id: "coder", name: "Kodér", glyph: "code", role: "Implementuje podle design.md v izolované branchi", model: "sonnet", thinking: "medium", tools: ["read", "write", "bash", "git"], category: "Vývoj", approval: true, risk: "medium",
    gates: [
      { match: [{ type: "action", action: "git.push", branch: "feature/*" }], decision: "notify" },
      { match: [{ type: "action", action: "git.force_push" }], decision: "deny" },
    ] },
  { id: "tester", name: "Tester", glyph: "flask", role: "Spustí testy, vrací report a vrací práci zpět", model: "sonnet", thinking: "medium", tools: ["read", "bash", "git"], category: "Kvalita",
    gates: [{ match: [{ type: "tool", tool: "bash" }], decision: "allow" }] },
  { id: "reviewer", name: "Reviewer", glyph: "check", role: "Pre-review diffu před návrhem na push", model: "opus", thinking: "high", tools: ["read", "git"], category: "Kvalita", gateRuleIds: ["gr-push-main", "gr-merge"],
    gates: [{ match: [{ type: "action", action: "git.push" }], decision: "ask", resolve: { type: "human" } }] },
  { id: "researcher", name: "Researcher", glyph: "search", role: "Sbírá zdroje a syntetizuje poznámky do vaultu", model: "sonnet", thinking: "medium", tools: ["read", "web", "write"], category: "Výzkum" },
  { id: "doc", name: "Dokumentátor", glyph: "doc", role: "Sepíše README a changelog z výsledné branche", model: "sonnet", thinking: "low", tools: ["read", "write"], category: "Dokumentace" },
  { id: "curator", name: "Kurátor", glyph: "film", role: "Třídí a popisuje média v knihovně", model: "sonnet", thinking: "low", tools: ["read", "write", "web"], category: "Média" },
  { id: "steward", name: "Hospodář", glyph: "cart", role: "Plánuje nákupy a hlídá domácí zásoby", model: "sonnet", thinking: "medium", tools: ["read", "write", "web"], category: "Domácnost", gateRuleIds: ["gr-big-purchase"] },
  { id: "chronicler", name: "Kronikář", glyph: "doc", role: "Vede deník a sumarizuje týden z poznámek", model: "sonnet", thinking: "low", tools: ["read", "write"], category: "Psaní" },
]

const agentBody = (a) => `# ${a.name}

${a.role}.

## Systémový prompt
Jsi **${a.name}**. ${a.role}. Pracuj samostatně, drž se zadání a vracej stručné shrnutí výsledku.

## Pravidla
- Používej výhradně povolené nástroje: ${a.tools.join(", ")}.
- Přemýšlej na úrovni „${a.thinking}”, model ${a.model}.
- Po dokončení předej výstup další fázi nebo k mé revizi.`

async function seedAgents() {
  for (const a of AGENTS) {
    const fm = { name: a.name, description: a.role, glyph: a.glyph, model: a.model, thinking: a.thinking, tools: a.tools, category: a.category }
    if (a.approval) fm.requires_approval = true
    if (a.risk) fm.risk = a.risk
    if (a.gates) fm.gates = a.gates
    if (a.gateRuleIds) fm.gateRuleIds = a.gateRuleIds
    await writeFile(dir("agents", `${a.id}.md`), md(agentBody(a), fm))
  }
  // Keep the token-free demo agent the runner uses.
  const demo = { name: "Agent 007", description: "Testovací agent — v zadané složce vytvoří soubor a hlásí progress. Nespálí žádné tokeny.", glyph: "bot", model: "haiku", thinking: "low", tools: ["write"] }
  await writeFile(dir("agents", "agent-007.md"), md("You are Agent 007, a token-free test agent used to exercise the run pipeline end to end. In the working folder you are given, create a small marker file and report progress as you go.", demo))

  // Agent categories manifest.
  const CATS = [
    ["Vývoj", "code"], ["Kvalita", "shield"], ["Výzkum", "search"], ["Dokumentace", "spark"],
    ["Média", "film"], ["Domácnost", "cart"], ["Psaní", "doc"],
  ].map(([name, glyph]) => ({ name, glyph }))
  await writeFile(dir("agents", "_categories.json"), JSON.stringify(CATS, null, 2))
  return AGENTS.length + 1
}

// ------------------------------------------------------------- pipelines ----
// Contract phase.agent = agent id (design uses display name); phases need ids;
// loop.then must be an existing phase id or "fail" (design's "park_for_review" → "fail").
const PIPELINES = [
  { id: "build-feature", name: "Build Feature", budget: 25, desc: "Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.",
    phases: [
      { id: "architect", agent: "architect", consumes: "task.md", produces: "design.md", model: "opus", thinking: "high" },
      { id: "coder", agent: "coder", consumes: "design.md", produces: "branch", model: "sonnet", thinking: "medium" },
      { id: "tester", agent: "tester", consumes: "branch", produces: "test-report.md", model: "sonnet", thinking: "medium", loop: { to: "coder", maxRetries: 3, escalate: true, then: "fail" } },
      { id: "doc", agent: "doc", consumes: "branch", produces: "README.md", model: "sonnet", thinking: "low" },
    ] },
  { id: "nightly-research", name: "Nightly Research", budget: 15, desc: "Researcher nasbírá zdroje, Architekt je zsyntetizuje do poznámky.",
    phases: [
      { id: "researcher", agent: "researcher", consumes: "topic.md", produces: "sources.md", model: "sonnet", thinking: "medium" },
      { id: "architect", agent: "architect", consumes: "sources.md", produces: "knowledge.md", model: "opus", thinking: "high" },
    ] },
  { id: "pr-guard", name: "PR Guard", budget: 8, desc: "Reviewer projde diff a připraví push k tvému schválení.",
    phases: [{ id: "reviewer", agent: "reviewer", consumes: "branch", produces: "review.md", model: "opus", thinking: "high" }] },
  { id: "media-tidy", name: "Media tidy", budget: 5, desc: "Stáhne a srovná média na Holly.",
    phases: [
      { id: "researcher", agent: "researcher", consumes: "watchlist.md", produces: "plan.md", model: "sonnet", thinking: "low" },
      { id: "coder", agent: "coder", consumes: "plan.md", produces: "media", model: "sonnet", thinking: "low" },
    ] },
]

async function seedPipelines() {
  for (const p of PIPELINES) {
    const fm = { name: p.name, phases: p.phases, desc: p.desc, budget: p.budget }
    const body = `# ${p.name}\n\n${p.desc}\n\n## Fáze\n${p.phases.map((ph, i) => `${i + 1}. **${ph.agent}** — \`${ph.consumes}\` → \`${ph.produces}\``).join("\n")}`
    await writeFile(dir("pipelines", `${p.id}.pipeline.md`), md(body, fm))
  }
  return PIPELINES.length
}

// ----------------------------------------------------------- automations ----
const AUTOMATIONS = [
  { id: "au-standup", name: "Ranní standup", trigger: { type: "cron", expr: "0 8 * * 1-5" }, target: { type: "skill", skillId: "standup-gen" }, enabled: true, lastFiredAt: iso(60 * MIN) },
  { id: "au-research", name: "Noční research", trigger: { type: "cron", expr: "40 2 * * *" }, target: { type: "pipeline", pipelineId: "nightly-research" }, enabled: true, lastFiredAt: iso(8 * 60 * MIN) },
  { id: "au-media", name: "Po stažení srovnej média", trigger: { type: "event", event: "file.created" }, target: { type: "skill", skillId: "tmdb-renamer" }, enabled: true, lastFiredAt: iso(3 * MIN) },
  { id: "au-nakup", name: "Nedělní nákup", trigger: { type: "cron", expr: "0 18 * * 0" }, target: { type: "skill", skillId: "rohlik" }, enabled: true, lastFiredAt: iso(2 * MIN) },
  { id: "au-backup", name: "Záloha vaultu", trigger: { type: "cron", expr: "0 4 * * *" }, target: { type: "skill", skillId: "nas-backup" }, enabled: true, lastFiredAt: iso(6 * 60 * MIN) },
  { id: "au-pr", name: "Hlídač PR", trigger: { type: "event", event: "pr.opened" }, target: { type: "pipeline", pipelineId: "pr-guard" }, enabled: false },
]

async function seedAutomations() {
  for (const a of AUTOMATIONS) await writeFile(dir("automations", `${a.id}.json`), JSON.stringify(a, null, 2))
  return AUTOMATIONS.length
}

// ----------------------------------------------------------------- vault ----
// tier comes from the top dir: root + MOC/ → memory, knowledge/ → knowledge, daily/ → daily.
const NOTES = [
  { path: "index.md", title: "index.md", body: "# index · MOC\n\nVstupní bod vaultu. Odsud vede cesta ke všemu — ZIBBY čte odtud, ne přes vektory.\n\n## Oblasti\n- [[MEMORY]] — dlouhodobá fakta o mně\n- [[projekty]] — co se zrovna staví\n\n## Poslední dny\n- [[2026-05-30]]\n- [[2026-05-29]]" },
  { path: "MOC/projekty.md", title: "projekty", body: "# projekty · MOC\n\nRozcestník aktivních projektů.\n\n- [[zibby-architektura]]\n- [[media-pipeline]]\n- [[git-workflow]]" },
  { path: "MEMORY.md", title: "MEMORY.md", body: "# MEMORY\n\nDlouhodobá, stabilní fakta. Re-anchor sem vrací kontext po kompakci.\n\n## O mně\n- Honza, vývojář, Praha. Mac M5 jako host.\n- NAS „Holly” na holly.local.\n\n## Preference\n- Češtinu má radši než angličtinu.\n- Nikdy neplatit ani nemazat bez ptaní.\n\n## Vztahy\n- [[zibby-architektura]] řídí celý velín." },
  { path: "knowledge/zibby-architektura.md", title: "ZIBBY architektura", body: "# ZIBBY architektura\n\nSoubory jsou jediný zdroj pravdy. Démon běží jako služba na hostu, agenty pouští jako child procesy.\n\n- Skilly: `~/zibby/skills/<id>/SKILL.md`\n- Agenti: `~/zibby/agents/<id>.agent.md`\n- Approval gate je hard-enforcement vrstva.\n\nViz [[claude-sdk]], [[git-workflow]]." },
  { path: "knowledge/rohlik.md", title: "Rohlik", body: "# Rohlik\n\nSkill `rohlik` plní košík přes API. Objednávka = riziková akce → vždy schválení.\n\n- Doručovací okna 18–20h preferovaná.\n- Viz daily [[2026-05-30]]." },
  { path: "knowledge/holly-nas.md", title: "Holly (NAS)", body: "# Holly (NAS)\n\nHolly NENÍ host démona — je to NAS ovládaný skillem `holly`.\n\n- Snapshoty: btrfs, retence 90 dní.\n- Mazání snapshotů = riziková akce." },
  { path: "knowledge/claude-sdk.md", title: "Claude Agent SDK", body: "# Claude Agent SDK\n\nBěhy agentů čerpají z odděleného $ měšce (priorita). Interaktivní limity jsou jinde.\n\nViz [[zibby-architektura]]." },
  { path: "knowledge/git-workflow.md", title: "Git workflow", body: "# Git workflow\n\nAgenti pracují v izolovaných branchích. Push origin = riziková akce → approval.\n\nPipeline [[zibby-architektura]] parkuje PR k ranní review." },
  { path: "knowledge/media-pipeline.md", title: "Media pipeline", body: "# Media pipeline\n\nWebshare → JDownloader → Holly → tmdb-renamer. Pojmenování dle TMDB.\n\nViz [[rohlik]], daily [[2026-05-28]]." },
  { path: "daily/2026-05-30.md", title: "2026-05-30", body: "# 2026-05-30\n\n- standup-gen aktualizoval [[MEMORY]].\n- rohlik sestavil košík → čekalo na schválení. Viz [[rohlik]].\n- ci-doctor opravil flaky test." },
  { path: "daily/2026-05-29.md", title: "2026-05-29", body: "# 2026-05-29\n\n- Build Feature dotáhl search filtry.\n- Diskuze o [[git-workflow]] a push gate." },
  { path: "daily/2026-05-28.md", title: "2026-05-28", body: "# 2026-05-28\n\n- Stažena S02 přes [[media-pipeline]].\n- Holly měl málo místa → [[holly-nas]]." },
  { path: "daily/2026-05-27.md", title: "2026-05-27", body: "# 2026-05-27\n\n- Nightly Research → poznámka o local-first sync.\n- Viz [[claude-sdk]]." },
]

async function seedVault() {
  for (const n of NOTES) await writeFile(dir("vault", n.path), md(n.body, { title: n.title }))
  return NOTES.length
}

// ------------------------------------------------- runs + approvals -------
// A run sidecar (skill kind) + its log. Each `awaiting-approval` run is referenced
// by one approval so approve→resume / reject→cancel resolve cleanly.
const SKILL_RUNS_DIR = dir("skills", "runs")
const AGENT_RUNS_DIR = dir("agents", "runs")

function runId(owner, startedMs, pid) {
  return `${owner}_${startedMs}_${pid}`
}

async function writeRun(runsDir, rec, logLines) {
  await fs.mkdir(runsDir, { recursive: true })
  await fs.writeFile(path.join(runsDir, `${rec.runId}.json`), JSON.stringify(rec), "utf8")
  await fs.writeFile(path.join(runsDir, `${rec.runId}.log`), `${logLines.join("\n")}\n`, "utf8")
}

function skillRun({ skillId, startedMs, pid, status, pct, prompt, project }) {
  const id = runId(skillId, startedMs, pid)
  const cwd = path.join(SKILL_RUNS_DIR, `${skillId}_${startedMs}`)
  return { kind: "skill", runId: id, skillId, status, pct, prompt, project, cwd, startedAt: new Date(startedMs).toISOString(), pid, logFile: path.join(SKILL_RUNS_DIR, `${id}.log`) }
}

async function seedRunsAndApprovals() {
  // Clean stale runs/approvals so reruns are deterministic.
  await fs.rm(SKILL_RUNS_DIR, { recursive: true, force: true })
  await fs.rm(AGENT_RUNS_DIR, { recursive: true, force: true })
  await fs.rm(dir("approvals"), { recursive: true, force: true })

  // Four awaiting-approval skill runs, each backing one approval.
  const awaiting = [
    { skillId: "rohlik", actor: "rohlik", actorKind: "skill", glyph: "cart", action: "Objednat a zaplatit košík", riskType: "platba", risk: "high", ageMin: 2,
      prompt: "Naplň košík podle seznamu na tento týden",
      summary: "14 položek · 1 248 Kč · doručení zítra 18–20h", via: "Nedělní nákup (automatizace)",
      consequence: "Objednávka se odešle do Rohlíku a stáhne se z karty. Vratné jen do 23:00.",
      preview: { kind: "cart", total: "1 248 Kč", meta: "doručení zítra 18–20h · Rohlik.cz", items: [["Mléko Olma 1,5% · 6×", "209 Kč"], ["Chléb kváskový 800g", "49 Kč"], ["Rajčata keříková 1kg", "79 Kč"], ["Kuřecí prsa 1kg", "189 Kč"], ["Banány 1kg", "36 Kč"], ["Káva Lavazza 1kg", "399 Kč"], ["Vejce M 10ks", "79 Kč"], ["+ 7 dalších položek", "208 Kč"]] },
      log: ["00:00 spuštěn skill rohlik · projekt rohlik-list", "00:05 načten nákupní seznam · 14 položek", "01:30 košík sestaven · 14 / 14 položek nalezeno", "01:50 akce „platba” vyžaduje tvé schválení — zastaveno"] },
    { skillId: "pr-prereview", actor: "PR Guard", actorKind: "pipeline", glyph: "flow", action: "git push origin feat/api-rate-limit", riskType: "push", risk: "medium", ageMin: 9,
      prompt: "Připrav push větve feat/api-rate-limit",
      summary: "Reviewer schválil · 3 commity · 6 souborů (+128 / −34)", via: "PR Guard → fáze Reviewer",
      consequence: "Branch se vypushuje na origin a otevře se PR. Push lze revertnout, historie zůstane.",
      preview: { kind: "diff", file: "src/api/rate-limit.ts", meta: "feat/api-rate-limit · 6 souborů", hunks: [{ h: "@@ -12,6 +12,9 @@ export class RateLimiter {", lines: [["ctx", "  private window = 60_000;"], ["add", "  private max = 100;"], ["add", "  private store = new Map<string, number[]>();"], ["del", "  allow(key: string) { return true; }"], ["add", "  allow(key: string) {"], ["add", "    const hits = (this.store.get(key) ?? []).filter(t => Date.now() - t < this.window);"], ["add", "    if (hits.length >= this.max) return false;"], ["add", "    hits.push(Date.now()); this.store.set(key, hits); return true;"], ["add", "  }"]] }] },
      log: ["00:00 spuštěn skill pr-prereview", "00:40 reviewer prošel diff · 6 souborů", "01:10 akce „push” vyžaduje tvé schválení — zastaveno"] },
    { skillId: "holly", actor: "holly", actorKind: "skill", glyph: "server", action: "Smazat 312 GB starých snapshotů na Holly", riskType: "mazani", risk: "high", ageMin: 21,
      prompt: "Ukliď snapshoty starší 90 dní",
      summary: "NAS Holly · /volume1/snapshots · 14 snapshotů starších 90 dní", via: "ad-hoc běh",
      consequence: "Snapshoty se nevratně smažou z NASu. Uvolní se 312 GB. Aktuální záloha zůstává.",
      preview: { kind: "command", shell: "holly", cmd: "ssh holly \"btrfs subvolume delete /volume1/snapshots/2026-0{1,2}-*\"", note: "14 cílů · ověřeno proti retenční politice 90 dní", targets: ["2026-01-04T03:00  · 22.4 GB", "2026-01-11T03:00  · 23.1 GB", "2026-01-18T03:00  · 21.8 GB", "… +11 dalších snapshotů"] },
      log: ["00:00 spuštěn skill holly · ad-hoc", "00:30 vyhodnoceno 14 snapshotů > 90 dní", "00:45 akce „mazání” vyžaduje tvé schválení — zastaveno"] },
    { skillId: "standup-gen", actor: "standup-gen", actorKind: "skill", glyph: "spark", action: "Odeslat standup do #team-eng (Slack)", riskType: "odeslani", risk: "low", ageMin: 35,
      prompt: "Vygeneruj a odešli ranní standup",
      summary: "Vygenerováno z 7 commitů · 3 odrážky · adresát #team-eng", via: "Ranní standup (automatizace)",
      consequence: "Zpráva se odešle do veřejného kanálu #team-eng. Po odeslání ji nelze stáhnout.",
      preview: { kind: "message", to: "#team-eng · Slack", subject: "Standup · út 3. čer", body: "Včera: dotáhl rate-limiter (feat/api-rate-limit), čeká na review.\nDnes: merge rate-limiteru, začínám na cache vrstvě.\nBlokace: žádné — CI je zelené." },
      log: ["00:00 spuštěn skill standup-gen", "00:20 standup sestaven ze 7 commitů", "00:30 akce „odeslání” vyžaduje tvé schválení — zastaveno"] },
  ]

  let approvals = 0
  let runs = 0
  for (let i = 0; i < awaiting.length; i++) {
    const a = awaiting[i]
    const startedMs = now - a.ageMin * MIN
    const pid = 40000 + i
    const rec = skillRun({ skillId: a.skillId, startedMs, pid, status: "awaiting-approval", pct: 100, prompt: a.prompt, project: a.actor })
    await writeRun(SKILL_RUNS_DIR, rec, a.log)
    runs++

    const detail = JSON.stringify({ riskType: a.riskType, actorKind: a.actorKind, glyph: a.glyph, summary: a.summary, via: a.via, consequence: a.consequence, preview: a.preview })
    const approval = { id: `apq-${a.skillId}`, runId: rec.runId, kind: "skill", skill: a.actor, action: a.action, detail, risk: a.risk, status: "pending", requestedAt: rec.startedAt }
    await writeFile(dir("approvals", `${approval.id}.json`), JSON.stringify(approval))
    approvals++
  }

  // Finished skill runs (fresh timestamps so done/error stay inside the 30-min window).
  const finished = [
    { skillId: "ci-doctor", status: "done", pct: 100, ageMin: 5, prompt: "Proč padá pipeline na main?", project: "auth-svc",
      log: ["00:00 spuštěn skill ci-doctor · projekt auth-svc", "00:40 staženy logy posledního běhu CI", "01:30 nalezen flaky test: auth.spec.ts „refresh token”", "02:30 navržen fix · seed náhodného času → fixed clock", "02:40 hotovo · report v test-report.md"] },
    { skillId: "photo-cull", status: "error", pct: 38, ageMin: 11, prompt: "Vyber nejlepší z víkendového focení", project: "home-ops",
      log: ["00:00 spuštěn skill photo-cull · projekt home-ops", "00:20 nalezeno 412 snímků", "00:50 chyba: /Volumes/Photos není připojen (ENOENT)", "00:50 běh ukončen s chybou · žádná data nezměněna"] },
    { skillId: "changelog-gen", status: "interrupted", pct: 22, ageMin: 18, prompt: "Changelog od v0.4.0", project: "zibby-core",
      log: ["00:00 spuštěn skill changelog-gen", "00:30 přerušeno uživatelem (Zastavit běh)"] },
    { skillId: "webshare-downloader", status: "interrupted", pct: 41, ageMin: 26, prompt: "Stáhni S02E04–E08", project: "media-vault",
      log: ["00:00 spuštěn skill webshare-downloader · projekt media-vault", "00:04 rozlišeno 5 epizod · Webshare API", "01:10 E04 staženo · 1.4 GB", "03:40 přerušeno uživatelem"] },
  ]
  for (let i = 0; i < finished.length; i++) {
    const f = finished[i]
    const startedMs = now - f.ageMin * MIN
    const rec = skillRun({ skillId: f.skillId, startedMs, pid: 41000 + i, status: f.status, pct: f.pct, prompt: f.prompt, project: f.project })
    await writeRun(SKILL_RUNS_DIR, rec, f.log)
    runs++
  }

  // One genuine `running` agent run — a long-lived, token-free emitter whose pid is
  // recorded so the runner keeps it `running` (and its log streams) after restart.
  // A fixed run-id suffix ("live") means the log path is known before spawn, so the
  // emitter can write straight into it (no rename race).
  const startedMs = now - 3 * MIN
  const realId = runId("agent-007", startedMs, "live")
  const realLog = path.join(AGENT_RUNS_DIR, `${realId}.log`)
  await fs.mkdir(AGENT_RUNS_DIR, { recursive: true })
  await fs.writeFile(realLog, "00:00 spuštěn agent-007 · demo (token-free)\n", "utf8")
  const child = spawn(
    process.execPath,
    ["-e", `const fs=require('fs');const f=process.argv[1];let p=12;const iv=setInterval(()=>{p=Math.min(95,p+3);fs.appendFileSync(f,'PROGRESS '+p+'\\n');fs.appendFileSync(f,'pracuji… píšu marker soubor\\n')},6000);setTimeout(()=>{clearInterval(iv);process.exit(0)},30*60*1000)`, realLog],
    { detached: true, stdio: "ignore" },
  )
  const pid = child.pid ?? 0
  child.unref()
  const agentRec = { kind: "agent", runId: realId, agentId: "agent-007", status: "running", pct: 12, prompt: "Demo běh — ukázka živého logu", project: "zibby-core", cwd: path.join(AGENT_RUNS_DIR, `agent-007_${startedMs}`), startedAt: new Date(startedMs).toISOString(), pid, pgid: pid, logFile: realLog }
  await fs.writeFile(path.join(AGENT_RUNS_DIR, `${realId}.json`), JSON.stringify(agentRec), "utf8")
  runs++

  return { approvals, runs }
}

// ------------------------------------------------------------------ main ----
async function main() {
  await fs.mkdir(DATA, { recursive: true })
  const skills = await seedSkills()
  const agents = await seedAgents()
  const pipelines = await seedPipelines()
  const automations = await seedAutomations()
  const notes = await seedVault()
  const { approvals, runs } = await seedRunsAndApprovals()

  console.log("ZIBBY velín — demo data seeded into", DATA)
  console.log(`  skills        ${skills}`)
  console.log(`  agents        ${agents} (incl. agent-007) + 7 categories`)
  console.log(`  pipelines     ${pipelines}`)
  console.log(`  automations   ${automations}`)
  console.log(`  vault notes   ${notes}`)
  console.log(`  approvals     ${approvals} (pending)`)
  console.log(`  runs          ${runs} (awaiting / done / error / interrupted / 1 live running)`)
  console.log("\nNext: (re)start the API so it picks up the seeded runs:  npm run api:dev")
}

main().catch((err) => {
  console.error("seed failed:", err)
  process.exit(1)
})

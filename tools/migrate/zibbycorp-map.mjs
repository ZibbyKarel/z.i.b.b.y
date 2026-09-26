// ZibbyCorp rename map (D-004 / D-016) — the ONE place persona ids live after the
// migration. Shared by the code codemod (`zibbycorp-codemod.mjs`) and the data
// migration (`zibbycorp-departments.mjs`) so both produce identical names.

/** Old subsystem id → new department id. */
export const DEPARTMENT_ID = {
  forge: "dev",
  puls: "ops",
  sentinel: "sec",
  maestro: "rel",
  beacon: "inc",
  scout: "rnd",
  herald: "com",
  loom: "qa",
  codex: "knw",
  ledger: "fin",
  hearth: "per",
};

/**
 * Old subsystem id → neutral function word, used where the persona appears inside
 * a compound name (kebab ids, file/dir names, camelCase identifiers):
 * `sentinel-scan` → `security-scan`, `LoomService` → `ArchService`.
 */
export const FUNCTION_WORD = {
  forge: "dev",
  puls: "ops",
  sentinel: "security",
  maestro: "release",
  beacon: "incident",
  scout: "research",
  herald: "comms",
  loom: "arch",
  codex: "knowledge",
  ledger: "finance",
  hearth: "personal",
};

/** Whole-token fixes applied before the generic rules (would otherwise read badly). */
export const SPECIAL_CASES = [
  ["scout-research", "research"],
  ["scoutResearch", "research"],
  ["ScoutResearch", "Research"],
];

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The persona tokens the generic rules touch. `ledger` is excluded (generic word — handled by hand). */
export const AUTO_PERSONAS = Object.keys(DEPARTMENT_ID).filter((p) => p !== "ledger");

/**
 * Rewrite one text. `personas` defaults to every persona except `ledger`.
 * Order matters: owner field → subsystem family → special cases → personas.
 */
export function rewrite(text, { personas = AUTO_PERSONAS, subsystemWords = true } = {}) {
  let out = text;
  if (subsystemWords) {
    out = out
      .replace(/\bownerSubsystem\b/g, "department")
      .replace(/OwnerSubsystem/g, "OwnerDepartment")
      .replace(/SUBSYSTEM/g, "DEPARTMENT")
      .replace(/Subsystem/g, "Department")
      .replace(/subsystem/g, "department");
  }
  for (const [from, to] of SPECIAL_CASES) out = out.split(from).join(to);
  for (const p of personas) {
    const id = DEPARTMENT_ID[p];
    const fw = FUNCTION_WORD[p];
    const P = cap(p);
    const FW = fw
      .split("-")
      .map(cap)
      .join("");
    // UPPER_CASE constants: SENTINEL_FOO → SECURITY_FOO
    out = out.replace(new RegExp(`\\b${p.toUpperCase()}(?=_|\\b)`, "g"), fw.toUpperCase());
    // Capitalized (identifiers, prose): Sentinel / SentinelService → Security / SecurityService
    out = out.replace(new RegExp(`(?<![A-Za-z])${P}(?![a-z])`, "g"), FW);
    // quoted bare id ("sentinel", 'sentinel', `sentinel`) → department id
    out = out.replace(new RegExp(`(["'\`])${p}\\1`, "g"), `$1${id}$1`);
    // object key at line start (Record<DepartmentId, …> literals): `  sentinel: x` → `  sec: x`
    out = out.replace(new RegExp(`^(\\s*)${p}(?=\\s*:)`, "gm"), `$1${id}`);
    // every other lowercase occurrence (camelCase start, kebab, paths, prose) → function word
    out = out.replace(new RegExp(`(?<![A-Za-z])${p}(?![a-z])`, "g"), fw);
  }
  return out;
}

/** Rewrite a repo-relative path (dir + file names). */
export function rewritePath(path, opts) {
  return rewrite(path, opts);
}

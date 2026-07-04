/**
 * Assemble the task string handed to a pipeline stage's agent. Pure (no I/O) so the
 * verdict contract can be unit-tested in isolation. A `qualify` phase gets an extra
 * rider instructing the agent to emit exactly one `<verdict>` tag plus an
 * anti-rationalization clause — injected here (a property of the qualify PHASE), not
 * baked into the shared agent, and deliberately NOT in the global OPERATING_CONTRACT
 * (which prepends to every run).
 */
export function buildStageTask(opts: {
  phaseId: string;
  consumesAbs: string | null;
  producesAbs: string | null;
  qualify?: boolean;
}): string {
  const { phaseId, consumesAbs, producesAbs, qualify } = opts;
  return [
    `Proveď fázi pipeline "${phaseId}".`,
    consumesAbs
      ? `Vstup (pokud existuje) najdeš v "${consumesAbs}" — jde o READ-ONLY odkaz na výstup ` +
        "předchozí fáze, ne o pracovní kopii; neupravuj ho na místě."
      : "",
    producesAbs ? `Výstup zapiš do "${producesAbs}".` : "",
    qualify
      ? "Na úplný konec výstupu zapiš svůj verdikt přesně jedním tagem: " +
        "<verdict>pass</verdict> (práce splňuje zadání), " +
        "<verdict>gap</verdict> (chybí část zadání → vrátí se k dopracování), nebo " +
        "<verdict>drift</verdict> (řešení míří jinam → přeplánuje se). " +
        'Nehodnoť shovívavě: „mělo by to fungovat", „už jsem to kontroloval" ani ' +
        '„je to skoro hotové" nejsou pass — pokud sis nálezy znovu neověřil přímo ' +
        "v souborech, je to gap. Bez tagu se práce automaticky vrací k přepracování."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

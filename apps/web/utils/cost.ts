/**
 * Formátuje odhad ceny v USD pro zobrazení: pod half-cent zaokrouhlené
 * "< $0.01" (aby drobné běhy neukazovaly zavádějící "$0.00"), jinak dvě
 * desetinná místa.
 */
export function formatCostUsd(usd: number): string {
  if (usd < 0.005) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

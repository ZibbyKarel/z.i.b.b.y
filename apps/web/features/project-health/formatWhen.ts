/**
 * Short date-time for a health transition ("24. 10. 09:00"). Uses the runtime
 * locale like the neighbouring surfaces (`ProjectCiStatusChip`, `formatWaited`) —
 * the app has no `useFormatter` call sites, so this stays consistent with them.
 */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The identity of a page pin: pathname + search, minus the transient
 * `?approval=` param (ZA-pins spec decision 5) — a URL that only differs by
 * which approval drawer happened to be open must still resolve to the same
 * pin/active-row match.
 */
export function pinHrefFor(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("approval");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

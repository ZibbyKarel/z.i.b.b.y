import { slugify } from "./text/slugify";

/**
 * Assign a stable, deterministic id to any person missing one (Phase 68/69
 * migration decision — see `ProjectPersonSchema`'s doc comment in
 * `libs/contracts`): `slugify(name)`, with a `-2`, `-3`, … suffix appended on a
 * collision within the same roster (against both other backfilled ids and any
 * ids already present on the roster). People that already carry an `id` are
 * returned untouched.
 *
 * Pure function — it does not write anything. Callers (`ProjectsStorageService`
 * and `CompaniesStorageService`) run this on `list()`, so the corrected ids
 * flow straight back into the array every write path re-persists on its next
 * create/update/delete, without a dedicated migration step.
 */
export function backfillPersonIds<T extends { id?: string; name: string }>(
  people: T[] | undefined,
): T[] | undefined {
  if (!people || people.length === 0) return people;

  const used = new Set(people.flatMap((person) => (person.id ? [person.id] : [])));
  let changed = false;

  const backfilled = people.map((person) => {
    if (person.id) return person;
    changed = true;

    const base = slugify(person.name);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return { ...person, id: candidate };
  });

  // Preserve the original array reference/objects when nothing needed backfilling.
  return changed ? backfilled : people;
}

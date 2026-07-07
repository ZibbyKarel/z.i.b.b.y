import { describe, expect, it } from "vitest";
import { backfillPersonIds } from "./backfill-person-ids";

/** Minimal roster-entry shape used across these tests. */
interface Person {
  id?: string;
  name: string;
}

describe("backfillPersonIds", () => {
  it("assigns a slug id to a person missing one", () => {
    const result = backfillPersonIds<Person>([{ name: "Jana Nováková" }]);
    expect(result).toEqual([{ name: "Jana Nováková", id: "jana-novakova" }]);
  });

  it("gives two same-name people distinct ids via a dedupe suffix", () => {
    const result = backfillPersonIds<Person>([{ name: "Jan Novák" }, { name: "Jan Novák" }]);
    expect(result?.map((p) => p.id)).toEqual(["jan-novak", "jan-novak-2"]);
  });

  it("leaves an existing id untouched", () => {
    const result = backfillPersonIds<Person>([{ id: "custom-id", name: "Jan Novák" }]);
    expect(result).toEqual([{ id: "custom-id", name: "Jan Novák" }]);
  });

  it("does not collide a backfilled id with an id already present on the roster", () => {
    const result = backfillPersonIds<Person>([
      { id: "jan-novak", name: "Existing" },
      { name: "Jan Novák" },
    ]);
    expect(result?.map((p) => p.id)).toEqual(["jan-novak", "jan-novak-2"]);
  });

  it("passes through undefined and empty rosters unchanged", () => {
    expect(backfillPersonIds<Person>(undefined)).toBeUndefined();
    expect(backfillPersonIds<Person>([])).toEqual([]);
  });

  it("returns the same array reference when nothing needs backfilling", () => {
    const people: Person[] = [{ id: "a", name: "A" }];
    expect(backfillPersonIds(people)).toBe(people);
  });
});

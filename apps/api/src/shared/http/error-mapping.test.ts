import { describe, expect, it } from "vitest"
import { makeErrorMapper } from "./error-mapping"

class NotFound extends Error {}
class InvalidId extends Error {}
class Conflict extends Error {
  constructor() {
    super(`Widget "w1" already exists`)
  }
}
class Unrelated extends Error {}

const errors = makeErrorMapper("Widget", {
  missing: [NotFound, InvalidId],
  conflict: [Conflict],
})

describe("makeErrorMapper", () => {
  describe("or404", () => {
    it("returns 200 with the resolved body", async () => {
      await expect(errors.or404("w1", async () => ({ id: "w1" }))).resolves.toEqual({
        status: 200,
        body: { id: "w1" },
      })
    })

    it("maps every configured missing class to a canonical 404", async () => {
      for (const error of [new NotFound(), new InvalidId()]) {
        await expect(
          errors.or404("w1", async () => {
            throw error
          }),
        ).resolves.toEqual({ status: 404, body: { message: `Widget "w1" not found` } })
      }
    })

    it("rethrows unknown errors", async () => {
      await expect(
        errors.or404("w1", async () => {
          throw new Unrelated("boom")
        }),
      ).rejects.toThrow("boom")
    })

    it("lets `extra` map a resource-specific error before the 404 check", async () => {
      const invalid = (error: unknown) =>
        error instanceof Unrelated
          ? ({ status: 422, body: { message: error.message } } as const)
          : undefined
      await expect(
        errors.or404(
          "w1",
          async () => {
            throw new Unrelated("dangling target")
          },
          invalid,
        ),
      ).resolves.toEqual({ status: 422, body: { message: "dangling target" } })
    })
  })

  describe("created", () => {
    it("returns 201 with the created body", async () => {
      await expect(errors.created(async () => ({ id: "w1" }))).resolves.toEqual({
        status: 201,
        body: { id: "w1" },
      })
    })

    it("maps a conflict to 409 with the error's own message", async () => {
      await expect(
        errors.created(async () => {
          throw new Conflict()
        }),
      ).resolves.toEqual({ status: 409, body: { message: `Widget "w1" already exists` } })
    })

    it("rethrows unknown errors", async () => {
      await expect(
        errors.created(async () => {
          throw new Unrelated("boom")
        }),
      ).rejects.toThrow("boom")
    })

    it("rethrows conflicts when no conflict classes are configured", async () => {
      const bare = makeErrorMapper("Widget", { missing: [NotFound] })
      await expect(
        bare.created(async () => {
          throw new Conflict()
        }),
      ).rejects.toThrow(`Widget "w1" already exists`)
    })
  })

  it("isMissing/notFound expose the primitives for bespoke handlers", () => {
    expect(errors.isMissing(new NotFound())).toBe(true)
    expect(errors.isMissing(new Unrelated())).toBe(false)
    expect(errors.notFound("w9")).toEqual({ status: 404, body: { message: `Widget "w9" not found` } })
  })
})

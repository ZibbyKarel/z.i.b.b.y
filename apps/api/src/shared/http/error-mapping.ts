type ErrorCtor = abstract new (...args: never[]) => Error

export interface ErrorMapperOptions {
  /** NotFound + InvalidId error classes — both read as "no such entity" → 404. */
  missing: ErrorCtor[]
  /** Conflict error classes that map to a 409 on create. */
  conflict?: ErrorCtor[]
}

/**
 * Per-resource HTTP error mapper for ts-rest handlers. Every CRUD controller maps
 * the same storage errors to the same status codes; this factory owns that mapping
 * once so a controller reads as one line per route:
 *
 *   const errors = makeErrorMapper("Agent", { missing: [...], conflict: [...] })
 *   getAgent: ({ params: { id } }) => errors.or404(id, () => storage.get(id))
 *
 * Resource-specific cases (a 422 on invalid pipeline, a 409 on an already-decided
 * approval) plug in via the optional `extra` callback, which gets first look at the
 * error and keeps the return type inferred for the contract.
 */
export function makeErrorMapper(entity: string, opts: ErrorMapperOptions) {
  const is = (error: unknown, ctors?: ErrorCtor[]): boolean =>
    ctors?.some((ctor) => error instanceof ctor) ?? false

  const notFound = (id: string) =>
    ({ status: 404, body: { message: `${entity} "${id}" not found` } }) as const

  return {
    /** True when the error is one of the configured `missing` classes. */
    isMissing: (error: unknown): boolean => is(error, opts.missing),

    /** The canonical 404 response for this resource. */
    notFound,

    /** 200 + body on success; a missing/unsafe id → 404. */
    async or404<T, E = never>(
      id: string,
      fn: () => Promise<T>,
      extra?: (error: unknown) => E | undefined,
    ): Promise<{ status: 200; body: T } | ReturnType<typeof notFound> | E> {
      try {
        return { status: 200, body: await fn() }
      } catch (error) {
        const mapped = extra?.(error)
        if (mapped !== undefined) return mapped
        if (is(error, opts.missing)) return notFound(id)
        throw error
      }
    },

    /** 201 + body on success; a duplicate id → 409. */
    async created<T, E = never>(
      fn: () => Promise<T>,
      extra?: (error: unknown) => E | undefined,
    ): Promise<{ status: 201; body: T } | { status: 409; body: { message: string } } | E> {
      try {
        return { status: 201, body: await fn() }
      } catch (error) {
        const mapped = extra?.(error)
        if (mapped !== undefined) return mapped
        if (is(error, opts.conflict)) {
          return { status: 409, body: { message: (error as Error).message } }
        }
        throw error
      }
    },
  }
}

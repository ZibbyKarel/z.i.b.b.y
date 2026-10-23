/**
 * Pull the `message` out of a ts-rest mutation error when it's a declared
 * error response (`{ status: 409, body: { message } }`) rather than a thrown
 * `Error` (network failure, schema drift) — narrowed defensively since the
 * error-response body's shape isn't reliably inferred through the union here.
 */
export function updateErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("body" in error)) return undefined;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== "object" || !("message" in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

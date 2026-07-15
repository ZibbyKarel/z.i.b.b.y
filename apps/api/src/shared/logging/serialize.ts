/**
 * Turn arbitrary log metadata (or a request/response body) into a compact,
 * bounded one-line string for stdout. Logging is best-effort plumbing: it must
 * never throw, never loop forever on a cycle, and never dump a multi-megabyte
 * agent prompt or log chunk into the server's own log. So this:
 *
 * - tolerates circular references (`[Circular]`),
 * - stringifies `bigint` (which `JSON.stringify` refuses),
 * - clips any single long string field, and
 * - clips the final serialized line.
 */
const FIELD_MAX = 500;
const LINE_MAX = 4000;

export function safeStringify(value: unknown, maxLen: number = LINE_MAX): string {
  const seen = new WeakSet<object>();
  let out: string;
  try {
    out =
      JSON.stringify(value, (_key, v: unknown) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "string" && v.length > FIELD_MAX) {
          return `${v.slice(0, FIELD_MAX)}…(+${v.length - FIELD_MAX})`;
        }
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      }) ?? String(value);
  } catch {
    return "[unserializable]";
  }
  if (out.length > maxLen) out = `${out.slice(0, maxLen)}…(+${out.length - maxLen})`;
  return out;
}

/** Marker written in place of any value matched by {@link redact}. */
const REDACTED = "[redacted]";

/**
 * Key substrings (case-insensitive) that mark a field as secret-bearing. Matched
 * against the key itself, not the value — cheap and conservative: better to
 * over-redact (`sessionToken`, `envVars`) than to leak a real credential.
 */
const REDACT_KEY_SUBSTRINGS = [
  "token",
  "password",
  "apikey",
  "api_key",
  "api-key",
  "secret",
  "env",
  "headers",
  "credentials",
] as const;

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEY_SUBSTRINGS.some((needle) => lower.includes(needle));
}

/**
 * Genuinely opaque built-ins whose own-enumerable-key shape must NOT be walked:
 * - `Date` — `JSON.stringify` calls its `toJSON()` (ISO string), never touches
 *   its (non-enumerable) internal slots. There's no key to redact.
 * - `RegExp` — same idea; nothing secret-bearing lives on it.
 * - typed arrays / `DataView` / `Buffer` (a `Uint8Array` subclass, caught by
 *   `ArrayBuffer.isView`) / raw `ArrayBuffer` — their own-enumerable keys are
 *   numeric indices, so redacting them would be a no-op for secrets anyway, but
 *   `Buffer` has its own `toJSON()` (`{ type: "Buffer", data: [...] }`) that
 *   `JSON.stringify` prefers over walking indices. Recursing here would replace
 *   that shape with a plain `{"0":1,"1":2,...}` object, corrupting the log
 *   preview. Passing them through by reference keeps `safeStringify`'s output
 *   identical to today's.
 *
 * Everything else — plain object literals, class instances, `Error`s, `Map`s,
 * `Set`s, … — is walked via `Object.entries`, exactly like `JSON.stringify`
 * walks it (own enumerable keys only; non-enumerable fields like `Error#message`
 * are invisible to both).
 */
function isOpaqueBuiltin(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * Deep-clones `value`, replacing any value whose key matches
 * {@link REDACT_KEY_SUBSTRINGS} with `"[redacted]"`. Recurses into arrays and
 * any object with own enumerable keys — plain object literals, class
 * instances, `Error`s, `Map`/`Set` fields, anything `JSON.stringify` would walk
 * the same way — applying the deny-list at every level, not just plain object
 * literals. Never mutates its input. The only pass-through (no recursion,
 * returned by reference) is the narrow {@link isOpaqueBuiltin} allowlist of
 * built-ins where walking own keys would corrupt the shape `safeStringify`
 * already knows how to serialize.
 *
 * Cycles collapse to `"[Circular]"` via a `seen` set shared across the whole
 * call — the same trade-off {@link safeStringify} makes: a value repeated in two
 * unrelated branches (not a true cycle) also reads as `"[Circular]"` on its
 * second occurrence, which is an acceptable false positive for a log preview.
 *
 * Meant to run once, before {@link safeStringify}, on any request/response body
 * that might carry a credential — see `LoggingInterceptor`.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }
  if (value !== null && typeof value === "object") {
    if (isOpaqueBuiltin(value)) return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : redact(v, seen);
    }
    return out;
  }
  return value;
}

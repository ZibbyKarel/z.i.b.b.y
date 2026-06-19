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

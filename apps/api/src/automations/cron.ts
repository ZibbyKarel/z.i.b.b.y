/**
 * A minimal 5-field cron matcher (min hour dom month dow) evaluated against a
 * given instant in a target timezone. Supports a wildcard, step values (e.g.
 * every-n), ranges (a-b), and comma lists (a,b). Deliberately tiny — the daemon
 * ticks once a minute, so this only answers "does now match?", not "next run?".
 */
const FIELD_BOUNDS: Array<[min: number, max: number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
]

export function matchesCron(expr: string, date: Date, timeZone = "Europe/Prague"): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const parts = zonedParts(date, timeZone)
  const values = [parts.minute, parts.hour, parts.day, parts.month, parts.weekday]
  for (let i = 0; i < 5; i++) {
    const field = fields[i]
    const value = values[i]
    const bounds = FIELD_BOUNDS[i]
    if (field === undefined || value === undefined || bounds === undefined) return false
    if (!matchField(field, value, bounds)) return false
  }
  return true
}

function matchField(field: string, value: number, [lo, hi]: [number, number]): boolean {
  return field.split(",").some((part) => matchAtom(part, value, lo, hi))
}

function matchAtom(part: string, value: number, lo: number, hi: number): boolean {
  let step = 1
  let range = part
  const slash = part.indexOf("/")
  if (slash >= 0) {
    step = Number(part.slice(slash + 1))
    range = part.slice(0, slash)
    if (!Number.isInteger(step) || step < 1) return false
  }

  let start = lo
  let end = hi
  if (range !== "*") {
    const dash = range.indexOf("-")
    if (dash >= 0) {
      start = Number(range.slice(0, dash))
      end = Number(range.slice(dash + 1))
    } else {
      start = end = Number(range)
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false
  }
  if (value < start || value > end) return false
  return (value - start) % step === 0
}

interface ZonedParts {
  minute: number
  hour: number
  day: number
  month: number
  weekday: number
}

/** The wall-clock fields of `date` in `timeZone`. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    minute: "2-digit",
    hour: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  })
  const lookup: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) lookup[p.type] = p.value
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return {
    minute: Number(lookup.minute),
    // "24" can appear for midnight in some environments; normalise to 0.
    hour: Number(lookup.hour) % 24,
    day: Number(lookup.day),
    month: Number(lookup.month),
    weekday: Math.max(0, weekdays.indexOf(lookup.weekday ?? "Sun")),
  }
}

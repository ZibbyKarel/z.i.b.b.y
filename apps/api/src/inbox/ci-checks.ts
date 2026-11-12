/**
 * Whether a check-run name is ignored by a project's `ciIgnoredChecks`: an entry matches the
 * name case-insensitively and exactly; `/.../` is a case-insensitive regex. An invalid regex
 * matches nothing (never throws).
 */
export function isIgnoredCheck(name: string, patterns: readonly string[] | undefined): boolean {
  const lower = name.toLowerCase();
  return (patterns ?? []).some((raw) => {
    const p = raw.trim();
    if (p.length > 2 && p.startsWith("/") && p.endsWith("/")) {
      try {
        return new RegExp(p.slice(1, -1), "i").test(name);
      } catch {
        return false;
      }
    }
    return p.toLowerCase() === lower;
  });
}

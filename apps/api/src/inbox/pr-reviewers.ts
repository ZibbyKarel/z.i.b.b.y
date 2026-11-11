import type { InboxPrReviewer, InboxPrReviewers } from "@zibby/contracts";

/** gitignore-style CODEOWNERS pattern → RegExp over a repo-relative path. */
function patternRegex(raw: string): RegExp {
  let p = raw;
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.startsWith("/") || p.includes("/");
  if (p.startsWith("/")) p = p.slice(1);
  let body = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i] ?? "";
    if (p.startsWith("**/", i)) {
      body += "(?:.*/)?";
      i += 2;
    } else if (p.startsWith("**", i)) {
      body += ".*";
      i += 1;
    } else if (ch === "*") body += "[^/]*";
    else if (ch === "?") body += "[^/]";
    else body += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${anchored ? "^" : "^(?:.*/)?"}${body}${dirOnly ? "/.*" : "(?:/.*)?"}$`);
}

/** Owners CODEOWNERS assigns to `path` — the last matching rule wins. */
export function codeOwnersOf(text: string, path: string): string[] {
  const rules = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/));
  for (const [pattern, ...owners] of rules.reverse()) {
    if (pattern && patternRegex(pattern).test(path)) return owners;
  }
  return [];
}

type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export interface BuildReviewersInput {
  /** Repo owner — CODEOWNERS teams are `@<org>/<slug>`. */
  org: string;
  /** PR author; their own reviews (thread replies) are not reviewers. */
  author: string;
  requestedUsers: string[];
  requestedTeams: { slug: string; name: string }[];
  /** Chronological. */
  reviews: {
    author: string;
    state: ReviewState;
    onBehalfOf: { slug: string; name: string }[];
    comments: number;
  }[];
  /** Team slug → member logins (best-effort; may be empty). */
  teamMembers: Record<string, string[]>;
  /** Team slug → display name (best-effort). */
  teamNames: Record<string, string>;
  /** Base-branch CODEOWNERS text, `null` when the repo has none. */
  codeowners: string | null;
  /** Changed file paths. */
  files: string[];
}

/** GitHub's "Reviewers" box as a tree: listed teams with their reviewing members, then everyone else. */
export function buildReviewers(input: BuildReviewersInput): InboxPrReviewers {
  const ownerTeams = new Set<string>();
  const prefix = `@${input.org}/`.toLowerCase();
  if (input.codeowners) {
    for (const file of input.files) {
      for (const owner of codeOwnersOf(input.codeowners, file)) {
        if (owner.toLowerCase().startsWith(prefix)) ownerTeams.add(owner.slice(prefix.length));
      }
    }
  }

  // Teams in display order: requested, reviewed-on-behalf-of, then CODEOWNER teams.
  const teamName = new Map<string, string>();
  const onBehalf = new Map<string, Set<string>>();
  for (const t of input.requestedTeams) teamName.set(t.slug, t.name);
  for (const r of input.reviews) {
    for (const t of r.onBehalfOf) {
      if (!teamName.has(t.slug)) teamName.set(t.slug, t.name);
      onBehalf.set(t.slug, (onBehalf.get(t.slug) ?? new Set()).add(r.author));
    }
  }
  for (const slug of ownerTeams)
    if (!teamName.has(slug)) teamName.set(slug, input.teamNames[slug] ?? slug);

  // People: requested first, then reviewers in first-review order.
  const people = new Map<
    string,
    { verdict?: "approved" | "changesRequested"; commented: boolean }
  >();
  for (const login of input.requestedUsers) people.set(login, { commented: false });
  for (const r of input.reviews) {
    if (r.author === input.author || r.state === "PENDING") continue;
    const p = people.get(r.author) ?? { commented: false };
    if (r.state === "APPROVED") p.verdict = "approved";
    else if (r.state === "CHANGES_REQUESTED") p.verdict = "changesRequested";
    else if (r.state === "DISMISSED") delete p.verdict;
    if (r.state === "COMMENTED" || r.comments > 0) p.commented = true;
    people.set(r.author, p);
  }
  const reviewers: InboxPrReviewer[] = [...people].map(([login, p]) => ({
    login,
    state: input.requestedUsers.includes(login) ? "pending" : (p.verdict ?? "commented"),
    commented: p.commented,
  }));

  const placed = new Set<string>();
  const teams = [...teamName].map(([slug, name]) => {
    const members = reviewers.filter(
      (r) =>
        (input.teamMembers[slug]?.includes(r.login) ?? false) ||
        (onBehalf.get(slug)?.has(r.login) ?? false),
    );
    for (const m of members) placed.add(m.login);
    return {
      slug,
      name,
      codeOwner: ownerTeams.has(slug),
      requested: input.requestedTeams.some((t) => t.slug === slug),
      members,
    };
  });
  return { teams, users: reviewers.filter((r) => !placed.has(r.login)) };
}

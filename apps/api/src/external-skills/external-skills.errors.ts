/** The repo (or the requested folder) holds no installable SKILL.md → 422. */
export class NoSkillsFoundError extends Error {
  constructor(message = "No SKILL.md found in this repository") {
    super(message);
    this.name = "NoSkillsFoundError";
  }
}

/** A `git` child failed (clone, ls-remote, rev-parse) → 502; `message` is its stderr. */
export class SkillRepoGitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillRepoGitError";
  }
}

/** Raised when a project does not exist for the requested id. */
export class ProjectNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" not found`);
    this.name = "ProjectNotFoundError";
  }
}

/** Raised when creating a project whose id is already taken. */
export class ProjectConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" already exists`);
    this.name = "ProjectConflictError";
  }
}

/**
 * Phase 76 — raised by `ProjectLocalService.clone` when the project has no
 * `gitRemote` to clone from. Maps to a 422 (the request is well-formed but the
 * project's data doesn't support cloning), distinct from the 409 below.
 */
export class ProjectNoRemoteError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" has no gitRemote to clone from`);
    this.name = "ProjectNoRemoteError";
  }
}

/**
 * Phase 76 — raised by `ProjectLocalService.clone` when this machine already
 * has the project present (at `path` or `cloneRoot`). Maps to a 409: re-cloning
 * an already-present project would be a no-op at best and a collision at worst.
 */
export class ProjectAlreadyClonedError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" is already present on this machine`);
    this.name = "ProjectAlreadyClonedError";
  }
}

/**
 * Phase 77 — raised by `ProjectLocalService.resolveForRun` when a run's project
 * has no local clone on THIS machine (neither at its canonical `path` nor a
 * prior `cloneRoot` clone, nor even a plain non-git folder at `path`) and no
 * `gitRemote` to clone from. Run dispatch (agent/goal/pipeline) fails clearly on
 * this rather than spawning into a directory that may not exist — the
 * operator's fix is either setting a git remote on the project or cloning it
 * onto this machine manually.
 */
export class ProjectLocalUnresolvedError extends Error {
  constructor(public readonly id: string) {
    super(
      `Project "${id}" has no local clone on this machine and no gitRemote to clone from — ` +
        `set a git remote on the project or clone it onto this machine manually.`,
    );
    this.name = "ProjectLocalUnresolvedError";
  }
}

/**
 * Phase 78 — raised by `ProjectPrService.merge` when the project has no
 * resolved github integration, or that integration has no stored token. Maps to
 * a 422: the merge route needs a real answer for an explicit operator click,
 * unlike `listOpen`, which treats the same condition as an empty overview
 * (never an error page — see the Phase 78 plan's "Data source" section).
 */
export class NoGithubLinkError extends Error {
  constructor(public readonly id: string) {
    super(`Project "${id}" has no github integration + token configured`);
    this.name = "NoGithubLinkError";
  }
}

/**
 * Phase 78 — raised by `ProjectPrService.merge` when GitHub reports the PR is
 * not mergeable (405/409 from `PUT .../pulls/:number/merge` — a real conflict,
 * an already-merged PR, or required reviews/checks not satisfied). Maps to a 409.
 */
export class PrNotMergeableError extends Error {
  constructor(
    public readonly id: string,
    public readonly number: number,
    detail?: string,
  ) {
    super(`PR #${number} on project "${id}" is not mergeable${detail ? `: ${detail}` : ""}`);
    this.name = "PrNotMergeableError";
  }
}

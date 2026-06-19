/** Raised when a skill file does not exist for the requested id. */
export class SkillNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Skill "${id}" not found`);
    this.name = "SkillNotFoundError";
  }
}

/** Raised when creating a skill whose id is already taken. */
export class SkillConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Skill "${id}" already exists`);
    this.name = "SkillConflictError";
  }
}

/** Raised when an id is unsafe to use as a file name (e.g. path traversal). */
export class InvalidSkillIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid skill id: "${id}"`);
    this.name = "InvalidSkillIdError";
  }
}

/** Raised when a skill file exists but its contents cannot be parsed/validated. */
export class CorruptSkillFileError extends Error {
  constructor(public readonly id: string) {
    super(`Skill "${id}" is stored in a corrupt or invalid file`);
    this.name = "CorruptSkillFileError";
  }
}

import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateGoalInput,
  type Goal,
  GoalSchema,
  MakerRefSchema,
  type UpdateGoalInput,
  VerifierSpecSchema,
} from "@zibby/contracts";
import { MarkdownEntityStore, searchByText } from "../shared/file-storage";
import {
  CorruptGoalFileError,
  GoalConflictError,
  GoalNotFoundError,
  InvalidGoalError,
  InvalidGoalIdError,
} from "./goals.errors";

/** DI token carrying the absolute path of the directory that holds goal files. */
export const GOALS_DIR = "GOALS_DIR";

/**
 * File-backed persistence for goals: one `<id>.goal.md` per goal. The frontmatter
 * carries the structured config (`name`, `desc`, `objective`, `maker`, `verifier`,
 * `maxIterations`, `budget`) and the Markdown body is `instructions`. Same
 * guarantees as the agents/pipelines stores — atomic writes, defense-in-depth id
 * guards, tolerant listing. A structurally-broken `maker`/`verifier` makes the
 * goal corrupt (it can't loop without them) rather than silently dropping it.
 */
@Injectable()
export class GoalsStorageService extends MarkdownEntityStore<Goal> {
  protected readonly fileExt = ".goal.md";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(GOALS_DIR) dir: string) {
    super(dir);
  }

  async create(input: CreateGoalInput): Promise<Goal> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) {
      throw new GoalConflictError(input.id);
    }
    const parsed = GoalSchema.safeParse({ ...input, name: input.name ?? input.id });
    if (!parsed.success) {
      throw new InvalidGoalError(parsed.error.issues[0]?.message ?? "invalid goal");
    }
    await this.writeEntity(parsed.data);
    return parsed.data;
  }

  /** Free-text search over the catalog by id, name, desc and objective. */
  async search(query: string): Promise<Goal[]> {
    return searchByText(await this.list(), query, (g) => [g.id, g.name, g.desc, g.objective]);
  }

  async update(id: string, patch: UpdateGoalInput): Promise<Goal> {
    const existing = await this.get(id);
    const candidate = { ...existing, ...patch, id: existing.id };
    const parsed = GoalSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new InvalidGoalError(parsed.error.issues[0]?.message ?? "invalid goal");
    }
    await this.writeEntity(parsed.data);
    return parsed.data;
  }

  protected idOf(goal: Goal): string {
    return goal.id;
  }

  protected notFound(id: string): Error {
    return new GoalNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidGoalIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptGoalFileError(id);
  }

  protected compare(a: Goal, b: Goal): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(goal: Goal): string {
    return goal.instructions;
  }

  /**
   * Parse a `.goal.md` into a {@link Goal}. The id comes from the file name; the
   * structured config + maker/verifier from the frontmatter; `instructions` from
   * the body. Returns null if structurally broken (bad YAML, no valid maker chain).
   */
  protected fromFrontmatter(data: Record<string, unknown>, id: string, body: string): Goal | null {
    const candidate: Record<string, unknown> = {
      id,
      instructions: body,
      objective: data.objective,
      maxIterations: data.maxIterations,
    };
    if (typeof data.name === "string") candidate.name = data.name;
    if (typeof data.desc === "string") candidate.desc = data.desc;
    if (data.budget !== undefined) candidate.budget = data.budget;
    const maker = MakerRefSchema.safeParse(data.maker);
    if (maker.success) candidate.maker = maker.data;
    const verifier = VerifierSpecSchema.safeParse(data.verifier);
    if (verifier.success) candidate.verifier = verifier.data;

    const result = GoalSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  protected toFrontmatter(goal: Goal): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: goal.name ?? goal.id,
      objective: goal.objective,
      maker: goal.maker,
      verifier: goal.verifier,
      maxIterations: goal.maxIterations,
    };
    if (goal.desc !== undefined) data.desc = goal.desc;
    if (goal.budget !== undefined) data.budget = goal.budget;
    return data;
  }
}

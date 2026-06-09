import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { skillsContract } from "@zibby/contracts"
import { InvalidSkillIdError, SkillConflictError, SkillNotFoundError } from "./skills.errors"
import { SkillsStorageService } from "./skills.storage.service"

/**
 * Implements `skillsContract` against the file-backed storage service. Mirrors
 * `AgentsController`: bodies/params validated against the contract Zod schemas by
 * `@ts-rest/nest`; conflicts → 409, missing/unsafe id → 404.
 */
@Controller()
export class SkillsController {
  constructor(private readonly storage: SkillsStorageService) {}

  @TsRestHandler(skillsContract)
  handler() {
    return tsRestHandler(skillsContract, {
      createSkill: async ({ body }) => {
        try {
          const skill = await this.storage.create(body)
          return { status: 201, body: skill }
        } catch (error) {
          if (error instanceof SkillConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      listSkills: async () => ({ status: 200, body: await this.storage.list() }),

      searchSkills: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getSkill: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.storage.get(id) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      updateSkill: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.storage.update(id, body) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      deleteSkill: async ({ params: { id } }) => {
        try {
          await this.storage.delete(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },
    })
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof SkillNotFoundError || error instanceof InvalidSkillIdError
}

function notFound(id: string): string {
  return `Skill "${id}" not found`
}

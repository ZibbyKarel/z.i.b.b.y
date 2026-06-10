import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { type GateRuleInput, gatesContract } from "@zibby/contracts"
import { AgentNotFoundError, InvalidAgentIdError } from "../agents/agents.errors"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { makeErrorMapper } from "../shared/http/error-mapping"
import { GateEvaluatorService } from "./gate-evaluator.service"

const errors = makeErrorMapper("Agent", {
  missing: [AgentNotFoundError, InvalidAgentIdError],
})

/**
 * Implements `gatesContract`. Lives in the agents module so it can load agents
 * (their `gates`/`requires_approval`), while the evaluation engine itself stays
 * dependency-free. `replaceAgentGates` enforces harden-only (422 on weakening).
 */
@Controller()
export class GatesController {
  constructor(
    private readonly agents: AgentsStorageService,
    private readonly evaluator: GateEvaluatorService,
  ) {}

  @TsRestHandler(gatesContract)
  handler() {
    return tsRestHandler(gatesContract, {
      getSystemPolicy: async () => ({ status: 200, body: { rules: await this.evaluator.floor() } }),

      evaluate: async ({ body: { agentId, action } }) => {
        const rules = agentId
          ? await this.evaluator.rulesForAgent(await this.policyInput(agentId))
          : await this.evaluator.floor()
        return { status: 200, body: this.evaluator.evaluate(rules, action) }
      },

      getAgentGates: ({ params: { id } }) =>
        errors.or404(id, async () => {
          const inherited = await this.evaluator.floor()
          const own = this.evaluator.ownRules(await this.policyInput(id))
          return { inherited, own }
        }),

      replaceAgentGates: async ({ params: { id }, body: { gates } }) => {
        try {
          await this.agents.get(id) // 404 if unknown
          const floor = await this.evaluator.floor()
          const violation = this.evaluator.validateHardenOnly(floor, gates)
          if (violation) return { status: 422, body: violation }

          await this.agents.update(id, { gates })
          const own = this.evaluator.ownRules({ gates })
          return { status: 200, body: { inherited: floor, own } }
        } catch (error) {
          if (errors.isMissing(error)) return errors.notFound(id)
          throw error
        }
      },
    })
  }

  private async policyInput(id: string): Promise<{ gates?: GateRuleInput[]; requires_approval?: boolean }> {
    const agent = await this.agents.get(id)
    return { gates: agent.gates, requires_approval: agent.requires_approval }
  }
}

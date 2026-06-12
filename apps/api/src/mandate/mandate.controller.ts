import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { MandateSchema, mandateContract } from "@zibby/contracts"
import { MandateStorageService } from "./mandate.storage.service"

/**
 * The autonomy mandate endpoints. GET returns the current (seeded) mandate; PUT
 * strict-validates the body against {@link MandateSchema} and returns 422 on any
 * unknown key — the transport schema is permissive so the unknown key reaches here
 * and is rejected explicitly (Law 4: only this operator endpoint writes the
 * mandate, and it can't be widened by a smuggled field).
 */
@Controller()
export class MandateController {
  constructor(private readonly storage: MandateStorageService) {}

  @TsRestHandler(mandateContract)
  handler() {
    return tsRestHandler(mandateContract, {
      getMandate: async () => ({ status: 200, body: await this.storage.read() }),

      setMandate: async ({ body }) => {
        const parsed = MandateSchema.safeParse(body)
        if (!parsed.success) {
          return { status: 422 as const, body: { message: "mandate has unknown or invalid fields" } }
        }
        return { status: 200 as const, body: await this.storage.write(parsed.data) }
      },
    })
  }
}

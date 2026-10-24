import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { todoContract } from "@zibby/contracts";
import { TodoFullError, TodoStore } from "./todo.store";

@Controller()
export class TodoController {
  constructor(private readonly todo: TodoStore) {}

  @TsRestHandler(todoContract)
  handler() {
    return tsRestHandler(todoContract, {
      listTodo: async () => ({ status: 200, body: { items: await this.todo.list() } }),
      createTodo: async ({ body }) => {
        try {
          return { status: 201, body: await this.todo.create(body.text) };
        } catch (error) {
          if (error instanceof TodoFullError) {
            return { status: 409, body: { message: error.message } };
          }
          throw error;
        }
      },
      deleteTodo: async ({ params }) =>
        (await this.todo.remove(params.id))
          ? { status: 204, body: undefined }
          : { status: 404, body: { message: `TODO note ${params.id} not found` } },
    });
  }
}

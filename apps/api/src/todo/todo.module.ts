import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { TodoController } from "./todo.controller";
import { TODO_FILE, TodoStore } from "./todo.store";

export function resolveTodoFile(): string {
  return process.env.TODO_FILE ?? dataDir("todo", "items.json");
}

@Module({
  controllers: [TodoController],
  providers: [{ provide: TODO_FILE, useFactory: resolveTodoFile }, TodoStore],
  exports: [TodoStore],
})
export class TodoModule {}

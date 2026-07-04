import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { PinsController } from "./pins.controller";
import { PINS_FILE, PinsStore } from "./pins.store";

export function resolvePinsFile(): string {
  return process.env.PINS_FILE ?? dataDir("pins.json");
}

@Module({
  controllers: [PinsController],
  providers: [{ provide: PINS_FILE, useFactory: resolvePinsFile }, PinsStore],
})
export class PinsModule {}

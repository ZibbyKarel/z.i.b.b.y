import { fileURLToPath } from "node:url";

export const FIXTURES_DEFAULT_PROMPTS = fileURLToPath(
  new URL("../fixtures/bakeoff.json", import.meta.url),
);

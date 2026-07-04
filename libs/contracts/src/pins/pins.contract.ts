import { initContract } from "@ts-rest/core";
import { PinsSchema } from "./pin.schema";

const c = initContract();

/**
 * Připnuté agenty/pipeliny/řetězce pro Overview "Panel rychlého spuštění".
 * Jeden malý operátorem vlastněný seznam, file-backed — stejná pozice jako
 * `systemContract`. `getPins` čte efektivní seznam (prázdné pole, když
 * soubor neexistuje); `putPins` nahrazuje celý seznam (add/remove/reorder
 * jsou všechno "spočti nový seznam na klientovi, ulož celý").
 */
export const pinsContract = c.router(
  {
    getPins: {
      method: "GET",
      path: "/pins",
      responses: { 200: PinsSchema },
      summary: "Get the pinned targets for the overview quick-launch panel",
    },
    putPins: {
      method: "PUT",
      path: "/pins",
      body: PinsSchema,
      responses: { 200: PinsSchema },
      summary: "Replace the pinned targets",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type PinsContract = typeof pinsContract;

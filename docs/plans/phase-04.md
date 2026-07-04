# Plán: Panel rychlého spuštění (připnutí agenta/pipeliny/řetězce na Overview)

> Motivace: chci si na `/overview` připnout agenty, pipeliny a řetězce, které
> spouštím nejčastěji, a mít u každého jedno RUN tlačítko po ruce — bez
> proklikávání na `/agents`, `/pipelines` nebo `/chains`. U agenta/pipeliny RUN
> otevře `NewTaskDialog` s předvyplněným targetem (operátor pořád vidí a může
> změnit popis/target před odesláním); u řetězce RUN spustí chain rovnou, beze
> dialogu — přesně tak, jak řetězec funguje dnes všude jinde v appce.

> **⚠️ Aktualizace (phase-05): řetězec je teď plnohodnotný `TaskTarget`.**
> [`docs/plans/phase-05.md`](./phase-05.md) obrátil dřívější rozhodnutí "chain
> se spouští bez dialogu" — chain je nyní `kind: "chain"` v `TaskTargetSchema` a
> spouští se **stejnou cestou jako agent/pipeline**: RUN otevře `NewTaskDialog`
> s předvyplněným targetem. V tomto plánu to znamená: RUN na připnuté chain
> kartě volá **stejné** `openNewTask(undefined, { kind: "chain", ... })` jako
> agent/pipeline — žádné zvláštní `if (item.kind === "chain")
> startChain.mutate(...)` větvení (viz Fáze 6, upraveno níže).

---

## Zjištění (současný stav, ověřeno v kódu)

- **`TaskTarget` nezná `chain`.** `TaskTargetSchema`
  (`libs/contracts/src/tasks/task.schema.ts:73-77`) je diskriminovaná unie jen
  `agent | pipeline | goal | orchestrator`. Klientský typ
  `TaskTargetKind` (`apps/web/features/tasks/task.ts:59`) totéž. Řetězec do
  tohohle výčtu nepatří a nemá se tam přidávat (viz další bod).
- **Chain se spouští úplně jinak než agent/pipeline — bez dialogu, bez
  klasifikace, bez textu.** Kontrakt to říká explicitně:
  `chainsContract`/`chainRunsContract`
  (`libs/contracts/src/chains/chains.contract.ts:10-13`, `43-46`) — `startChain`
  je `POST /chains/:id/run` s prázdným tělem (`z.object({}).optional()`).
  `ChainsScreen` (`apps/web/features/chains/Screen.tsx:184-192`) volá přímo
  `startChain.mutate({ params: { id: selected.id }, body: {} })` na klik —
  žádný `NewTaskDialog`. Tenhle plán tenhle vzor respektuje: **RUN na
  připnuté agent/pipeline kartě otevře `NewTaskDialog`; RUN na připnuté chain
  kartě spustí chain přímo** (potvrzeno operátorem).
- **`openNewTask` (přes `useNewTask()`) je existující vzor pro pre-fill.**
  `TaskContext.tsx:30` (`open: (initialText?, initialTarget?, initialContext?)
  => void`), použito už na `AgentDetailScreen`
  (`apps/web/features/agents/DetailScreen.tsx:110-117`,
  `openNewTask(undefined, { kind: "agent", id: agent.id, name, glyph: "bot" })`)
  a na pipeline detailu (`apps/web/features/pipelines/Screen.tsx:197-204`,
  stejný vzor s `glyph: "flow"`). Nové RUN tlačítko na Overview panelu použije
  přesně tohle — žádná nová submit cesta.
- **Grafická gramatika top-right akcí už existuje na všech třech detailech** —
  přesně tam patří i nové Pin/Odepnout tlačítko:
  - `AgentDetailScreen` — `PageHeader actions` (`DetailScreen.tsx:104-145`):
    Run, Delete, Save.
  - Pipeline detail — akční `Stack` vedle názvu vybrané pipeliny
    (`apps/web/features/pipelines/Screen.tsx:165-208`): Edit, Duplicate, Run.
  - Chain detail — akční `Stack` vedle názvu vybraného řetězce
    (`apps/web/features/chains/Screen.tsx:168-193`): Delete, Run.
- **Žádný koncept "připnutí"/"oblíbené" dnes v repu neexistuje** (ověřeno
  grepem přes `apps/web`, `apps/api`, `libs/contracts` na `pinned|favorite|
  quickLaunch` — jediné zásahy jsou nesouvisející slovo "pinned" v komentářích
  o UI layoutu). Jde o čistě novou entitu.
- **Vzor pro jeden malý, operátorem přepisovaný JSON blob (ne kolekce
  pojmenovaných entit) už existuje**: `SystemConfigStore`
  (`apps/api/src/system/system-config.store.ts`) — `data/system-config.json`,
  synchronní `readFileSync` při konstrukci, `write()` validuje +
  `writeFileAtomic` + aktualizuje in-memory kopii. `SystemController`
  (`system.controller.ts`) implementuje `getConfig`/`putConfig` 1:1 na
  `systemContract` (`libs/contracts/src/system/system.contract.ts`, `GET`
  vrací efektivní config, `PUT` nahrazuje celý dokument). `SystemModule`
  (`system.module.ts`) je `@Global()`, registruje token pro cestu souboru
  (`resolveSystemConfigFile()`, anchored přes `dataDir("system-config.json")`
  z `apps/api/src/shared/data-dir.ts:36-38`) a store. **Piny mají úplně stejný
  tvar problému** (jeden malý seřazený seznam, operátor ho čte/přepisuje celý
  najednou) — tenhle plán `PinsStore`/`PinsController`/`PinsModule` staví jako
  1:1 obdobu `SystemConfigStore`/`SystemController`/`SystemModule`, ne jako
  `EntityFileStore` kolekci (ta je pro pojmenované entity s vlastním
  souborem/id, jako `ChainsStorageService` — piny žádné vlastní jméno/soubor
  nemají).
- **Frontendový vzor query/mutace nad `system` kontraktem** —
  `useSystemConfigQuery` (`apps/web/features/system/queries/useSystemConfigQuery.ts`)
  + `useSetSystemConfigMutation`
  (`apps/web/features/system/mutations/useSetSystemConfigMutation.ts`, postaven
  nad `makeInvalidatingMutation` z `apps/web/state/makeInvalidatingMutation.ts`)
  — stejný pár hooků (`usePinsQuery`/`useSetPinsMutation`) vznikne pro piny.
- **Registrace nového kontraktu/modulu je mechanická** — `pinsContract` půjde
  vedle `systemContract` do `appContract`
  (`libs/contracts/src/app.contract.ts:36`, `82`) a exportu z
  `libs/contracts/src/index.ts:55-56`; `PinsModule` půjde vedle `SystemModule`
  do `AppModule.imports`
  (`apps/api/src/app.module.ts:36`, `43`).
- **Ikona "pin" v design systému existuje** (`libs/design-system/src/.../icons/pin.tsx`,
  registrovaná v `icons/index.ts:96`) — žádná nová ikona není potřeba.
- **Glyph konvence pro RUN pre-fill**: agent používá vlastní
  `agent.glyph ?? "bot"` (`AgentCard.tsx:38`, `DetailScreen.tsx:115`), pipeline
  nemá vlastní glyph pole na schématu — všude v kódu je natvrdo `"flow"`
  (`DetailScreen.tsx` import `usePipelinesQuery`, `pipelines/Screen.tsx:202`).
  Chain používá `"link"` všude, kde se v UI zobrazuje ikona
  (`chains/Screen.tsx:124`, `NewChainDialog.tsx:68`). Quick-launch panel
  přebírá stejné tři hodnoty.
- **Overview `Screen.tsx`** (`apps/web/features/overview/Screen.tsx`) už
  natahuje `useAgentsQuery`/`usePipelinesQuery` (řádky 8, 10) — bude potřeba
  přidat `useChainsQuery` (`apps/web/features/chains` barrel), aby šlo
  připnuté řetězce dořešit na jméno. Panely na Overview se skrývají, když
  jsou prázdné (`ParkedRunsPanel.tsx:21`, `if (parked.length === 0) return
  null;` — stejná konvence, "quiet competence, no empty chrome") — nový
  `QuickLaunchPanel` se řídí stejným pravidlem, žádný "zatím nic připnuto"
  prázdný stav.

---

## Cíl

1. Operátor může na detailu agenta, pipeliny a řetězce připnout/odepnout danou
   entitu na Overview — tlačítko top-right, vedle existujících akcí (Run/Edit/
   Delete/Save), stejná gramatika jako zbytek appky.
2. `/overview` zobrazuje **Panel rychlého spuštění** se všemi připnutými
   položkami (jen když je aspoň jedna) — u každé RUN tlačítko a malé odepnutí.
3. RUN na agent/pipeline kartě otevře `NewTaskDialog` s předvyplněným targetem
   (target zůstává změnitelný, klasifikace běží jako obvykle — žádný nový
   dispatch mechanismus). RUN na chain kartě spustí `POST /chains/:id/run`
   přímo, beze dialogu — stejně jako dnes na `/chains/:id`.
4. Připnutí je perzistováno na disku (`data/pins.json`) přes malý vlastní
   kontrakt/CRUD pár (`GET`/`PUT /api/pins`) — přežije restart backendu i
   refresh prohlížeče, viditelné a auditovatelné jako zbytek stavu.
5. Mimo scope: přeřazování pořadí připnutých karet (append-only pořadí podle
   připnutí), limit na počet pinů, a pinning `goal`/`orchestrator` targetů
   (nejsou to katalogové entity s vlastní stránkou — viz Otevřené otázky).

---

## Fáze 1 — Kontrakt: schéma + API kontrakt pro piny

- [ ] Nový soubor `libs/contracts/src/pins/pin.schema.ts`:
  ```ts
  import { z } from "zod";

  /** Co lze připnout na Overview — katalogové entity s vlastní detail stránkou. */
  export const PinKindSchema = z.enum(["agent", "pipeline", "chain"]);
  export type PinKind = z.infer<typeof PinKindSchema>;

  /** Jedno připnutí: druh entity + její id. Žádné jméno/glyph — ty se dočtou
   *  live z katalogu (agent/pipeline/chain), takže přejmenování entity se
   *  v panelu projeví hned, bez zvláštní synchronizace. */
  export const PinSchema = z.object({
    kind: PinKindSchema,
    id: z.string().min(1),
  });
  export type Pin = z.infer<typeof PinSchema>;

  /** Celý seznam připnutých položek, v pořadí připnutí (append-only, viz plán). */
  export const PinsSchema = z.array(PinSchema);
  export type Pins = z.infer<typeof PinsSchema>;
  ```
- [ ] Nový soubor `libs/contracts/src/pins/pins.contract.ts` (1:1 vzor podle
      `system.contract.ts`):
  ```ts
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
  ```
- [ ] `libs/contracts/src/index.ts`: přidat vedle řádků 55-56 (`system`)
      `export * from "./pins/pin.schema";` a
      `export * from "./pins/pins.contract";`.
- [ ] `libs/contracts/src/app.contract.ts`: import `pinsContract` vedle
      `systemContract` (řádek 36) a registrace `pins: pinsContract,` vedle
      `system: systemContract,` v `appContract` (řádek 82).
- [ ] `pnpm typecheck`.

## Fáze 2 — Backend: `PinsStore` + kontroler + modul

- [ ] Nový soubor `apps/api/src/pins/pins.store.ts` (1:1 vzor podle
      `system-config.store.ts`, ale nad polem místo objektu a s dedup na
      write):
  ```ts
  import { readFileSync } from "node:fs";
  import * as path from "node:path";
  import { Inject, Injectable } from "@nestjs/common";
  import { type Pins, PinsSchema } from "@zibby/contracts";
  import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

  export const PINS_FILE = "PINS_FILE";

  /**
   * Připnuté targety pro Overview "Panel rychlého spuštění", persistované jako
   * `data/pins.json` — stejná pozice jako `SystemConfigStore`: jeden malý
   * operátorem vlastněný dokument, ne kolekce pojmenovaných entit
   * (`EntityFileStore`). Synchronní load v konstruktoru ze stejného důvodu jako
   * `SystemConfigStore` (viz jeho komentář) — chybějící/porušený soubor →
   * prázdný seznam, nikdy chyba.
   */
  @Injectable()
  export class PinsStore {
    private readonly dir: string;
    private pins: Pins;

    constructor(@Inject(PINS_FILE) private readonly file: string) {
      this.dir = path.dirname(file);
      this.pins = PinsStore.load(file);
    }

    private static load(file: string): Pins {
      let raw: string;
      try {
        raw = readFileSync(file, "utf8");
      } catch {
        return [];
      }
      const parsed = PinsSchema.safeParse(safeJson(raw));
      return parsed.success ? parsed.data : [];
    }

    async read(): Promise<Pins> {
      return this.pins;
    }

    /** Replace the whole list, deduped by (kind, id) — last occurrence wins. */
    async write(next: Pins): Promise<Pins> {
      const validated = PinsSchema.parse(next);
      const seen = new Map<string, Pins[number]>();
      for (const pin of validated) seen.set(`${pin.kind}:${pin.id}`, pin);
      const deduped = [...seen.values()];
      await ensureDir(this.dir);
      await writeFileAtomic(this.file, `${JSON.stringify(deduped, null, 2)}\n`);
      this.pins = deduped;
      return deduped;
    }
  }
  ```
  (Poznámka: dedup podle poslední výskytu, ne první — když klient posílá "seznam
  po přidání", nová položka je na konci a musí přežít, kdyby náhodou byla v
  seznamu duplicitně.)
- [ ] Nový soubor `apps/api/src/pins/pins.controller.ts`:
  ```ts
  import { Controller } from "@nestjs/common";
  import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
  import { pinsContract } from "@zibby/contracts";
  import { PinsStore } from "./pins.store";

  @Controller()
  export class PinsController {
    constructor(private readonly pins: PinsStore) {}

    @TsRestHandler(pinsContract)
    handler() {
      return tsRestHandler(pinsContract, {
        getPins: async () => ({ status: 200, body: await this.pins.read() }),
        putPins: async ({ body }) => ({ status: 200, body: await this.pins.write(body) }),
      });
    }
  }
  ```
- [ ] Nový soubor `apps/api/src/pins/pins.module.ts` (1:1 vzor podle
      `system.module.ts`, ale bez `@Global()` — piny čte jen web přes HTTP,
      žádný jiný backend modul je nepotřebuje in-process):
  ```ts
  import { Module } from "@nestjs/common";
  import { dataDir } from "../shared/data-dir";
  import { PINS_FILE, PinsStore } from "./pins.store";
  import { PinsController } from "./pins.controller";

  export function resolvePinsFile(): string {
    return process.env.PINS_FILE ?? dataDir("pins.json");
  }

  @Module({
    controllers: [PinsController],
    providers: [{ provide: PINS_FILE, useFactory: resolvePinsFile }, PinsStore],
  })
  export class PinsModule {}
  ```
- [ ] `apps/api/src/app.module.ts`: import `PinsModule` vedle `SystemModule`
      (řádek 36) a přidat do `imports` pole vedle `SystemModule` (řádek 43).
- [ ] `pnpm typecheck`.

## Fáze 3 — Backend: testy

- [ ] `apps/api/src/pins/pins.store.test.ts` (vzor
      `system-config.store.test.ts`): prázdný/neexistující soubor → `read()`
      vrací `[]`; `write()` perzistuje a `read()` po restartu (nová instance
      nad stejným souborem) vidí totéž; `write()` s duplicitním `(kind, id)` →
      uloží jen jednu položku (poslední); porušený JSON v souboru při startu →
      `read()` vrací `[]`, ne pád.
  - `pnpm test` pro `apps/api`.

## Fáze 4 — Frontend: query/mutation hooky + sdílený toggle

- [ ] Nový soubor `apps/web/features/pins/queries/usePinsQuery.ts` (1:1 vzor
      `useSystemConfigQuery.ts`):
  ```ts
  import { apiClient } from "../../../state/api";
  import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

  export function getPinsQueryKey() {
    return ["pins"] as const;
  }

  export function usePinsQuery() {
    return apiClient.pins.getPins.useQuery({
      queryKey: getPinsQueryKey(),
      select: selectApiResponseBody,
    });
  }
  ```
- [ ] Nový soubor `apps/web/features/pins/mutations/useSetPinsMutation.ts`
      (1:1 vzor `useSetSystemConfigMutation.ts`):
  ```ts
  import { apiClient } from "../../../state/api";
  import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
  import { getPinsQueryKey } from "../queries/usePinsQuery";

  export const useSetPinsMutation = makeInvalidatingMutation(
    apiClient.pins.putPins.useMutation,
    getPinsQueryKey,
  );
  ```
- [ ] Nový soubor `apps/web/features/pins/usePinToggle.ts` — sdílená logika
      "je tohle připnuté? přepni to", použitá jak z `PinButton`
      (Fáze 5), tak z `QuickLaunchPanel`'s odepnutí (Fáze 6):
  ```ts
  import type { Pin, PinKind } from "@zibby/contracts";
  import { useSetPinsMutation } from "./mutations/useSetPinsMutation";
  import { usePinsQuery } from "./queries/usePinsQuery";

  function pinKey(p: Pin) {
    return `${p.kind}:${p.id}`;
  }

  /** Read the current pin list and expose an is-pinned check + a toggle mutator. */
  export function usePinToggle() {
    const { data: pins = [] } = usePinsQuery();
    const setPins = useSetPinsMutation();

    const isPinned = (kind: PinKind, id: string) =>
      pins.some((p) => p.kind === kind && p.id === id);

    const toggle = (kind: PinKind, id: string) => {
      const key = `${kind}:${id}`;
      const next = isPinned(kind, id)
        ? pins.filter((p) => pinKey(p) !== key)
        : [...pins, { kind, id }];
      setPins.mutate({ body: next });
    };

    return { pins, isPinned, toggle, isPending: setPins.isPending };
  }
  ```
- [ ] Nový soubor `apps/web/features/pins/index.ts` — barrel (`usePinsQuery`,
      `useSetPinsMutation`, `usePinToggle`, `PinButton` z Fáze 5).
- [ ] `pnpm typecheck`.

## Fáze 5 — Frontend: Pin/Odepnout tlačítko na detailu agenta/pipeliny/řetězce

- [ ] Nový soubor `apps/web/features/pins/components/PinButton.tsx`:
  ```tsx
  "use client";
  import type { PinKind } from "@zibby/contracts";
  import { Button } from "@zibby/design-system";
  import { useTranslations } from "next-intl";
  import { usePinToggle } from "../usePinToggle";

  export interface PinButtonProps {
    kind: PinKind;
    id: string;
  }

  /** Top-right pin/unpin toggle for an agent/pipeline/chain detail page —
   *  same action-row position as Run/Edit/Delete on every detail screen. */
  export function PinButton({ kind, id }: PinButtonProps) {
    const t = useTranslations("pins");
    const { isPinned, toggle, isPending } = usePinToggle();
    const pinned = isPinned(kind, id);
    return (
      <Button
        icon="pin"
        intent="ghost"
        loading={isPending}
        onClick={() => toggle(kind, id)}
        size="sm"
      >
        {t(pinned ? "unpin" : "pin")}
      </Button>
    );
  }
  ```
- [ ] `apps/web/features/agents/DetailScreen.tsx`: přidat
      `<PinButton kind="agent" id={agent.id} />` do `actions` `Stack`
      (řádky 104-145), vedle Run tlačítka.
- [ ] `apps/web/features/pipelines/Screen.tsx`: přidat
      `<PinButton kind="pipeline" id={selected.id} />` do akčního `Stack`
      vedle vybrané pipeliny (řádky 165-208), vedle Run tlačítka.
- [ ] `apps/web/features/chains/Screen.tsx`: přidat
      `<PinButton kind="chain" id={selected.id} />` do akčního `Stack` vedle
      vybraného řetězce (řádky 168-193), vedle Run tlačítka.
- [ ] Do `apps/web/i18n/messages/cs.json` a `en.json` přidat namespace `pins`:
      - cs: `"pins": { "pin": "Připnout", "unpin": "Odepnout" }`
      - en: `"pins": { "pin": "Pin", "unpin": "Unpin" }`
- [ ] `pnpm lint && pnpm typecheck`.

## Fáze 6 — Frontend: `QuickLaunchPanel` na Overview

- [ ] Nový soubor
      `apps/web/features/overview/components/QuickLaunchPanel/QuickLaunchPanel.tsx`:
  ```tsx
  "use client";
  import { Button, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
  import { useTranslations } from "next-intl";
  import { HudPanel } from "../../../../components/HudPanel/HudPanel";
  import { useAgentsQuery } from "../../../agents";
  import { useChainsQuery } from "../../../chains";
  import { usePipelinesQuery } from "../../../pipelines";
  import { usePinToggle } from "../../../pins";
  import { useNewTask } from "../../../tasks";

  export enum QuickLaunchPanelTestId {
    Row = "quick-launch-row",
    Run = "quick-launch-run",
    Unpin = "quick-launch-unpin",
  }

  interface ResolvedPin {
    kind: "agent" | "pipeline" | "chain";
    id: string;
    name: string;
    glyph: IconName;
  }

  /**
   * Overview "Panel rychlého spuštění" (Fáze 4 tohoto plánu): every pinned
   * agent/pipeline/chain, resolved live against its catalog so a rename shows
   * up without any pin-side bookkeeping. An entity deleted after being pinned
   * silently drops out of this list (the pin itself is left on disk — no
   * write-on-read side effect; unpinning is still explicit from the detail
   * page or this panel). Renders nothing while there is nothing pinned, same
   * as {@link ParkedRunsPanel}.
   */
  export function QuickLaunchPanel() {
    const t = useTranslations("pins");
    const { pins, toggle } = usePinToggle();
    const { data: agents = [] } = useAgentsQuery();
    const { data: pipelines = [] } = usePipelinesQuery();
    const { data: chains = [] } = useChainsQuery();
    const { open: openNewTask } = useNewTask();

    const resolved: ResolvedPin[] = pins.flatMap((pin) => {
      if (pin.kind === "agent") {
        const agent = agents.find((a) => a.id === pin.id);
        if (!agent) return [];
        return [{ kind: "agent", id: agent.id, name: agent.name ?? agent.id, glyph: (agent.glyph as IconName | undefined) ?? "bot" }];
      }
      if (pin.kind === "pipeline") {
        const pipeline = pipelines.find((p) => p.id === pin.id);
        if (!pipeline) return [];
        return [{ kind: "pipeline", id: pipeline.id, name: pipeline.name ?? pipeline.id, glyph: "flow" }];
      }
      const chain = chains.find((c) => c.id === pin.id);
      if (!chain) return [];
      return [{ kind: "chain", id: chain.id, name: chain.name ?? chain.id, glyph: "link" }];
    });

    if (resolved.length === 0) return null;

    return (
      <HudPanel title={t("quickLaunchTitle")}>
        <Stack gap="100">
          {resolved.map((item) => (
            <Stack
              align="center"
              data-testid={QuickLaunchPanelTestId.Row}
              direction="row"
              gap="100"
              key={`${item.kind}:${item.id}`}
            >
              <Icon name={item.glyph} size="sm" tone="dim" />
              <Typography grow size="sm" type="note" weight="medium">
                {item.name}
              </Typography>
              <Button
                data-testid={QuickLaunchPanelTestId.Run}
                icon="play"
                intent="primary"
                onClick={() =>
                  // phase-05: chain je normální TaskTarget → stejná cesta jako agent/pipeline.
                  openNewTask(undefined, { kind: item.kind, id: item.id, name: item.name, glyph: item.glyph })
                }
                size="sm"
              >
                {t("run")}
              </Button>
              <Button
                aria-label={t("unpinAria", { name: item.name })}
                data-testid={QuickLaunchPanelTestId.Unpin}
                icon="x"
                intent="ghost"
                onClick={() => toggle(item.kind, item.id)}
                size="sm"
              />
            </Stack>
          ))}
        </Stack>
      </HudPanel>
    );
  }
  ```
  (Ověřit při implementaci přesné jméno `Typography`'s `grow` propy / ekvivalentu
  pro vyplnění zbylého prostoru řádku — pokud neexistuje, obalit `Typography`
  do `Container grow minW0` stejně jako `AgentCard`/jiné karty.)
- [ ] (phase-05 zrušil potřebu `useStartChainMutation` v panelu — chain jede
      přes `openNewTask` jako agent/pipeline; RUN pro všechny tři je jedna cesta.)
- [ ] `apps/web/features/overview/Screen.tsx`: přidat `useChainsQuery` import
      (vedle `usePipelinesQuery`, řádek 10) a vykreslit `<QuickLaunchPanel />`
      do hlavního `Stack` (řádky 43-100) — zařadit **za `NeedsAttentionPanel` a
      před `ActivityFeed`**: schvalování/parkované/needs-attention zůstávají
      nahoře jako fronta "potřebuje tě", quick-launch je akční, ale
      neurgentní panel, activity feed je pasivní log dole.
- [ ] Do `cs.json`/`en.json` namespace `pins` doplnit:
      - cs: `"quickLaunchTitle": "Panel rychlého spuštění"`, `"run": "Spustit"`,
        `"unpinAria": "Odepnout {name}"`
      - en: `"quickLaunchTitle": "Quick launch"`, `"run": "Run"`,
        `"unpinAria": "Unpin {name}"`
- [ ] `pnpm lint && pnpm typecheck`.

## Fáze 7 — Testy (frontend)

- [ ] `apps/web/features/pins/usePinToggle.test.ts` (nebo units v RTL wrapperu
      podle existujícího vzoru pro hooky): `isPinned` true/false podle
      obsahu seznamu; `toggle` na nepřipnuté položce zavolá mutaci s
      seznamem `+1`; `toggle` na připnuté položce zavolá mutaci s tou
      položkou odebranou.
- [ ] `apps/web/features/pins/components/PinButton.test.tsx`: nepřipnutý
      target → label "Připnout", klik → mutace s přidanou položkou; připnutý
      target → label "Odepnout", klik → mutace bez té položky.
- [ ] `apps/web/features/agents/DetailScreen.test.tsx`,
      `apps/web/features/pipelines/Screen.test.tsx` (pokud existuje),
      `apps/web/features/chains/Screen.test.tsx`: rozšířit o assert, že
      `PinButton` je v akční řadě přítomný s očekávaným `kind`/`id`.
- [ ] `apps/web/features/overview/components/QuickLaunchPanel/QuickLaunchPanel.test.tsx`:
  - žádné piny → panel se nevykreslí (`null`).
  - pin na existující agenty/pipeliny/řetězce → řádek s jejich jménem/glyphem.
  - pin na neexistující (smazané) id → tichy vypadne ze seznamu, žádná chyba.
  - klik na RUN u agenta/pipeliny/řetězce → `openNewTask` zavolané se správným
    `initialTarget` (phase-05: chain jede stejnou cestou jako agent/pipeline).
  - klik na odepnutí → `toggle`/mutace zavolaná s danou položkou odebranou.
- [ ] `apps/web/features/overview/Screen.test.tsx` — rozšířit o assert, že
      `QuickLaunchPanel` je na stránce vykreslený.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` (celá suita).
- [ ] Manuální smoke test: připnout agenta na jeho detailu → objeví se na
      `/overview` v Panelu rychlého spuštění → RUN otevře `NewTaskDialog`
      s předvyplněným targetem → odeslat/zavřít. Připnout pipeline → totéž.
      Připnout řetězec → RUN na Overview spustí chain run bez dialogu,
      ověřit na `/chains/:id`, že run vznikl. Odepnout z Overview panelu →
      karta zmizí; restart `pnpm api:dev` → připnuté položky přežijí
      (`data/pins.json` existuje a je čitelný).

---

## Otevřené otázky (rozhodnout před/během implementace)

- **Pořadí připnutých karet je append-only** (pořadí podle toho, kdy byly
  připnuty) — přeřazování (drag-to-reorder) je mimo scope. Datový model
  (`PinsSchema` = pole) to nijak neblokuje — jde o čistě UI rozšíření později,
  bez migrace.
- **Žádný limit na počet pinů.** Pokud se v praxi ukáže, že panel je moc
  nabitý, jde přidat měkký limit (např. posledních 8) při zápisu v
  `PinsStore.write()` bez dopadu na kontrakt.
- **`goal` a `orchestrator` targety nejde připnout.** Nemají vlastní
  katalogovou detail stránku s top-right akční řadou (goaly jsou vázané na
  konkrétní úkol, orchestrator nemá `id`) — `PinKindSchema` je proto úzce
  `agent | pipeline | chain`. Rozšíření by šlo, kdyby v budoucnu vznikla
  smysluplná "spustit znovu tenhle typ goalu" akce.
- **Orphaned piny (smazaná entita) se nikdy sami needepnou.** `QuickLaunchPanel`
  je jen vyfiltruje z zobrazení; `data/pins.json` si nadále nese referenci na
  neexistující id. Cena je zanedbatelná (pár bajtů), přínos je jednoduchost
  (žádný write-on-read vedlejší efekt, žádná race mezi smazáním entity a
  čtením pinů). Pokud by to vadilo, jde doplnit úklid při `deleteAgent`/
  `deletePipeline`/`deleteChain` mutacích (zavolat `PinsStore.write` bez dané
  položky) jako samostatný malý dodatek.

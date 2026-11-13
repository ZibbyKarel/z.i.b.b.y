import {
  type AiEngineStatus,
  MODEL_FAMILIES,
  MODEL_FAMILY_PROVIDER,
  type ModelFamily,
  type SystemConfig,
  applyModelFamily,
} from "@zibby/contracts";

export interface ModelFamilyChoice {
  /** The opencode catalog is readable (installed + non-empty): presets are filtered by it. */
  catalogReadable: boolean;
  /** Families whose provider has no model in a readable catalog; never written. */
  disconnected: ModelFamily[];
  /** Writes `{ ...config, ...applyModelFamily(family, catalog ids | undefined) }`; no-op for the current or a disconnected family. */
  choose: (family: ModelFamily) => void;
}

/** The model-family switch shared by Settings and the top bar. */
export function modelFamilyChoice(
  config: SystemConfig,
  engines: AiEngineStatus[] | undefined,
  mutate: (input: { body: SystemConfig }) => void,
): ModelFamilyChoice {
  const opencode = engines?.find((e) => e.id === "opencode");
  const models = opencode?.models ?? [];
  // An unreadable catalog (binary missing / empty list) cannot filter a preset: it is written as is.
  const catalogReadable = !!opencode?.available && models.length > 0;
  const connected = (family: ModelFamily) =>
    models.some((m) => m.id.startsWith(`${MODEL_FAMILY_PROVIDER[family]}/`));
  const disconnected = catalogReadable ? MODEL_FAMILIES.filter((f) => !connected(f)) : [];

  const choose = (family: ModelFamily) => {
    if (family === config.modelFamily || disconnected.includes(family)) return;
    mutate({
      body: {
        ...config,
        ...applyModelFamily(family, catalogReadable ? models.map((m) => m.id) : undefined),
      },
    });
  };
  return { catalogReadable, disconnected, choose };
}

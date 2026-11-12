/** "opencode · provider/model" for a run that carries an engine; `undefined` for plain Claude runs. */
export function formatEngine(engine?: string, model?: string): string | undefined {
  return engine ? (model ? `${engine} · ${model}` : engine) : undefined;
}

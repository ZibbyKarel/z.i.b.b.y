# AI providers

Global API keys for cloud AI providers. These keys are not tied to any project.
The operator manages them on Settings → **AI models** (`/system/settings/ai-models`).
Today there is exactly one provider, **OpenAI**. Its first consumer is the coloring-book
image generator (`PF_IMAGE_PROVIDER=openai` in `libs/product-factory`). More providers,
such as Anthropic, can be added later as further sections. See the vault note
`ai-providers-api-roadmap`.

## Pieces

| Piece      | File                                                        | Role                                                 |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Schema     | `libs/contracts/src/ai-providers/ai-providers.schema.ts`    | `AiProvidersStatusSchema`, `SetOpenAiKeyInputSchema` |
| Contract   | `libs/contracts/src/ai-providers/ai-providers.contract.ts`  | `aiProvidersContract`                                |
| Store      | `apps/api/src/ai-providers/ai-providers.store.ts`           | `AiProvidersStore`: `<dir>/openai.json`, mode `0600` |
| Controller | `apps/api/src/ai-providers/ai-providers.controller.ts`      | Implements the contract behind `OperatorTokenGuard`  |
| Web        | `apps/web/features/settings/components/AiModelsSection.tsx` | The OpenAI card: status, key input, Save, Clear      |

The storage directory is `AI_PROVIDERS_DIR`, or `.zibby/data/ai-providers` when that is
unset. The directory is gitignored.

## Endpoints

Every route requires the operator token.

- `GET /api/ai-providers` returns `{ openai: { configured, keyHint? } }`. `keyHint` is
  `…` plus the last 4 characters of the key. The key itself is never returned.
- `PUT /api/ai-providers/openai` takes the body `{ apiKey }`. The key is trimmed, must be
  at least 20 characters and must start with `sk-`. It returns the status, or `422`
  when the key is invalid.
- `DELETE /api/ai-providers/openai` clears the key. It is idempotent and returns the
  status.
- `GET /api/ai-providers` also returns `bluecode: { configured, keyHint?, baseUrl?, modelCount? }`.
- `PUT /api/ai-providers/bluecode` takes `{ baseUrl, apiKey? }` (A34). `baseUrl` is trimmed,
  must be `https` without credentials, query or fragment, and loses a trailing slash;
  `apiKey` is trimmed, at least 20 characters. The API checks the key with
  `GET <baseUrl>/models` and reads the model list from `<baseUrl minus /v1>/.well-known/opencode`
  (no redirects followed). Exactly one provider is accepted. Each model is reduced to an
  allowlist (`name`, `limit`, `modalities`, `capabilities`, `reasoning`, `tool_call`,
  `attachment`, `temperature`, `cost`, `variants`; anything else, e.g. `headers` or `options`,
  is dropped) and ids must match `[\w.:-]+`. It writes `<dir>/bluecode.json`
  (`{ baseUrl, apiKey, models }`) and `<dir>/bluecode-probe.json` (the provider-only config the
  `opencode models` probe uses), both mode `0600` from creation. Without `apiKey` the stored key
  is kept and only the model list is refreshed, but only for the same `baseUrl`. Returns the
  status, or `422` with a readable message (no stored key, base URL changed without a key, key
  refused, gateway unreachable, unreadable / empty / unsafe model list).
- `DELETE /api/ai-providers/bluecode` removes both files (idempotent).

- `GET /api/ai-providers/spend` returns `{ month: "YYYY-MM", openai: { spentUsd } }`: what
  ZIBBY itself spent through the OpenAI API this month (Europe/Prague). OpenAI has no
  remaining-credit endpoint, so this is spend only, not a balance.
  `AiProvidersSpendService` sums every `costs.jsonl` under the workflow runs dir
  (`<runs>/<run>/<stage>/costs.jsonl`) whose line has `provider: "openai"` and an `at`
  in the current month. Image calls (product-factory) and OpenAI text steps
  (`openai-stage.mjs`) both write such lines. The Bridge widget **Budgety a limity** shows the
  figure as an "OpenAI" row (shown once a key is set or there is spend) that opens
  Settings → AI models.

- `GET /api/ai-providers/engines` returns the run engines' status (see
  [ai-engines.md](./ai-engines.md)). Each probe shells out with a short timeout and is
  cached for about 1 minute. It never fails: an engine that can't be probed reports
  `available: false`.

  ```ts
  { engines: [
    { id: "claude", available: boolean, version?: string },
    { id: "opencode", available: boolean, version?: string,
      providers?: string[],                     // `auth list` + model prefixes
      models?: { id: string; free: boolean; subscription: boolean; variants: string[] }[] } // `opencode models`
  ] }
  ```

  `free` is true only for an `opencode`-provider model whose catalog price
  (`opencode api GET /api/model`, every input/output/cache component) is 0. A zero-cost
  model of another provider is not free. When the catalog can't be read (the call needs
  opencode's background service), only an `opencode/…-free` id counts as free.
  `subscription` is true for a `claude-agent` model whose catalog `cost` is an empty
  array: it runs on the operator's Claude Code login (neither free nor paid per token).
  `variants` are the catalog's variant ids (e.g. `low|medium|high|xhigh|max`; `[]` = none
  or no catalog). A model listing a `thinking` level supports thinking on opencode: the
  run selects the variant of the same id (A26).

- `GET /api/ai-providers/usage?days=N` (`days` 1–365, default 30) maps
  `opencode stats --json --days N --models`:

  ```ts
  { days: number,
    opencode: { available: boolean,
      totals: AiUsage,
      models: (AiUsage & { providerId: string; modelId: string; variant?: string })[] } }
  // AiUsage = { steps, costUsd, tokens: { input, output, reasoning, cacheRead, cacheWrite } }
  ```

  When stats can't be read, it returns `available: false` with zeros. Verified on 2.2.7:
  `claude-agent` rows come through (`providerId: "claude-agent"`, `costUsd: 0` on a
  subscription login).

## How keys reach work

`WorkflowRunnerService.resolveProjectEnv` places `OPENAI_API_KEY` into the env of every
**tool** phase and every agent phase with `openaiModel`. The second case runs ZIBBY's own
`openai-stage.mjs`, not a model with a shell (see `workflows.md`). It is the
lowest-precedence layer:

global key < project `env` < project secrets

The key is injected even when the workflow has no project.

Claude agent phases never receive the global keys. Those phases read untrusted content and
have a shell, so the key stays out of their reach (Law 4).

The store never logs the key.

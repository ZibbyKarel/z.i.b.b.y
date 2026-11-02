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
- `GET /api/ai-providers/spend` returns `{ month: "YYYY-MM", openai: { spentUsd } }`: what
  ZIBBY itself spent through the OpenAI API this month (Europe/Prague). OpenAI has no
  remaining-credit endpoint, so this is spend only, not a balance.
  `AiProvidersSpendService` sums every `costs.jsonl` under the workflow runs dir
  (`<runs>/<run>/<stage>/costs.jsonl`) whose line has `provider: "openai"` and an `at`
  in the current month. Image calls (product-factory) and OpenAI text steps
  (`openai-stage.mjs`) both write such lines. The Bridge widget **Budgety a limity** shows the
  figure as an "OpenAI" row (shown once a key is set or there is spend) that opens
  Settings → AI models.

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

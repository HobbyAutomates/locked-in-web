# Model router

Every AI call in the scan flows (`src/lib/scanFlows.ts`, `src/lib/labelAnalysis.ts`), `/api/parse-meal`
and `/api/describe-exercise` goes through `run()` in `router.ts`, instead of calling
`@anthropic-ai/sdk` directly. Today every task defaults to Claude, so with no env vars set, behaviour,
prompts and cost are unchanged.

## Layout

- `types.ts` — `TaskId`, `ProviderId`, `JsonSchema`, request/result shapes.
- `tasks.ts` — the `TASKS` registry: each task's default Claude model, max tokens, whether it takes
  images, and whether it's Anthropic-only.
- `config.ts` — reads env vars into `CONFIG`, plus `isConfigured(provider)` and `routeFor(task)`.
- `router.ts` — `run(task, request, guard?)`: resolves the route, calls the provider, validates,
  falls back to Claude, logs one `llm_usage` line per call.
- `providers/anthropic.ts` — the active adapter (existing `@anthropic-ai/sdk` client, forced tool use).
- `providers/gemini.ts` — Google Generative Language REST (`fetch`, no SDK).
- `providers/openaiCompat.ts` — any OpenAI-compatible `/chat/completions` endpoint. Shared by Qwen
  (DashScope or OpenRouter), OpenAI itself, and a local vLLM/InternVL server.
- `providers/paddleocr.ts` / `providers/deepseekOcr.ts` — self-hosted OCR services (image in, text out).
- `validate/label.ts` — deterministic sanity checks on a structured label report (kJ-as-kcal,
  per-serving-as-per-100g, decimal slips, sodium/salt mismatch, energy-vs-macros, negatives/NaN).
  Wired into the label flow as `report.validation`; never blocks a scan.

## Switching a task to a different provider, in 3 steps

1. **Get a key/URL** for the provider you want (see `.env.example` for the exact var names —
   `GEMINI_API_KEY`, `DASHSCOPE_API_KEY` + `DASHSCOPE_BASE_URL`, `OPENAI_API_KEY`, `PADDLEOCR_URL`, …)
   and add it to `.env.local`.
2. **Point the task at it**: set `AI_ROUTE_<TASK>="provider:model-id"` in `.env.local`, e.g.
   ```
   AI_ROUTE_LABEL_OCR=paddleocr:default
   AI_ROUTE_MEAL_TEXT_PARSE=gemini:gemini-2.0-flash
   ```
   `<TASK>` is the task id upper-cased (see `tasks.ts` for the full list). Verify the model id against
   the provider's current docs — none are hardcoded here as defaults.
3. **Restart the app.** If the provider or key turns out to be missing, or the call throws or fails
   validation, the router logs `{"evt":"llm_fallback",task,from,reason}` and runs the Claude default
   for that call instead — nothing crashes.

Two tasks (`scan_classify`, `label_analysis`) always run on Claude regardless of `AI_ROUTE_*`, because
they use Anthropic-only features (the classifier's fused `scan_kind`/`plate_estimate` tool choice, and
`label_analysis`'s `web_search` server tool).

## Usage logs

Every call — whichever provider handled it, including a Claude fallback — emits one line:
```json
{"evt":"llm_usage","task":"meal_vision","provider":"anthropic","model":"claude-sonnet-5","in":1423,"out":612,"ms":2140,"fallback":false}
```
Sum `in`/`out` by `task` or `provider` in Railway's log search to see where cost is going.

import { CONFIG, isConfigured, routeFor } from "./config";
import * as anthropic from "./providers/anthropic";
import * as deepseekocr from "./providers/deepseekOcr";
import * as gemini from "./providers/gemini";
import * as openaiCompat from "./providers/openaiCompat";
import * as paddleocr from "./providers/paddleocr";
import { TASKS } from "./tasks";
import type { AnthropicNativeRequest, JsonRequest, LlmResult, ProviderId, RawUsage, TaskId, TaskRequest, TextRequest } from "./types";

/**
 * The model router (v2.7). Every AI call in the scan flows, parse-meal and describe-exercise goes
 * through `run`, which:
 *   1. resolves the route — `AI_ROUTE_<TASK>` env, else the task's Claude default (so with no new env
 *      vars, every task resolves to Claude and behaviour is unchanged);
 *   2. calls that provider's adapter (or, for the two Anthropic-only tasks, the caller's own
 *      `build(client)` callback — see `AnthropicNativeRequest`);
 *   3. validates structured output with the caller's guard;
 *   4. falls back to the Claude default — logging `{"evt":"llm_fallback",task,from,reason}` — when the
 *      route's provider isn't configured, the call throws, or validation fails;
 *   5. logs one `{"evt":"llm_usage",task,provider,model,in,out,cache_read,ms,fallback}` line per call.
 * See src/lib/ai/README.md for how to point a task at a different provider.
 */

function logFallback(task: TaskId, from: ProviderId, reason: string) {
  try {
    console.log(JSON.stringify({ evt: "llm_fallback", task, from, reason }));
  } catch {
    // never block a call on a logging failure
  }
}

function logUsage(task: TaskId, provider: ProviderId, model: string, usage: RawUsage, ms: number, fallback: boolean) {
  try {
    console.log(JSON.stringify({ evt: "llm_usage", task, provider, model, in: usage.in, out: usage.out, ...(usage.cache_read ? { cache_read: usage.cache_read } : {}), ms, fallback }));
  } catch {
    // never block a call on a logging failure
  }
}

async function callProvider(provider: ProviderId, model: string, req: TextRequest | JsonRequest): Promise<{ data: unknown; usage: RawUsage }> {
  if (req.kind === "text") {
    const opts = { model, system: req.system, images: req.images, text: req.text, maxTokens: req.maxTokens };
    const toData = (r: { text: string; usage: RawUsage }) => ({ data: r.text, usage: r.usage });
    switch (provider) {
      case "anthropic":
        return toData(await anthropic.completeText(opts));
      case "gemini":
        return toData(await gemini.completeText(opts));
      case "qwen":
        return toData(await openaiCompat.completeText({ ...opts, baseUrl: need(CONFIG.qwen.baseUrl, "DASHSCOPE_BASE_URL/OPENROUTER_API_KEY"), apiKey: CONFIG.qwen.apiKey }));
      case "openai":
        return toData(await openaiCompat.completeText({ ...opts, baseUrl: CONFIG.openai.baseUrl, apiKey: CONFIG.openai.apiKey }));
      case "local":
        return toData(await openaiCompat.completeText({ ...opts, baseUrl: need(CONFIG.local.baseUrl, "LOCAL_OPENAI_URL"), apiKey: CONFIG.local.apiKey }));
      case "paddleocr":
        return toData(await paddleocr.completeText({ url: need(CONFIG.paddleocr.url, "PADDLEOCR_URL"), token: CONFIG.paddleocr.token, images: req.images }));
      case "deepseekocr":
        return toData(await deepseekocr.completeText({ url: need(CONFIG.deepseekocr.url, "DEEPSEEK_OCR_URL"), token: CONFIG.deepseekocr.token, images: req.images }));
    }
  }
  // json
  const opts = { model, system: req.system, images: req.images, text: req.text, maxTokens: req.maxTokens, schema: req.schema, schemaName: req.schemaName };
  switch (provider) {
    case "anthropic":
      return anthropic.completeJson(opts);
    case "gemini":
      return gemini.completeJson(opts);
    case "qwen":
      return openaiCompat.completeJson({ ...opts, baseUrl: need(CONFIG.qwen.baseUrl, "DASHSCOPE_BASE_URL/OPENROUTER_API_KEY"), apiKey: CONFIG.qwen.apiKey });
    case "openai":
      return openaiCompat.completeJson({ ...opts, baseUrl: CONFIG.openai.baseUrl, apiKey: CONFIG.openai.apiKey });
    case "local":
      return openaiCompat.completeJson({ ...opts, baseUrl: need(CONFIG.local.baseUrl, "LOCAL_OPENAI_URL"), apiKey: CONFIG.local.apiKey });
    case "paddleocr":
    case "deepseekocr":
      throw new Error(`${provider} is a text/OCR-only provider — it has no structured-JSON mode`);
  }
}

function need(v: string | undefined, name: string): string {
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** Anthropic-only tasks (see tasks.ts) always resolve to Anthropic; `AI_ROUTE_*` is ignored for them. */
export async function run<T = unknown>(task: TaskId, req: AnthropicNativeRequest): Promise<LlmResult<T>>;
export async function run<T>(task: TaskId, req: TextRequest | JsonRequest, guard?: (v: unknown) => v is T): Promise<LlmResult<T>>;
export async function run<T>(task: TaskId, req: TaskRequest, guard?: (v: unknown) => v is T): Promise<LlmResult<T>> {
  const def = TASKS[task];
  const start = Date.now();

  if (req.kind === "anthropic_native") {
    const msg = await req.build(anthropic.anthropicClient());
    const usage = anthropic.usageOf(msg);
    const ms = Date.now() - start;
    logUsage(task, "anthropic", msg.model, usage, ms, false);
    return { data: msg as unknown as T, usage, provider: "anthropic", model: msg.model, ms, fallback: false };
  }

  const route = def.anthropicOnly ? null : routeFor(task);
  let provider: ProviderId = route?.provider ?? def.defaultProvider;
  let model = (route?.model || def.defaultModel) as string;
  let fallback = false;

  if (provider !== "anthropic" && !isConfigured(provider)) {
    logFallback(task, provider, "not_configured");
    provider = "anthropic";
    model = def.defaultModel;
    fallback = true;
  }

  let data: unknown;
  let usage: RawUsage;
  try {
    ({ data, usage } = await callProvider(provider, model, req));
    if (guard && !guard(data)) throw new Error(`${task}: response failed validation`);
  } catch (e) {
    if (provider === "anthropic") throw e; // already the fallback provider — nothing left to fall back to
    logFallback(task, provider, e instanceof Error ? e.message.slice(0, 200) : "unknown error");
    provider = "anthropic";
    model = def.defaultModel;
    fallback = true;
    ({ data, usage } = await callProvider(provider, model, req));
    if (guard && !guard(data)) throw new Error(`${task}: Claude fallback also failed validation`);
  }

  const ms = Date.now() - start;
  logUsage(task, provider, model, usage, ms, fallback);
  return { data: data as T, usage, provider, model, ms, fallback };
}

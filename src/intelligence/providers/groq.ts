import type {
  Provider,
  ProviderCapabilities,
  ProviderConfig
} from "../provider-sdk/provider";
import type { ProviderError } from "../provider-sdk/error";
import type { ProviderRequest } from "../provider-sdk/request";
import type { ProviderResponse, ProviderUsage } from "../provider-sdk/response";
import type { ProviderStreamEvent } from "../provider-sdk/stream";
import { sendProviderRequest } from "../provider-runtime/transport";
import { readGroqEvents } from "./groqSse";

const invalidConfig: ProviderError = {
  code: "GROQ_INVALID_CONFIG",
  message: "Groq configuration is invalid",
  category: "validation"
};
const missingAuth: ProviderError = {
  code: "GROQ_AUTH_REQUIRED",
  message: "Groq authentication is required",
  category: "authentication"
};
const invalidRequest: ProviderError = {
  code: "GROQ_INVALID_REQUEST",
  message: "Groq request is invalid",
  category: "validation"
};
const invalidResponse: ProviderError = {
  code: "GROQ_INVALID_RESPONSE",
  message: "Groq returned an invalid response",
  category: "validation"
};
const generationFailed: ProviderError = {
  code: "GROQ_GENERATION_FAILED",
  message: "Groq response could not be completed",
  category: "api_error"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

function normalizeUsage(value: unknown): ProviderUsage | undefined {
  if (!isRecord(value)) return;
  if (
    !validCount(value.prompt_tokens) ||
    !validCount(value.completion_tokens) ||
    !validCount(value.total_tokens)
  )
    return;
  return {
    promptTokens: value.prompt_tokens,
    completionTokens: value.completion_tokens,
    totalTokens: value.total_tokens
  };
}

function normalizeResponse(value: unknown): ProviderResponse {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return { success: false, error: invalidResponse };
  }
  const choice: unknown = value.choices[0];
  if (
    !isRecord(choice) ||
    !isRecord(choice.message) ||
    choice.message.role !== "assistant" ||
    typeof choice.message.content !== "string"
  ) {
    return { success: false, error: invalidResponse };
  }
  if (choice.finish_reason !== "stop") {
    return {
      success: false,
      error:
        typeof choice.finish_reason === "string"
          ? generationFailed
          : invalidResponse
    };
  }
  const usage = normalizeUsage(value.usage);
  return {
    success: true,
    role: "assistant",
    content: choice.message.content,
    ...(usage ? { usage } : {})
  };
}

function prepareRequest(
  config: ProviderConfig,
  request: ProviderRequest,
  stream: boolean
):
  | { success: true; url: string; credential: string; body: string }
  | { success: false; error: ProviderError } {
  if (
    !isRecord(config) ||
    (config.auth !== undefined && !isRecord(config.auth)) ||
    (config.auth?.apiKey !== undefined &&
      typeof config.auth.apiKey !== "string") ||
    (config.auth?.token !== undefined &&
      typeof config.auth.token !== "string") ||
    (config.baseUrl !== undefined && typeof config.baseUrl !== "string")
  )
    return { success: false, error: invalidConfig };
  const key = config.auth?.apiKey?.trim();
  const token = config.auth?.token?.trim();
  if (config.auth?.apiKey !== undefined && config.auth?.token !== undefined)
    return { success: false, error: invalidConfig };
  const credential = key || token;
  if (!credential) return { success: false, error: missingAuth };
  if (/[\r\n]/.test(credential))
    return { success: false, error: invalidConfig };

  let url: string;
  try {
    const base = new URL(config.baseUrl ?? "https://api.groq.com/openai/v1/");
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.href.includes("?") ||
      base.href.includes("#")
    )
      return { success: false, error: invalidConfig };
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    url = new URL("chat/completions", base).toString();
  } catch {
    return { success: false, error: invalidConfig };
  }

  if (
    typeof request?.model !== "string" ||
    !request.model.trim() ||
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    !request.messages.every(
      (message) =>
        isRecord(message) &&
        ["system", "user", "assistant"].includes(message.role as string) &&
        typeof message.content === "string" &&
        !!message.content.trim()
    )
  )
    return { success: false, error: invalidRequest };

  const options = request.options;
  if (options !== undefined && !isRecord(options)) {
    return { success: false, error: invalidRequest };
  }
  if (
    (options?.maxTokens !== undefined &&
      (typeof options.maxTokens !== "number" ||
        !Number.isSafeInteger(options.maxTokens) ||
        options.maxTokens <= 0)) ||
    (options?.temperature !== undefined &&
      (typeof options.temperature !== "number" ||
        !Number.isFinite(options.temperature) ||
        options.temperature < 0 ||
        options.temperature > 2)) ||
    (options?.topP !== undefined &&
      (typeof options.topP !== "number" ||
        !Number.isFinite(options.topP) ||
        options.topP < 0 ||
        options.topP > 1))
  )
    return { success: false, error: invalidRequest };

  const body = JSON.stringify({
    model: request.model,
    messages: request.messages.map(({ role, content }) => ({ role, content })),
    ...(stream ? { stream: true } : {}),
    ...(options?.maxTokens !== undefined
      ? { max_completion_tokens: options.maxTokens }
      : {}),
    ...(options?.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options?.topP !== undefined ? { top_p: options.topP } : {})
  });
  return { success: true, url, credential, body };
}

// Model-specific capabilities are supplied by the caller.
export function createGroqProvider(
  config: ProviderConfig,
  capabilities: ProviderCapabilities,
  fetcher: typeof fetch = globalThis.fetch
): Provider {
  const send = (request: ProviderRequest, stream: boolean) => {
    const prepared = prepareRequest(config, request, stream);
    if (!prepared.success) return prepared;
    return sendProviderRequest(
      {
        url: prepared.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${prepared.credential}`,
          "Content-Type": "application/json"
        },
        body: prepared.body,
        timeoutMs: config.timeoutMs
      },
      fetcher
    );
  };

  return {
    id: "groq",
    name: "Groq",
    config,
    capabilities,
    async generateCompletion(request): Promise<ProviderResponse> {
      try {
        const exchange = await send(request, false);
        if (!exchange.success) return { success: false, error: exchange.error };
        const json = await exchange.readJson();
        if (!json.success) return { success: false, error: json.error };
        return normalizeResponse(json.value);
      } catch {
        return { success: false, error: generationFailed };
      }
    },
    async *streamCompletion(request): AsyncIterable<ProviderStreamEvent> {
      try {
        const exchange = await send(request, true);
        if (!exchange.success) {
          yield { type: "failure", error: exchange.error };
          return;
        }
        let content = "";
        let stopped = false;
        for await (const item of readGroqEvents(exchange)) {
          if (!item.success) {
            yield { type: "failure", error: item.error };
            return;
          }
          if (item.done) {
            if (!stopped) {
              yield { type: "failure", error: invalidResponse };
              return;
            }
            yield {
              type: "complete",
              response: { success: true, role: "assistant", content }
            };
            return;
          }
          const value = item.value;
          if (!isRecord(value) || !Array.isArray(value.choices)) {
            yield { type: "failure", error: invalidResponse };
            return;
          }
          const choice: unknown = value.choices[0];
          if (!isRecord(choice) || !isRecord(choice.delta)) {
            yield { type: "failure", error: invalidResponse };
            return;
          }
          if (
            (choice.delta.role !== undefined &&
              choice.delta.role !== "assistant") ||
            (choice.delta.content !== undefined &&
              typeof choice.delta.content !== "string")
          ) {
            yield { type: "failure", error: invalidResponse };
            return;
          }
          if (
            choice.finish_reason !== undefined &&
            choice.finish_reason !== null
          ) {
            if (typeof choice.finish_reason !== "string") {
              yield { type: "failure", error: invalidResponse };
              return;
            }
            if (choice.finish_reason !== "stop" || stopped) {
              yield { type: "failure", error: generationFailed };
              return;
            }
            stopped = true;
          }
          const delta = choice.delta.content;
          if (stopped && delta !== undefined && delta !== "") {
            // A terminal chunk may itself carry its last visible delta.
            if (choice.finish_reason !== "stop") {
              yield { type: "failure", error: invalidResponse };
              return;
            }
          }
          if (delta !== undefined && delta !== "") {
            content += delta;
            yield { type: "content", delta };
          }
        }
        yield { type: "failure", error: invalidResponse };
      } catch {
        yield { type: "failure", error: generationFailed };
      }
    }
  };
}

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
import { readOpenAiEvents } from "./openaiSse";

const invalidRequest: ProviderError = {
  code: "OPENAI_INVALID_REQUEST",
  message: "OpenAI request is invalid",
  category: "validation"
};
const invalidConfig: ProviderError = {
  code: "OPENAI_INVALID_CONFIG",
  message: "OpenAI configuration is invalid",
  category: "validation"
};
const missingAuth: ProviderError = {
  code: "OPENAI_AUTH_REQUIRED",
  message: "OpenAI authentication is required",
  category: "authentication"
};
const invalidResponse: ProviderError = {
  code: "OPENAI_INVALID_RESPONSE",
  message: "OpenAI returned an invalid response",
  category: "validation"
};
const responseFailed: ProviderError = {
  code: "OPENAI_RESPONSE_FAILED",
  message: "OpenAI response could not be completed",
  category: "api_error"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

function normalizeUsage(value: unknown): ProviderUsage | undefined {
  if (!isRecord(value)) return;
  if (
    !validCount(value.input_tokens) ||
    !validCount(value.output_tokens) ||
    !validCount(value.total_tokens)
  )
    return;
  return {
    promptTokens: value.input_tokens,
    completionTokens: value.output_tokens,
    totalTokens: value.total_tokens
  };
}

function normalizeResponse(value: unknown): ProviderResponse {
  if (!isRecord(value)) return { success: false, error: invalidResponse };
  if (value.status === "failed" || value.status === "incomplete") {
    return { success: false, error: responseFailed };
  }
  if (value.status !== "completed" || !Array.isArray(value.output)) {
    return { success: false, error: invalidResponse };
  }

  let content = "";
  for (const item of value.output) {
    if (!isRecord(item)) return { success: false, error: invalidResponse };
    if (item.type !== "message") continue;
    if (item.role !== "assistant" || !Array.isArray(item.content)) {
      return { success: false, error: invalidResponse };
    }
    for (const part of item.content) {
      if (!isRecord(part)) return { success: false, error: invalidResponse };
      if (part.type !== "output_text") continue;
      if (typeof part.text !== "string") {
        return { success: false, error: invalidResponse };
      }
      content += part.text;
    }
  }
  const usage = normalizeUsage(value.usage);
  return {
    success: true,
    role: "assistant",
    content,
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
  if (key && token) return { success: false, error: invalidConfig };
  const credential = key || token;
  if (!credential) return { success: false, error: missingAuth };
  if (/[\r\n]/.test(credential))
    return { success: false, error: invalidConfig };

  let url: string;
  try {
    const base = new URL(config.baseUrl ?? "https://api.openai.com/v1/");
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      return { success: false, error: invalidConfig };
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    url = new URL("responses", base).toString();
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
    input: request.messages.map(({ role, content }) => ({ role, content })),
    store: false,
    ...(stream ? { stream: true } : {}),
    ...(options?.maxTokens !== undefined
      ? { max_output_tokens: options.maxTokens }
      : {}),
    ...(options?.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options?.topP !== undefined ? { top_p: options.topP } : {})
  });
  return { success: true, url, credential, body };
}

// Capability values are model-specific, so the caller supplies verified metadata.
export function createOpenAiProvider(
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
    id: "openai",
    name: "OpenAI",
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
        return { success: false, error: responseFailed };
      }
    },
    async *streamCompletion(request): AsyncIterable<ProviderStreamEvent> {
      try {
        const exchange = await send(request, true);
        if (!exchange.success) {
          yield { type: "failure", error: exchange.error };
          return;
        }
        for await (const event of readOpenAiEvents(exchange)) {
          if (!event.success) {
            yield { type: "failure", error: event.error };
            return;
          }
          const value = event.value;
          if (!isRecord(value)) {
            yield { type: "failure", error: invalidResponse };
            return;
          }
          if (value.type === "response.output_text.delta") {
            if (typeof value.delta !== "string") {
              yield { type: "failure", error: invalidResponse };
              return;
            }
            if (value.delta !== "")
              yield { type: "content", delta: value.delta };
          } else if (value.type === "response.completed") {
            const response = normalizeResponse(value.response);
            if (response.success) yield { type: "complete", response };
            else yield { type: "failure", error: response.error };
            return;
          } else if (
            value.type === "response.failed" ||
            value.type === "response.incomplete" ||
            value.type === "error"
          ) {
            yield { type: "failure", error: responseFailed };
            return;
          }
          // Other semantic lifecycle and non-text events are not visible content.
        }
        yield { type: "failure", error: invalidResponse };
      } catch {
        yield { type: "failure", error: responseFailed };
      }
    }
  };
}

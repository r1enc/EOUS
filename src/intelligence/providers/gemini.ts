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
import { readGeminiChunks } from "./geminiSse";

const invalidConfig: ProviderError = {
  code: "GEMINI_INVALID_CONFIG",
  message: "Gemini configuration is invalid",
  category: "validation"
};
const missingAuth: ProviderError = {
  code: "GEMINI_AUTH_REQUIRED",
  message: "Gemini authentication is required",
  category: "authentication"
};
const invalidRequest: ProviderError = {
  code: "GEMINI_INVALID_REQUEST",
  message: "Gemini request is invalid",
  category: "validation"
};
const invalidResponse: ProviderError = {
  code: "GEMINI_INVALID_RESPONSE",
  message: "Gemini returned an invalid response",
  category: "validation"
};
const generationFailed: ProviderError = {
  code: "GEMINI_GENERATION_FAILED",
  message: "Gemini response could not be completed",
  category: "api_error"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

function normalizeUsage(value: unknown): ProviderUsage | undefined {
  if (!isRecord(value)) return;
  if (
    !validCount(value.promptTokenCount) ||
    !validCount(value.candidatesTokenCount) ||
    !validCount(value.totalTokenCount)
  )
    return;
  return {
    promptTokens: value.promptTokenCount,
    completionTokens: value.candidatesTokenCount,
    totalTokens: value.totalTokenCount
  };
}

type ParsedChunk =
  | {
      success: true;
      text: string;
      finishReason?: string;
      usage?: ProviderUsage;
    }
  | { success: false; error: ProviderError };

function parseChunk(value: unknown, requireCandidate: boolean): ParsedChunk {
  if (!isRecord(value)) return { success: false, error: invalidResponse };
  const usage = normalizeUsage(value.usageMetadata);
  if (value.candidates === undefined) {
    if (isRecord(value.promptFeedback) || requireCandidate) {
      return { success: false, error: generationFailed };
    }
    if (value.usageMetadata !== undefined)
      return { success: true, text: "", usage };
    return { success: false, error: invalidResponse };
  }
  if (!Array.isArray(value.candidates)) {
    return { success: false, error: invalidResponse };
  }
  if (value.candidates.length === 0) {
    return { success: false, error: generationFailed };
  }
  const candidate: unknown = value.candidates[0];
  if (!isRecord(candidate)) return { success: false, error: invalidResponse };
  const finish = candidate.finishReason;
  if (finish !== undefined && typeof finish !== "string") {
    return { success: false, error: invalidResponse };
  }
  if (finish !== undefined && finish !== "STOP") {
    return { success: false, error: generationFailed };
  }
  let text = "";
  if (candidate.content !== undefined) {
    if (
      !isRecord(candidate.content) ||
      (candidate.content.role !== undefined &&
        candidate.content.role !== "model") ||
      !Array.isArray(candidate.content.parts)
    ) {
      return { success: false, error: invalidResponse };
    }
    for (const part of candidate.content.parts) {
      if (!isRecord(part)) return { success: false, error: invalidResponse };
      if (part.thought === true) continue;
      if (part.text !== undefined) {
        if (typeof part.text !== "string") {
          return { success: false, error: invalidResponse };
        }
        text += part.text;
      }
    }
  }
  return { success: true, text, finishReason: finish, usage };
}

function normalizeResponse(value: unknown): ProviderResponse {
  const chunk = parseChunk(value, true);
  if (!chunk.success) return { success: false, error: chunk.error };
  if (chunk.finishReason !== "STOP") {
    return { success: false, error: invalidResponse };
  }
  return {
    success: true,
    role: "assistant",
    content: chunk.text,
    ...(chunk.usage ? { usage: chunk.usage } : {})
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

  if (
    typeof request?.model !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.model) ||
    !Array.isArray(request.messages) ||
    request.messages.length === 0
  )
    return { success: false, error: invalidRequest };

  let systemEnded = false;
  const systemParts: { text: string }[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const message of request.messages) {
    if (
      !isRecord(message) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      !["system", "user", "assistant"].includes(message.role as string)
    )
      return { success: false, error: invalidRequest };
    if (message.role === "system") {
      if (systemEnded) return { success: false, error: invalidRequest };
      systemParts.push({ text: message.content });
    } else {
      systemEnded = true;
      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      });
    }
  }
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    return { success: false, error: invalidRequest };
  }

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

  let url: string;
  try {
    const base = new URL(
      config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/"
    );
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      return { success: false, error: invalidConfig };
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const endpoint = new URL(
      `models/${encodeURIComponent(request.model)}:${stream ? "streamGenerateContent" : "generateContent"}`,
      base
    );
    if (stream) endpoint.searchParams.set("alt", "sse");
    url = endpoint.toString();
  } catch {
    return { success: false, error: invalidConfig };
  }

  const generationConfig = {
    ...(options?.maxTokens !== undefined
      ? { maxOutputTokens: options.maxTokens }
      : {}),
    ...(options?.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options?.topP !== undefined ? { topP: options.topP } : {})
  };
  const body = JSON.stringify({
    contents,
    ...(systemParts.length
      ? { systemInstruction: { parts: systemParts } }
      : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {})
  });
  return { success: true, url, credential, body };
}

// Model-specific capability values are supplied by the composition root.
export function createGeminiProvider(
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
          "x-goog-api-key": prepared.credential,
          "Content-Type": "application/json"
        },
        body: prepared.body,
        timeoutMs: config.timeoutMs
      },
      fetcher
    );
  };

  return {
    id: "gemini",
    name: "Gemini",
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
        let usage: ProviderUsage | undefined;
        let stopped = false;
        for await (const item of readGeminiChunks(exchange)) {
          if (!item.success) {
            yield { type: "failure", error: item.error };
            return;
          }
          const chunk = parseChunk(item.value, false);
          if (!chunk.success) {
            yield { type: "failure", error: chunk.error };
            return;
          }
          if (stopped && chunk.text !== "") {
            yield { type: "failure", error: invalidResponse };
            return;
          }
          if (chunk.text !== "") {
            content += chunk.text;
            yield { type: "content", delta: chunk.text };
          }
          if (chunk.usage) usage = chunk.usage;
          if (chunk.finishReason === "STOP") stopped = true;
        }
        if (!stopped) {
          yield { type: "failure", error: invalidResponse };
          return;
        }
        yield {
          type: "complete",
          response: {
            success: true,
            role: "assistant",
            content,
            ...(usage ? { usage } : {})
          }
        };
      } catch {
        yield { type: "failure", error: generationFailed };
      }
    }
  };
}

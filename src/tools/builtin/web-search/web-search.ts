import type { BuiltInTool, BuiltInToolManifest } from "../builtin-tool";
import type { SdkRequest } from "../../../execution/tool-sdk/request";
import type { SdkResponse } from "../../../execution/tool-sdk/response";

export interface WebSearchInput {
  query: string;
  [key: string]: unknown;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutput {
  results: WebSearchResultItem[];
  [key: string]: unknown;
}

export interface WebSearchBackend {
  search(query: string): Promise<unknown>;
}

export type WebSearchBackendErrorCode =
  | "not_configured"
  | "credential_unavailable"
  | "transport_failed"
  | "invalid_response";

export class WebSearchBackendError extends Error {
  constructor(readonly code: WebSearchBackendErrorCode) {
    super("Web search is unavailable");
  }
}

const MAX_RESULTS = 5;
const MAX_TITLE = 200;
const MAX_SNIPPET = 500;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateWebSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const query = value.trim();
  if (!query || Array.from(query).length > 400 || /\p{Cc}/u.test(query))
    return null;
  return query;
}

function plainText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<[^>]*>/gu, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return text ? Array.from(text).slice(0, limit).join("") : null;
}

function validUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    value !== value.trim() ||
    /\p{Cc}/u.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeWebSearchResponse(
  value: unknown
): WebSearchOutput | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const results: WebSearchResultItem[] = [];
  for (const item of value.results) {
    if (!isRecord(item)) continue;
    const title = plainText(item.title, MAX_TITLE);
    const url = validUrl(item.url);
    const snippet = plainText(item.content, MAX_SNIPPET);
    if (!title || !url || !snippet) continue;
    results.push({ title, url, snippet });
    if (results.length === MAX_RESULTS) break;
  }
  return { results };
}

export class WebSearchTool implements BuiltInTool<
  WebSearchInput,
  WebSearchOutput
> {
  constructor(private readonly backend?: WebSearchBackend) {}

  readonly manifest: BuiltInToolManifest = {
    id: "web-search",
    name: "Web Search Tool",
    description: "Searches the web for information matching a query",
    sdkVersion: "1.0.0",
    toolVersion: "1.0.0",
    category: "search",
    isBuiltIn: true,
    capabilities: ["web-searching"],
    requiredPermissions: ["network"],
    input: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query, e.g. 'latest AI news'"
        }
      },
      required: ["query"]
    },
    output: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              snippet: { type: "string" }
            }
          },
          description: "List of search results"
        }
      }
    },
    dependencies: []
  };

  async execute(
    request: SdkRequest<WebSearchInput>
  ): Promise<SdkResponse<WebSearchOutput>> {
    const query = validateWebSearchQuery(request.input.query);
    if (query === null) {
      return {
        success: false,
        error: {
          code: "invalid_input",
          message:
            "Query must be 1 to 400 characters without control characters",
          category: "validation"
        }
      };
    }

    if (!this.backend)
      return {
        success: false,
        error: {
          code: "search_unavailable",
          message: "Web search is unavailable",
          category: "execution"
        }
      };

    try {
      const output = normalizeWebSearchResponse(
        await this.backend.search(query)
      );
      if (!output) throw new WebSearchBackendError("invalid_response");
      return { success: true, output };
    } catch (error) {
      const code =
        error instanceof WebSearchBackendError
          ? error.code
          : "transport_failed";
      const message =
        code === "not_configured"
          ? "Web search needs a Tavily API key"
          : code === "credential_unavailable"
            ? "Web search credential storage is unavailable"
            : code === "invalid_response"
              ? "Web search returned an invalid response"
              : "Web search failed";
      return {
        success: false,
        error: {
          code:
            code === "not_configured"
              ? "search_not_configured"
              : "search_failed",
          message,
          category: "execution"
        }
      };
    }
  }
}

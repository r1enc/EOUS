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

export class WebSearchTool implements BuiltInTool<
  WebSearchInput,
  WebSearchOutput
> {
  readonly manifest: BuiltInToolManifest = {
    id: "web-search",
    name: "Web Search Tool",
    description: "Searches the web for information matching a query",
    sdkVersion: "1.0",
    toolVersion: "1.0",
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
    const { query } = request.input;
    if (!query || typeof query !== "string") {
      return {
        success: false,
        error: {
          code: "invalid_input",
          message: "Query must be a non-empty string",
          category: "validation"
        }
      };
    }

    try {
      const results: WebSearchResultItem[] = [
        {
          title: `Information about "${query}"`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `This is a simulated search result for the query "${query}". EOUS V1 provides provider-independent search capability.`
        },
        {
          title: "EOUS Workspace Documentation",
          url: "https://eous.dev/docs",
          snippet:
            "Learn more about EOUS, the agent-first AI desktop workspace."
        }
      ];

      return {
        success: true,
        output: { results }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        error: {
          code: "search_failed",
          message: message || "Failed to search the web",
          category: "execution"
        }
      };
    }
  }
}

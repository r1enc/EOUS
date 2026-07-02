import type { BuiltInTool } from "./builtin-tool";
import { CalculatorTool } from "./calculator/calculator";
import { TxtReaderTool } from "./text-reader/text-reader";
import { PdfReaderTool } from "./pdf-reader/pdf-reader";
import { WebSearchTool } from "./web-search/web-search";

export type { BuiltInToolCategory } from "./category";
export type { BuiltInToolMetadata } from "./metadata";
export type { BuiltInTool, BuiltInToolManifest } from "./builtin-tool";

export { CalculatorTool } from "./calculator/calculator";
export type {
  CalculatorInput,
  CalculatorOutput
} from "./calculator/calculator";

export { TxtReaderTool } from "./text-reader/text-reader";
export type {
  TxtReaderInput,
  TxtReaderOutput
} from "./text-reader/text-reader";

export { PdfReaderTool } from "./pdf-reader/pdf-reader";
export type { PdfReaderInput, PdfReaderOutput } from "./pdf-reader/pdf-reader";

export { WebSearchTool } from "./web-search/web-search";
export type {
  WebSearchInput,
  WebSearchOutput,
  WebSearchResultItem
} from "./web-search/web-search";

export const BUILTIN_TOOLS: BuiltInTool[] = [
  new CalculatorTool(),
  new TxtReaderTool(),
  new PdfReaderTool(),
  new WebSearchTool()
];

export function validateBuiltInTools(tools: BuiltInTool[]): void {
  const seenIds = new Set<string>();
  for (const tool of tools) {
    const manifest = tool.manifest;
    if (
      !manifest.id ||
      typeof manifest.id !== "string" ||
      manifest.id.trim() === ""
    ) {
      throw new Error(
        "Invalid tool registration: tool ID must be a non-empty string"
      );
    }
    if (
      !manifest.name ||
      typeof manifest.name !== "string" ||
      manifest.name.trim() === ""
    ) {
      throw new Error(
        `Invalid tool registration for ID '${manifest.id}': name must be a non-empty string`
      );
    }
    if (!manifest.category || typeof manifest.category !== "string") {
      throw new Error(
        `Invalid tool registration for ID '${manifest.id}': category must be defined`
      );
    }
    if (seenIds.has(manifest.id)) {
      throw new Error(
        `Duplicate tool registration detected for ID: ${manifest.id}`
      );
    }
    seenIds.add(manifest.id);
  }
}

// Run declarative self-validation upon module load
validateBuiltInTools(BUILTIN_TOOLS);

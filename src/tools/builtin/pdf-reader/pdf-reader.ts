import type { BuiltInTool, BuiltInToolManifest } from "../builtin-tool";
import type { SdkRequest } from "../../../execution/tool-sdk/request";
import type { SdkResponse } from "../../../execution/tool-sdk/response";

export interface PdfReaderInput {
  filePath: string;
  [key: string]: unknown;
}

export interface PdfReaderOutput {
  content: string;
  pagesCount: number;
  metadata: Record<string, string>;
  [key: string]: unknown;
}

export class PdfReaderTool implements BuiltInTool<
  PdfReaderInput,
  PdfReaderOutput
> {
  readonly manifest: BuiltInToolManifest = {
    id: "pdf-reader",
    name: "PDF Reader Tool",
    description: "Reads and extracts plain text from PDF documents",
    sdkVersion: "1.0.0",
    toolVersion: "1.0.0",
    category: "document",
    isBuiltIn: true,
    capabilities: ["pdf-reading"],
    requiredPermissions: ["read_file"],
    input: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "The absolute or relative path to the PDF document"
        }
      },
      required: ["filePath"]
    },
    output: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The extracted plain text content of the PDF"
        },
        pagesCount: {
          type: "number",
          description: "The total number of pages in the PDF document"
        },
        metadata: {
          type: "object",
          description: "Extracted metadata from the PDF document"
        }
      }
    },
    dependencies: []
  };

  async execute(
    request: SdkRequest<PdfReaderInput>
  ): Promise<SdkResponse<PdfReaderOutput>> {
    const { filePath } = request.input;
    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: {
          code: "invalid_input",
          message: "File path must be a non-empty string",
          category: "validation"
        }
      };
    }

    if (!filePath.toLowerCase().endsWith(".pdf")) {
      return {
        success: false,
        error: {
          code: "invalid_file_type",
          message: "Only PDF documents (.pdf) are supported",
          category: "validation"
        }
      };
    }

    try {
      const filename = filePath.split(/[/\\]/).pop() || filePath;
      const content = `[Simulated PDF Content for ${filename}]\nThis is a simulated plain text representation of the PDF file at path: ${filePath}.\nMetadata values: Author: EOUS System, Title: V1 Document.`;

      return {
        success: true,
        output: {
          content,
          pagesCount: 1,
          metadata: {
            title: filename,
            creator: "EOUS PDF Tool",
            producer: "Tauri Webview Sandbox"
          }
        }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        error: {
          code: "read_failed",
          message: message || "Failed to read PDF document",
          category: "execution"
        }
      };
    }
  }
}

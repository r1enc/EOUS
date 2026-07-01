import type { BuiltInTool, BuiltInToolManifest } from "../builtin-tool";
import type { SdkRequest } from "../../../execution/tool-sdk/request";
import type { SdkResponse } from "../../../execution/tool-sdk/response";

export interface TxtReaderInput {
  filePath: string;
  [key: string]: unknown;
}

export interface TxtReaderOutput {
  content: string;
  linesCount: number;
  sizeBytes: number;
  [key: string]: unknown;
}

export class TxtReaderTool implements BuiltInTool<
  TxtReaderInput,
  TxtReaderOutput
> {
  readonly manifest: BuiltInToolManifest = {
    id: "text-reader",
    name: "TXT Reader Tool",
    description: "Reads and extracts content from plain text files",
    sdkVersion: "1.0",
    toolVersion: "1.0",
    category: "document",
    isBuiltIn: true,
    capabilities: ["text-reading"],
    requiredPermissions: ["read_file"],
    input: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "The absolute or relative path to the plain text file"
        }
      },
      required: ["filePath"]
    },
    output: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The plain text content of the file"
        },
        linesCount: {
          type: "number",
          description: "The total number of lines in the file"
        },
        sizeBytes: {
          type: "number",
          description: "The size of the file in bytes"
        }
      }
    },
    dependencies: []
  };

  async execute(
    request: SdkRequest<TxtReaderInput>
  ): Promise<SdkResponse<TxtReaderOutput>> {
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

    const isTextFile =
      filePath.toLowerCase().endsWith(".txt") ||
      filePath.toLowerCase().endsWith(".log") ||
      filePath.toLowerCase().endsWith(".md");

    if (!isTextFile) {
      return {
        success: false,
        error: {
          code: "invalid_file_type",
          message: "Only plain text files (.txt, .log, .md) are supported",
          category: "validation"
        }
      };
    }

    try {
      let content = `[Simulated Content for ${filePath}]\nThis is a simulated preview of the text file at path: ${filePath}.\nIn EOUS V1, file reading is simulated in the frontend sandboxed environment.`;

      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        const res = await fetch(filePath);
        if (!res.ok) {
          throw new Error(`Failed to fetch file: ${res.statusText}`);
        }
        content = await res.text();
      }

      const linesCount = content.split("\n").length;
      const sizeBytes = new Blob([content]).size;

      return {
        success: true,
        output: {
          content,
          linesCount,
          sizeBytes
        }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        error: {
          code: "read_failed",
          message: message || "Failed to read text file",
          category: "execution"
        }
      };
    }
  }
}

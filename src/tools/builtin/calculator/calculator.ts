import type { BuiltInTool, BuiltInToolManifest } from "../builtin-tool";
import type { SdkRequest } from "../../../execution/tool-sdk/request";
import type { SdkResponse } from "../../../execution/tool-sdk/response";

export interface CalculatorInput {
  expression: string;
  [key: string]: unknown;
}

export interface CalculatorOutput {
  result: number;
  [key: string]: unknown;
}

export class CalculatorTool implements BuiltInTool<
  CalculatorInput,
  CalculatorOutput
> {
  readonly manifest: BuiltInToolManifest = {
    id: "calculator",
    name: "Calculator Tool",
    description: "Evaluates mathematical expressions safely",
    sdkVersion: "1.0.0",
    toolVersion: "1.0.0",
    category: "utility",
    isBuiltIn: true,
    capabilities: ["arithmetic"],
    requiredPermissions: [],
    input: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The mathematical expression to evaluate, e.g. '2 + 2'"
        }
      },
      required: ["expression"]
    },
    output: {
      type: "object",
      properties: {
        result: {
          type: "number",
          description: "The result of the evaluation"
        }
      }
    },
    dependencies: []
  };

  async execute(
    request: SdkRequest<CalculatorInput>
  ): Promise<SdkResponse<CalculatorOutput>> {
    const { expression } = request.input;
    if (!expression || typeof expression !== "string") {
      return {
        success: false,
        error: {
          code: "invalid_input",
          message: "Expression must be a non-empty string",
          category: "validation"
        }
      };
    }

    const cleanExpr = expression.replace(/\s+/g, "");
    if (!/^[0-9+\-*/().]+$/.test(cleanExpr)) {
      return {
        success: false,
        error: {
          code: "invalid_expression",
          message: "Expression contains invalid or unsupported characters",
          category: "validation"
        }
      };
    }

    try {
      // Safe evaluation restricted by the regex above
      const result = new Function(`return (${cleanExpr})`)();
      if (typeof result !== "number" || isNaN(result) || !isFinite(result)) {
        return {
          success: false,
          error: {
            code: "evaluation_failed",
            message: "Result is not a valid number",
            category: "execution"
          }
        };
      }
      return {
        success: true,
        output: { result }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        error: {
          code: "evaluation_failed",
          message: message || "Failed to evaluate expression",
          category: "execution"
        }
      };
    }
  }
}

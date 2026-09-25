import type { SdkError } from "./error";
import type { SdkRequest } from "./request";
import type { ToolManifest } from "./manifest";

export function validateSdkRequest(
  request: unknown,
  manifest?: ToolManifest
): SdkError | null {
  if (typeof request !== "object" || request === null) {
    return invalid("SDK request must be an object");
  }

  const value = request as Partial<SdkRequest>;
  if (typeof value.toolId !== "string" || value.toolId.trim() === "") {
    return invalid("SDK request toolId must be a non-empty string");
  }
  if (
    typeof value.input !== "object" ||
    value.input === null ||
    Array.isArray(value.input)
  ) {
    return invalid("SDK request input must be an object");
  }
  if (!manifest) return null;

  const required = manifest.input.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (
        typeof key !== "string" ||
        !Object.prototype.hasOwnProperty.call(value.input, key) ||
        value.input[key] === undefined
      ) {
        return invalid(`Missing required input '${String(key)}'`);
      }
    }
  }

  const properties = manifest.input.properties;
  if (typeof properties === "object" && properties !== null) {
    for (const [key, definition] of Object.entries(properties)) {
      const inputValue = value.input[key];
      if (inputValue === undefined) continue;
      if (typeof definition !== "object" || definition === null) continue;
      const expected = (definition as Record<string, unknown>).type;
      if (typeof expected !== "string") continue;
      const valid =
        expected === "array"
          ? Array.isArray(inputValue)
          : expected === "object"
            ? typeof inputValue === "object" &&
              inputValue !== null &&
              !Array.isArray(inputValue)
            : typeof inputValue === expected;
      if (!valid) return invalid(`Input '${key}' must be ${expected}`);
    }
  }
  return null;
}

function invalid(message: string): SdkError {
  return { code: "INVALID_REQUEST", message, category: "validation" };
}

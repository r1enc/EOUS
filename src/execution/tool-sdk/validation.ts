import type { SdkError } from "./error";

export interface SdkVersion {
  major: number;
  minor: number;
  patch: number;
}

export const CURRENT_SDK_VERSION = "1.0.0";

export function parseVersion(versionStr: string): SdkVersion | null {
  const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

export function isCompatible(
  toolSdkVersionStr: string,
  platformSdkVersionStr: string
): boolean {
  const toolVer = parseVersion(toolSdkVersionStr);
  const platformVer = parseVersion(platformSdkVersionStr);
  if (!toolVer || !platformVer) return false;

  if (platformVer.major !== toolVer.major) return false;
  if (platformVer.minor < toolVer.minor) return false;
  if (platformVer.minor === toolVer.minor && platformVer.patch < toolVer.patch)
    return false;

  return true;
}

export function validateManifest(manifest: unknown): SdkError | null {
  if (typeof manifest !== "object" || manifest === null) {
    return {
      code: "INVALID_MANIFEST",
      message: "Manifest must be a non-null object",
      category: "validation"
    };
  }

  const m = manifest as Record<string, unknown>;

  for (const field of ["id", "name", "description"]) {
    if (typeof m[field] !== "string" || (m[field] as string).trim() === "") {
      return {
        code: "INVALID_MANIFEST",
        message: `Manifest field '${field}' must be a non-empty string`,
        category: "validation"
      };
    }
  }

  for (const field of ["sdkVersion", "toolVersion"]) {
    if (typeof m[field] !== "string" || !parseVersion(m[field] as string)) {
      return {
        code: "INVALID_VERSION_FORMAT",
        message: `Manifest field '${field}' must be a valid semver string (e.g. '1.0.0')`,
        category: "validation"
      };
    }
  }

  for (const field of ["capabilities", "requiredPermissions", "dependencies"]) {
    const value = m[field];
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      return {
        code: "INVALID_MANIFEST",
        message: `Manifest field '${field}' must be an array of strings`,
        category: "validation"
      };
    }
  }

  for (const field of ["input", "output"]) {
    if (typeof m[field] !== "object" || m[field] === null) {
      return {
        code: "INVALID_MANIFEST",
        message: `Manifest field '${field}' must be a non-null object`,
        category: "validation"
      };
    }
  }

  return null;
}

export function validateToolContract(tool: unknown): SdkError | null {
  if (typeof tool !== "object" || tool === null) {
    return {
      code: "INVALID_TOOL",
      message: "Tool must be a non-null object",
      category: "validation"
    };
  }

  const t = tool as Record<string, unknown>;

  if (typeof t.execute !== "function") {
    return {
      code: "INVALID_TOOL_CONTRACT",
      message: "Tool must implement an 'execute' function",
      category: "validation"
    };
  }

  if (!t.manifest) {
    return {
      code: "INVALID_TOOL_CONTRACT",
      message: "Tool must provide a 'manifest' object",
      category: "validation"
    };
  }

  const manifestError = validateManifest(t.manifest);
  if (manifestError) {
    return manifestError;
  }

  return null;
}

export function validateCompatibility(
  toolSdkVersion: string,
  platformSdkVersion: string = CURRENT_SDK_VERSION
): SdkError | null {
  if (!parseVersion(toolSdkVersion)) {
    return {
      code: "INVALID_VERSION_FORMAT",
      message: `Tool SDK version '${toolSdkVersion}' is not a valid semver string`,
      category: "compatibility"
    };
  }

  if (!parseVersion(platformSdkVersion)) {
    return {
      code: "INVALID_VERSION_FORMAT",
      message: `Platform SDK version '${platformSdkVersion}' is not a valid semver string`,
      category: "compatibility"
    };
  }

  if (!isCompatible(toolSdkVersion, platformSdkVersion)) {
    return {
      code: "INCOMPATIBLE_SDK_VERSION",
      message: `Tool requires SDK version '${toolSdkVersion}' which is incompatible with current platform SDK version '${platformSdkVersion}'`,
      category: "compatibility"
    };
  }

  return null;
}

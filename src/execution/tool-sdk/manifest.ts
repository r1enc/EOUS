export type ToolInputDefinition = Record<string, unknown>;

export type ToolOutputDefinition = Record<string, unknown>;

export type ToolDependency = string;

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
}

export interface ToolManifest extends ToolMetadata {
  sdkVersion: string;
  toolVersion: string;
  capabilities: string[];
  requiredPermissions: string[];
  input: ToolInputDefinition;
  output: ToolOutputDefinition;
  dependencies: ToolDependency[];
}

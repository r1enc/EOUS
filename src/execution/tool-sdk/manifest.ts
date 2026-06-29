export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  sdkVersion: string;
  toolVersion: string;
  capabilities: string[];
  requiredPermissions: string[];
  input: unknown;
  output: unknown;
  dependencies: string[];
}

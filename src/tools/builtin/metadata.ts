import type { ToolMetadata } from "../../execution/tool-sdk/manifest";
import type { BuiltInToolCategory } from "./category";

export interface BuiltInToolMetadata extends ToolMetadata {
  category: BuiltInToolCategory;
  isBuiltIn: true;
}

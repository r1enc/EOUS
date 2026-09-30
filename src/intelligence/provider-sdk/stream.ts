import type { ProviderError } from "./error";
import type { ProviderResponse } from "./response";

/**
 * A stream yields zero or more ordered content deltas, then exactly one
 * complete or failure event and ends. Empty deltas are valid no-ops.
 */
export type ProviderStreamEvent =
  | { type: "content"; delta: string }
  | {
      type: "complete";
      /** Authoritative final response; it need not equal joined deltas. */
      response: Extract<ProviderResponse, { success: true }>;
    }
  | { type: "failure"; error: ProviderError };

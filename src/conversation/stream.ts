import type { ConversationResponse } from "./response";

export type ConversationStreamEvent =
  | { type: "content"; delta: string }
  | {
      type: "complete";
      response: ConversationResponse & { status: "success" };
    }
  | {
      type: "failure";
      response: ConversationResponse & { status: "failure" };
    };

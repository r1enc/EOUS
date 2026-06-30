export interface ConversationResponse {
  id: string;
  content: string;
  status: "success" | "failure";
  error?: {
    code: string;
    message: string;
  };
}

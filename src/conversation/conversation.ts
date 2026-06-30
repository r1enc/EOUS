export interface Conversation {
  id: string;
  title: string;
  execute(request: unknown): Promise<unknown>;
}

export interface Agent {
  id: string;
  name: string;
  execute(request: unknown): Promise<unknown>;
}

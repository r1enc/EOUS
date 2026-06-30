import type { Provider } from "./provider";
import { validateProvider } from "./validation";

export interface ProviderRegistry {
  registerProvider(provider: Provider): void;
  getProvider(id: string): Provider | undefined;
  listProviders(): Provider[];
  unregisterProvider(id: string): void;
  clear(): void;
}

export class DefaultProviderRegistry implements ProviderRegistry {
  private providers = new Map<string, Provider>();

  registerProvider(provider: Provider): void {
    validateProvider(provider);
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  listProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  clear(): void {
    this.providers.clear();
  }
}

export const providerRegistry: ProviderRegistry = new DefaultProviderRegistry();

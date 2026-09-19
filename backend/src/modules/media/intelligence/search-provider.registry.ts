import { ISearchIndexProvider } from './search-provider.interface.js';
import { MemoryVectorSearchProvider } from './memory-vector-search.provider.js';
import { logger } from '../../../core/logger.js';

/**
 * Registry managing replaceable Search Index Providers.
 * Supports swapping search backends (In-Memory, PgVector, Pinecone, Qdrant, Milvus).
 */
export class SearchProviderRegistry {
  private providers = new Map<string, ISearchIndexProvider>();
  private activeProviderId = 'memory_vector_search';

  constructor() {
    // Register default memory provider
    const defaultMemoryProvider = new MemoryVectorSearchProvider();
    this.registerProvider(defaultMemoryProvider);
  }

  registerProvider(provider: ISearchIndexProvider) {
    this.providers.set(provider.id, provider);
    logger.info({ providerId: provider.id, providerName: provider.name }, 'Registered search provider');
  }

  setActiveProvider(id: string) {
    if (!this.providers.has(id)) {
      throw new Error(`Search provider "${id}" not found. Available: ${Array.from(this.providers.keys()).join(', ')}`);
    }
    this.activeProviderId = id;
    logger.info({ activeProvider: id }, 'Swapped active search provider');
  }

  getActiveProvider(): ISearchIndexProvider {
    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      // Fallback to first available
      const fallback = Array.from(this.providers.values())[0];
      if (!fallback) throw new Error('No search provider registered');
      return fallback;
    }
    return provider;
  }

  getProvider(id: string): ISearchIndexProvider | undefined {
    return this.providers.get(id);
  }

  listProviders(): Array<{ id: string; name: string; isActive: boolean }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.id === this.activeProviderId,
    }));
  }
}

export const searchProviderRegistry = new SearchProviderRegistry();

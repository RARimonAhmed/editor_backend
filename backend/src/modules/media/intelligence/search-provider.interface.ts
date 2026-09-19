import {
  MediaIntelligenceMetadata,
  SemanticSearchQuery,
  SemanticSearchResultItem,
} from './intelligence.types.js';

/**
 * Replaceable Search Provider Interface
 * Allows swapping the vector & metadata index implementation (e.g. Memory, PgVector, Pinecone, Qdrant, Milvus)
 */
export interface ISearchIndexProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Indexes a media asset's multi-modal intelligence
   */
  indexMedia(mediaId: string, intelligence: MediaIntelligenceMetadata): Promise<void>;

  /**
   * Removes media from the search index
   */
  removeMedia(mediaId: string): Promise<void>;

  /**
   * Executes multi-modal semantic search, returning ranked results with matched timeline ranges
   */
  search(userId: string, query: SemanticSearchQuery, queryEmbedding?: number[]): Promise<SemanticSearchResultItem[]>;

  /**
   * Retrieves telemetry statistics about the search index
   */
  getStats(): Promise<{ indexedAssetsCount: number; totalSegmentsCount: number; provider: string }>;

  /**
   * Clears the index (useful for test isolation)
   */
  clear?(): Promise<void>;
}

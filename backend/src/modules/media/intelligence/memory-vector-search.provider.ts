import { ISearchIndexProvider } from './search-provider.interface.js';
import {
  MediaIntelligenceMetadata,
  SemanticSearchQuery,
  SemanticSearchResultItem,
  TimeRangeMatch,
} from './intelligence.types.js';

/**
 * In-Memory Multi-Modal Vector & Metadata Search Provider.
 * Provides cosine vector similarity, lexical keyword matching, and time-range extraction
 * with zero external vector DB dependencies.
 */
export class MemoryVectorSearchProvider implements ISearchIndexProvider {
  readonly id = 'memory_vector_search';
  readonly name = 'In-Memory Multi-Modal Vector Search Provider';

  private index = new Map<string, MediaIntelligenceMetadata>();

  async indexMedia(mediaId: string, intelligence: MediaIntelligenceMetadata): Promise<void> {
    this.index.set(mediaId, intelligence);
  }

  async removeMedia(mediaId: string): Promise<void> {
    this.index.delete(mediaId);
  }

  async clear(): Promise<void> {
    this.index.clear();
  }

  async getStats(): Promise<{ indexedAssetsCount: number; totalSegmentsCount: number; provider: string }> {
    let totalSegments = 0;
    for (const item of this.index.values()) {
      totalSegments += item.segmentEmbeddings.length;
    }
    return {
      indexedAssetsCount: this.index.size,
      totalSegmentsCount: totalSegments,
      provider: this.id,
    };
  }

  /**
   * Multi-modal search executing vector cosine similarity, structured entity matching,
   * and time-range identification.
   */
  async search(
    userId: string,
    query: SemanticSearchQuery,
    queryEmbedding?: number[]
  ): Promise<SemanticSearchResultItem[]> {
    const rawTerms = query.query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const targetObjects = (query.objects || []).map((o) => o.toLowerCase());
    const speechTerm = query.speechQuery ? query.speechQuery.toLowerCase() : '';
    const sceneTerm = query.sceneQuery ? query.sceneQuery.toLowerCase() : '';
    const audioEvents = (query.audioEvents || []).map((e) => e.toLowerCase());

    const results: SemanticSearchResultItem[] = [];

    for (const media of this.index.values()) {
      // 1. Strict multi-tenant isolation
      if (media.userId !== userId) {
        continue;
      }

      // 2. Project filter
      if (query.projectId && media.projectId !== query.projectId) {
        continue;
      }

      // 3. Category / Media Type filter
      if (query.category && media.category !== query.category) {
        continue;
      }

      // 4. Duration filter
      if (query.minDuration !== undefined && media.durationSeconds < query.minDuration) {
        continue;
      }
      if (query.maxDuration !== undefined && media.durationSeconds > query.maxDuration) {
        continue;
      }

      // 5. Date filter
      if (query.createdAfter && new Date(media.indexedAt) < new Date(query.createdAfter)) {
        continue;
      }
      if (query.createdBefore && new Date(media.indexedAt) > new Date(query.createdBefore)) {
        continue;
      }

      // 6. Multi-Modal Segment Analysis & Time-Range Localization
      const matchedRanges: TimeRangeMatch[] = [];

      // Check segments
      for (const seg of media.segmentEmbeddings) {
        let segScore = 0;
        const matchedObjs: string[] = [];
        let matchedSpeechText: string | undefined;
        const matchedAudio: string[] = [];
        const matchedScenesList: string[] = [];

        // A. Cosine Vector Similarity
        if (queryEmbedding && seg.embedding && seg.embedding.length > 0) {
          const cosSim = this.computeCosineSimilarity(queryEmbedding, seg.embedding);
          segScore += Math.max(0, cosSim) * 0.45;
        }

        // B. Object matching within this segment
        for (const obj of media.visualObjects) {
          // Check if object overlaps with segment time [seg.start, seg.end]
          if (obj.start < seg.end && obj.end > seg.start) {
            const labelLower = obj.label.toLowerCase();
            const matchesQueryObject = targetObjects.includes(labelLower);
            const matchesQueryTerm = rawTerms.includes(labelLower);

            if (matchesQueryObject || matchesQueryTerm) {
              if (!matchedObjs.includes(obj.label)) {
                matchedObjs.push(obj.label);
                segScore += 0.35;
              }
            }
          }
        }

        // C. Speech & Transcript matching within this segment
        if (media.speechSegments) {
          for (const sp of media.speechSegments) {
            if (sp.start < seg.end && sp.end > seg.start) {
              const spLower = sp.text.toLowerCase();
              let speechHit = false;

              if (speechTerm && spLower.includes(speechTerm)) {
                speechHit = true;
              }
              // Check terms
              for (const term of rawTerms) {
                if (['speaking', 'speech', 'talk', 'says', 'saying'].includes(term) && spLower.length > 0) {
                  speechHit = true;
                } else if (term.length > 3 && spLower.includes(term)) {
                  speechHit = true;
                }
              }

              if (speechHit) {
                matchedSpeechText = sp.text;
                segScore += 0.3;
              }
            }
          }
        }

        // D. Audio events matching
        for (const ae of media.audioEvents) {
          if (ae.start < seg.end && ae.end > seg.start) {
            const aeLabel = ae.label.toLowerCase();
            if (audioEvents.includes(aeLabel) || rawTerms.includes(aeLabel)) {
              if (!matchedAudio.includes(ae.label)) {
                matchedAudio.push(ae.label);
                segScore += 0.2;
              }
            }
          }
        }

        // E. Scene matching
        for (const sc of media.scenes) {
          if (sc.start < seg.end && sc.end > seg.start) {
            const scDesc = sc.description.toLowerCase();
            const tagHit = sc.tags.some((t) => rawTerms.includes(t.toLowerCase()));
            if (tagHit || (sceneTerm && scDesc.includes(sceneTerm))) {
              matchedScenesList.push(sc.description);
              segScore += 0.2;
            }
          }
        }

        // F. Text snippet lexical match
        const snippetLower = seg.textSnippet.toLowerCase();
        for (const t of rawTerms) {
          if (snippetLower.includes(t)) {
            segScore += 0.1;
          }
        }

        // If this segment has a positive relevance score, record as range match
        if (segScore > 0.35 || matchedObjs.length > 0 || matchedSpeechText) {
          matchedRanges.push({
            start: seg.start,
            end: seg.end,
            score: Math.min(0.99, Math.round(segScore * 100) / 100),
            snippet: seg.textSnippet || media.summary,
            matchedObjects: matchedObjs,
            matchedSpeech: matchedSpeechText,
            matchedAudioEvents: matchedAudio.length > 0 ? matchedAudio : undefined,
            matchedScenes: matchedScenesList.length > 0 ? matchedScenesList : undefined,
          });
        }
      }

      // Merge overlapping / consecutive matched ranges
      const mergedRanges = this.mergeRanges(matchedRanges);

      // Overall asset score
      let assetScore = 0;
      if (queryEmbedding && media.assetEmbedding && media.assetEmbedding.length > 0) {
        assetScore = Math.max(0, this.computeCosineSimilarity(queryEmbedding, media.assetEmbedding)) * 0.4;
      }

      if (mergedRanges.length > 0) {
        const bestRangeScore = Math.max(...mergedRanges.map((r) => r.score));
        assetScore = Math.max(assetScore, bestRangeScore);
      } else {
        // Check keywords & summary match
        for (const term of rawTerms) {
          if (media.keywords.some((k) => k.toLowerCase().includes(term))) {
            assetScore += 0.2;
          }
        }
      }

      // Explicit target constraints
      if (targetObjects.length > 0) {
        const hasAllTargetObjects = targetObjects.every((to) =>
          media.visualObjects.some((vo) => vo.label.toLowerCase() === to)
        );
        if (!hasAllTargetObjects) {
          continue;
        }
      }

      if (speechTerm && (!media.transcript || !media.transcript.toLowerCase().includes(speechTerm))) {
        continue;
      }

      if (sceneTerm && !media.scenes.some((s) => s.description.toLowerCase().includes(sceneTerm))) {
        continue;
      }

      if (assetScore > 0.2 || mergedRanges.length > 0) {
        results.push({
          assetId: media.mediaId,
          assetName: media.fileName,
          category: media.category,
          duration: media.durationSeconds,
          score: Math.min(0.99, Math.round(assetScore * 100) / 100),
          matchingRanges: mergedRanges.length > 0 ? mergedRanges : [
            {
              start: 0,
              end: Math.min(media.durationSeconds, 10.0),
              score: Math.round(assetScore * 100) / 100,
              snippet: media.summary,
              matchedObjects: media.visualObjects.slice(0, 3).map((o) => o.label),
            },
          ],
          intelligenceSummary: media.summary,
          location: media.location,
          createdAt: media.indexedAt,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    return results.slice(offset, offset + limit);
  }

  /**
   * Computes cosine similarity between two numeric vectors
   */
  private computeCosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Merges contiguous or overlapping time ranges
   */
  private mergeRanges(ranges: TimeRangeMatch[]): TimeRangeMatch[] {
    if (ranges.length === 0) return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: TimeRangeMatch[] = [];

    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];

      if (next.start <= current.end + 0.5) {
        current.end = Math.max(current.end, next.end);
        current.score = Math.max(current.score, next.score);
        current.matchedObjects = Array.from(new Set([...current.matchedObjects, ...next.matchedObjects]));
        if (!current.matchedSpeech && next.matchedSpeech) {
          current.matchedSpeech = next.matchedSpeech;
        }
        if (next.matchedAudioEvents) {
          current.matchedAudioEvents = Array.from(
            new Set([...(current.matchedAudioEvents || []), ...next.matchedAudioEvents])
          );
        }
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);

    return merged;
  }
}

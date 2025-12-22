import { db } from "../db";
import { coinTypes, imageEmbeddings } from "@shared/schema";
import { and, or, ilike, gte, lte, eq, sql, inArray } from "drizzle-orm";
import { EmbeddingService } from "./embedding-service";

export interface SimilaritySearchParams {
  ruler?: string;
  denomination?: string;
  mint?: string;
  metal?: string;
  obvLegend?: string;
  revLegend?: string;
  dateFrom?: number;
  dateTo?: number;
  referenceText?: string;
  limit?: number;
}

export interface SimilarCoinResult {
  id: string;
  label: string;
  sourceId: string;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  dateFrom: number | null;
  dateTo: number | null;
  obvLegend: string | null;
  revLegend: string | null;
  referenceText: string | null;
  authority: string | null;
  issuer: string | null;
  mint: string | null;
  denomination: string | null;
  metal: string | null;
  matchScore: number;
  matchReasons: string[];
}

/**
 * Search for similar coins using metadata-based matching.
 * This is a privacy-first approach that doesn't require external AI APIs.
 */
export async function findSimilarCoins(
  params: SimilaritySearchParams
): Promise<SimilarCoinResult[]> {
  const {
    ruler,
    denomination,
    mint,
    metal,
    obvLegend,
    revLegend,
    dateFrom,
    dateTo,
    referenceText,
    limit = 20,
  } = params;

  // Build dynamic search conditions
  const conditions: any[] = [];
  const matchingFactors: Map<string, { condition: any; weight: number; reason: string }> = new Map();

  // Ruler matching (high weight) - check both label and authority/issuer fields
  if (ruler) {
    const rulerCondition = or(
      ilike(coinTypes.label, `%${ruler}%`),
      ilike(coinTypes.authority, `%${ruler}%`),
      ilike(coinTypes.issuer, `%${ruler}%`)
    );
    matchingFactors.set('ruler', {
      condition: rulerCondition,
      weight: 0.3,
      reason: `Ruler matches: ${ruler}`,
    });
  }
  
  // Denomination matching
  if (denomination) {
    const denomCondition = ilike(coinTypes.denomination, `%${denomination}%`);
    matchingFactors.set('denomination', {
      condition: denomCondition,
      weight: 0.15,
      reason: `Denomination matches: ${denomination}`,
    });
  }
  
  // Mint matching
  if (mint) {
    const mintCondition = ilike(coinTypes.mint, `%${mint}%`);
    matchingFactors.set('mint', {
      condition: mintCondition,
      weight: 0.15,
      reason: `Mint matches: ${mint}`,
    });
  }
  
  // Metal matching
  if (metal) {
    const metalCondition = ilike(coinTypes.metal, `%${metal}%`);
    matchingFactors.set('metal', {
      condition: metalCondition,
      weight: 0.1,
      reason: `Metal matches: ${metal}`,
    });
  }

  // Legend matching (high weight for exact, medium for partial)
  if (obvLegend) {
    const obvCondition = ilike(coinTypes.obvLegend, `%${obvLegend.substring(0, Math.min(10, obvLegend.length))}%`);
    matchingFactors.set('obvLegend', {
      condition: obvCondition,
      weight: 0.25,
      reason: `Obverse legend similar`,
    });
  }

  if (revLegend) {
    const revCondition = ilike(coinTypes.revLegend, `%${revLegend.substring(0, Math.min(10, revLegend.length))}%`);
    matchingFactors.set('revLegend', {
      condition: revCondition,
      weight: 0.25,
      reason: `Reverse legend similar`,
    });
  }

  // Date range matching (medium weight)
  if (dateFrom !== undefined || dateTo !== undefined) {
    const dateConditions: any[] = [];
    if (dateFrom !== undefined) {
      dateConditions.push(gte(coinTypes.dateTo, dateFrom));
    }
    if (dateTo !== undefined) {
      dateConditions.push(lte(coinTypes.dateFrom, dateTo));
    }
    if (dateConditions.length > 0) {
      matchingFactors.set('date', {
        condition: and(...dateConditions),
        weight: 0.1,
        reason: `Date range overlaps`,
      });
    }
  }

  // Reference text matching
  if (referenceText) {
    const refCondition = ilike(coinTypes.referenceText, `%${referenceText}%`);
    matchingFactors.set('reference', {
      condition: refCondition,
      weight: 0.1,
      reason: `Reference matches: ${referenceText}`,
    });
  }

  // If no search criteria provided, return empty
  if (matchingFactors.size === 0) {
    return [];
  }

  // Build OR condition for any match
  const allConditions = Array.from(matchingFactors.values()).map(f => f.condition);
  
  try {
    // Fetch candidate coins
    const candidates = await db
      .select({
        id: coinTypes.id,
        label: coinTypes.label,
        sourceId: coinTypes.sourceId,
        sourceRecordId: coinTypes.sourceRecordId,
        sourceUrl: coinTypes.sourceUrl,
        imageUrl: coinTypes.imageUrl,
        dateFrom: coinTypes.dateFrom,
        dateTo: coinTypes.dateTo,
        obvLegend: coinTypes.obvLegend,
        revLegend: coinTypes.revLegend,
        referenceText: coinTypes.referenceText,
        authority: coinTypes.authority,
        issuer: coinTypes.issuer,
        mint: coinTypes.mint,
        denomination: coinTypes.denomination,
        metal: coinTypes.metal,
      })
      .from(coinTypes)
      .where(or(...allConditions))
      .limit(limit * 2); // Fetch extra to allow for scoring

    // Score each candidate
    const scored: SimilarCoinResult[] = candidates.map(coin => {
      let score = 0;
      const reasons: string[] = [];

      // Check each factor
      if (ruler) {
        const rulerLower = ruler.toLowerCase();
        if (
          coin.label?.toLowerCase().includes(rulerLower) ||
          coin.authority?.toLowerCase().includes(rulerLower) ||
          coin.issuer?.toLowerCase().includes(rulerLower)
        ) {
          score += matchingFactors.get('ruler')!.weight;
          reasons.push(matchingFactors.get('ruler')!.reason);
        }
      }
      
      if (denomination && coin.denomination?.toLowerCase().includes(denomination.toLowerCase())) {
        score += matchingFactors.get('denomination')!.weight;
        reasons.push(matchingFactors.get('denomination')!.reason);
      }
      
      if (mint && coin.mint?.toLowerCase().includes(mint.toLowerCase())) {
        score += matchingFactors.get('mint')!.weight;
        reasons.push(matchingFactors.get('mint')!.reason);
      }
      
      if (metal && coin.metal?.toLowerCase().includes(metal.toLowerCase())) {
        score += matchingFactors.get('metal')!.weight;
        reasons.push(matchingFactors.get('metal')!.reason);
      }

      if (obvLegend && coin.obvLegend) {
        const searchPart = obvLegend.substring(0, Math.min(10, obvLegend.length)).toLowerCase();
        if (coin.obvLegend.toLowerCase().includes(searchPart)) {
          score += matchingFactors.get('obvLegend')!.weight;
          reasons.push(matchingFactors.get('obvLegend')!.reason);
        }
      }

      if (revLegend && coin.revLegend) {
        const searchPart = revLegend.substring(0, Math.min(10, revLegend.length)).toLowerCase();
        if (coin.revLegend.toLowerCase().includes(searchPart)) {
          score += matchingFactors.get('revLegend')!.weight;
          reasons.push(matchingFactors.get('revLegend')!.reason);
        }
      }

      // Date overlap
      if (matchingFactors.has('date')) {
        const coinFrom = coin.dateFrom || -10000;
        const coinTo = coin.dateTo || 10000;
        const searchFrom = dateFrom || -10000;
        const searchTo = dateTo || 10000;
        
        if (coinTo >= searchFrom && coinFrom <= searchTo) {
          score += matchingFactors.get('date')!.weight;
          reasons.push(matchingFactors.get('date')!.reason);
        }
      }

      if (referenceText && coin.referenceText?.toLowerCase().includes(referenceText.toLowerCase())) {
        score += matchingFactors.get('reference')!.weight;
        reasons.push(matchingFactors.get('reference')!.reason);
      }

      return {
        ...coin,
        matchScore: Math.min(score, 1.0),
        matchReasons: reasons,
      };
    });

    // Sort by score and return top results
    return scored
      .filter(c => c.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  } catch (error) {
    console.error("Similarity search error:", error);
    throw new Error(`Failed to search similar coins: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search for coins by text query across all text fields.
 */
export async function searchCoinsByText(
  query: string,
  limit: number = 20
): Promise<SimilarCoinResult[]> {
  if (!query.trim()) {
    return [];
  }

  const searchTerm = `%${query.trim()}%`;

  try {
    const results = await db
      .select({
        id: coinTypes.id,
        label: coinTypes.label,
        sourceId: coinTypes.sourceId,
        sourceRecordId: coinTypes.sourceRecordId,
        sourceUrl: coinTypes.sourceUrl,
        imageUrl: coinTypes.imageUrl,
        dateFrom: coinTypes.dateFrom,
        dateTo: coinTypes.dateTo,
        obvLegend: coinTypes.obvLegend,
        revLegend: coinTypes.revLegend,
        referenceText: coinTypes.referenceText,
        authority: coinTypes.authority,
        issuer: coinTypes.issuer,
        mint: coinTypes.mint,
        denomination: coinTypes.denomination,
        metal: coinTypes.metal,
      })
      .from(coinTypes)
      .where(
        or(
          ilike(coinTypes.label, searchTerm),
          ilike(coinTypes.obvLegend, searchTerm),
          ilike(coinTypes.revLegend, searchTerm),
          ilike(coinTypes.referenceText, searchTerm),
          ilike(coinTypes.authority, searchTerm),
          ilike(coinTypes.mint, searchTerm),
          ilike(coinTypes.denomination, searchTerm)
        )
      )
      .limit(limit);

    return results.map(coin => ({
      ...coin,
      matchScore: 0.5,
      matchReasons: [`Text match: "${query}"`],
    }));
  } catch (error) {
    console.error("Text search error:", error);
    throw new Error(`Failed to search coins: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface HybridSearchParams extends SimilaritySearchParams {
  imageUrl?: string;
  imageEmbedding?: number[];
  vectorWeight?: number;
}

export interface HybridSearchResult extends SimilarCoinResult {
  metadataScore: number;
  vectorScore: number;
  hasEmbedding: boolean;
}

/**
 * Hybrid search combining metadata matching with vector similarity re-ranking.
 * Pipeline:
 * 1. Candidate set from canonical metadata matching
 * 2. Vector re-rank using image embeddings (if available)
 * 3. Output with combined scores and explanation
 */
export async function findSimilarCoinsHybrid(
  params: HybridSearchParams
): Promise<HybridSearchResult[]> {
  const {
    imageUrl,
    imageEmbedding,
    vectorWeight = 0.4,
    limit = 20,
    ...metadataParams
  } = params;

  let queryEmbedding: number[] | null = null;
  
  if (imageEmbedding && imageEmbedding.length > 0) {
    queryEmbedding = imageEmbedding;
  } else if (imageUrl) {
    try {
      const imageData = await EmbeddingService.downloadImage(imageUrl);
      if (imageData) {
        queryEmbedding = await EmbeddingService.computeImageEmbedding(imageData);
      }
    } catch (error) {
      console.warn('Failed to compute query embedding:', error);
    }
  }

  const metadataResults = await findSimilarCoins({
    ...metadataParams,
    limit: limit * 2,
  });

  if (!queryEmbedding || metadataResults.length === 0) {
    return metadataResults.map(r => ({
      ...r,
      metadataScore: r.matchScore,
      vectorScore: 0,
      hasEmbedding: false,
    })).slice(0, limit);
  }

  const coinTypeIds = metadataResults.map(r => r.id);
  
  const embeddings = await db.select({
    coinTypeId: imageEmbeddings.coinTypeId,
    embedding: imageEmbeddings.embedding,
  })
    .from(imageEmbeddings)
    .where(inArray(imageEmbeddings.coinTypeId, coinTypeIds));

  const embeddingMap = new Map<string, number[]>();
  for (const emb of embeddings) {
    if (emb.coinTypeId) {
      try {
        embeddingMap.set(emb.coinTypeId, JSON.parse(emb.embedding));
      } catch (e) {
        console.warn(`Invalid embedding for coin ${emb.coinTypeId}`);
      }
    }
  }

  const reranked: HybridSearchResult[] = metadataResults.map(coin => {
    const storedEmbedding = embeddingMap.get(coin.id);
    
    if (!storedEmbedding || !queryEmbedding) {
      return {
        ...coin,
        metadataScore: coin.matchScore,
        vectorScore: 0,
        hasEmbedding: false,
      };
    }

    const vectorSimilarity = cosineSimilarity(queryEmbedding, storedEmbedding);
    
    const metadataWeight = 1 - vectorWeight;
    const combinedScore = (coin.matchScore * metadataWeight) + (vectorSimilarity * vectorWeight);
    
    return {
      ...coin,
      matchScore: combinedScore,
      metadataScore: coin.matchScore,
      vectorScore: vectorSimilarity,
      hasEmbedding: true,
      matchReasons: [
        ...coin.matchReasons,
        `Visual similarity: ${(vectorSimilarity * 100).toFixed(1)}%`,
      ],
    };
  });

  return reranked
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

/**
 * Find visually similar coins using only vector search.
 * Used when user uploads an image without metadata.
 */
export async function findSimilarCoinsByImage(
  imageUrl: string,
  limit: number = 20
): Promise<HybridSearchResult[]> {
  const imageData = await EmbeddingService.downloadImage(imageUrl);
  if (!imageData) {
    throw new Error('Failed to download image');
  }
  
  const queryEmbedding = await EmbeddingService.computeImageEmbedding(imageData);
  if (!queryEmbedding) {
    throw new Error('Failed to compute image embedding');
  }
  
  const similarEmbeddings = await EmbeddingService.findSimilarByEmbedding(queryEmbedding, {
    limit,
    minSimilarity: 0.3,
  });
  
  const coinTypeIds = similarEmbeddings
    .filter(e => e.coinTypeId)
    .map(e => e.coinTypeId!);
  
  if (coinTypeIds.length === 0) {
    return [];
  }
  
  const coins = await db.select({
    id: coinTypes.id,
    label: coinTypes.label,
    sourceId: coinTypes.sourceId,
    sourceRecordId: coinTypes.sourceRecordId,
    sourceUrl: coinTypes.sourceUrl,
    imageUrl: coinTypes.imageUrl,
    dateFrom: coinTypes.dateFrom,
    dateTo: coinTypes.dateTo,
    obvLegend: coinTypes.obvLegend,
    revLegend: coinTypes.revLegend,
    referenceText: coinTypes.referenceText,
    authority: coinTypes.authority,
    issuer: coinTypes.issuer,
    mint: coinTypes.mint,
    denomination: coinTypes.denomination,
    metal: coinTypes.metal,
  })
    .from(coinTypes)
    .where(inArray(coinTypes.id, coinTypeIds));
  
  const coinMap = new Map(coins.map(c => [c.id, c]));
  
  return similarEmbeddings
    .filter(e => e.coinTypeId && coinMap.has(e.coinTypeId))
    .map(e => {
      const coin = coinMap.get(e.coinTypeId!)!;
      return {
        ...coin,
        matchScore: e.similarity,
        matchReasons: [`Visual similarity: ${(e.similarity * 100).toFixed(1)}%`],
        metadataScore: 0,
        vectorScore: e.similarity,
        hasEmbedding: true,
      };
    });
}

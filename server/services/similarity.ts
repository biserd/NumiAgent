import { db } from "../db";
import { coinTypes } from "@shared/schema";
import { and, or, ilike, gte, lte } from "drizzle-orm";

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

  // Ruler matching (high weight)
  if (ruler) {
    const rulerCondition = ilike(coinTypes.label, `%${ruler}%`);
    matchingFactors.set('ruler', {
      condition: rulerCondition,
      weight: 0.3,
      reason: `Ruler matches: ${ruler}`,
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
      })
      .from(coinTypes)
      .where(or(...allConditions))
      .limit(limit * 2); // Fetch extra to allow for scoring

    // Score each candidate
    const scored: SimilarCoinResult[] = candidates.map(coin => {
      let score = 0;
      const reasons: string[] = [];

      // Check each factor
      if (ruler && coin.label?.toLowerCase().includes(ruler.toLowerCase())) {
        score += matchingFactors.get('ruler')!.weight;
        reasons.push(matchingFactors.get('ruler')!.reason);
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
      })
      .from(coinTypes)
      .where(
        or(
          ilike(coinTypes.label, searchTerm),
          ilike(coinTypes.obvLegend, searchTerm),
          ilike(coinTypes.revLegend, searchTerm),
          ilike(coinTypes.referenceText, searchTerm)
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

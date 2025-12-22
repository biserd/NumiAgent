// Normalization Pipeline for Entity Resolution and Catalog Crosswalks
// Handles deduplication, entity linking, and standardization across sources

import { db } from "../db";
import { 
  coinTypes, 
  rulers, 
  dynasties, 
  mints, 
  denominations,
  catalogReferences,
  entities
} from "@shared/schema";
import { eq, ilike, or, and, sql } from "drizzle-orm";

export interface NormalizationResult {
  processed: number;
  rulersMapped: number;
  mintsMapped: number;
  denominationsMapped: number;
  catalogRefsMapped: number;
  errors: string[];
}

// Common ruler name variations for matching
const rulerAliases: Record<string, string[]> = {
  "Augustus": ["Caesar Augustus", "Octavian", "Gaius Octavius", "C. Octavianus"],
  "Nero": ["Nero Claudius Caesar", "Nero Caesar"],
  "Hadrian": ["Hadrianus", "P. Aelius Hadrianus"],
  "Trajan": ["Traianus", "M. Ulpius Traianus"],
  "Marcus Aurelius": ["M. Aurelius", "Marcus Aurelius Antoninus"],
  "Constantine I": ["Constantine the Great", "Constantinus I", "Flavius Valerius Constantinus"],
  "Alexander III": ["Alexander the Great", "Alexander of Macedon"],
};

// Common mint name variations
const mintAliases: Record<string, string[]> = {
  "Rome": ["Roma", "Roman mint"],
  "Alexandria": ["Alexandreia", "Alexandria (Egypt)"],
  "Antioch": ["Antiochia", "Antioch on the Orontes"],
  "Constantinople": ["Constantinopolis", "Byzantium"],
  "Athens": ["Athenai", "Athenae"],
  "London": ["Londinium"],
  "Lyon": ["Lugdunum"],
  "Trier": ["Treveri", "Augusta Treverorum"],
};

// Catalog reference patterns for extraction
const catalogPatterns: Array<{
  type: string;
  pattern: RegExp;
  volumeGroup?: number;
}> = [
  { type: "RIC", pattern: /RIC\s*(?:Vol\.?\s*)?(\d+)?\s*[,.]?\s*(\d+[a-z]?)/i, volumeGroup: 1 },
  { type: "RPC", pattern: /RPC\s*(?:Vol\.?\s*)?(\d+)?\s*[,.]?\s*(\d+)/i, volumeGroup: 1 },
  { type: "RRC", pattern: /RRC\s*(\d+)\/(\d+)/i },
  { type: "CRAWFORD", pattern: /Crawford\s*(\d+)\/(\d+)/i },
  { type: "BMC", pattern: /BMC\s*(?:Vol\.?\s*)?(\d+)?\s*[,.]?\s*(\d+)/i, volumeGroup: 1 },
  { type: "SNG", pattern: /SNG\s+(\w+)\s*(\d+)/i },
  { type: "DOC", pattern: /DOC\s*(?:Vol\.?\s*)?(\d+)?\s*[,.]?\s*(\d+)/i, volumeGroup: 1 },
  { type: "SEAR", pattern: /Sear\s*(\d+)/i },
];

/**
 * Normalize a ruler name to a canonical form
 */
function normalizeRulerName(name: string): string {
  const normalized = name.trim();
  
  for (const [canonical, aliases] of Object.entries(rulerAliases)) {
    if (aliases.some(alias => normalized.toLowerCase().includes(alias.toLowerCase()))) {
      return canonical;
    }
    if (normalized.toLowerCase().includes(canonical.toLowerCase())) {
      return canonical;
    }
  }
  
  return normalized;
}

/**
 * Normalize a mint name to a canonical form
 */
function normalizeMintName(name: string): string {
  const normalized = name.trim();
  
  for (const [canonical, aliases] of Object.entries(mintAliases)) {
    if (aliases.some(alias => normalized.toLowerCase().includes(alias.toLowerCase()))) {
      return canonical;
    }
    if (normalized.toLowerCase().includes(canonical.toLowerCase())) {
      return canonical;
    }
  }
  
  return normalized;
}

/**
 * Extract catalog references from reference text
 */
export function extractCatalogReferences(referenceText: string): Array<{
  catalogType: string;
  catalogNumber: string;
  volume?: string;
}> {
  const refs: Array<{ catalogType: string; catalogNumber: string; volume?: string }> = [];
  
  for (const { type, pattern, volumeGroup } of catalogPatterns) {
    // Use global flag to find all matches
    const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
    let match: RegExpExecArray | null;
    
    while ((match = globalPattern.exec(referenceText)) !== null) {
      let catalogNumber: string;
      let volume: string | undefined;
      
      if (type === 'RRC' || type === 'CRAWFORD') {
        // RRC/Crawford format: number/number
        if (match[1] && match[2]) {
          catalogNumber = `${match[1]}/${match[2]}`;
        } else if (match[1]) {
          catalogNumber = match[1];
        } else {
          continue; // Skip invalid match
        }
      } else if (type === 'SNG') {
        // SNG format: SNG Collection Number
        if (match[1] && match[2]) {
          catalogNumber = match[2];
          volume = match[1]; // Collection name as volume
        } else {
          continue;
        }
      } else if (volumeGroup && match[volumeGroup]) {
        // Has volume number
        volume = match[volumeGroup];
        catalogNumber = match[volumeGroup + 1] || match[2];
        if (!catalogNumber) continue;
      } else if (match[2]) {
        // Two capture groups, second is the number
        catalogNumber = match[2];
        if (match[1]) volume = match[1];
      } else if (match[1]) {
        // Single capture group
        catalogNumber = match[1];
      } else {
        continue; // Skip invalid match
      }
      
      // Avoid duplicates
      const isDuplicate = refs.some(
        r => r.catalogType === type && r.catalogNumber === catalogNumber
      );
      
      if (!isDuplicate) {
        refs.push({
          catalogType: type,
          catalogNumber,
          volume,
        });
      }
    }
  }
  
  return refs;
}

/**
 * Find or create a ruler entity
 */
export async function findOrCreateRuler(name: string): Promise<string | null> {
  if (!name) return null;
  
  const normalizedName = normalizeRulerName(name);
  
  // First try exact match on name
  const existing = await db
    .select()
    .from(rulers)
    .where(ilike(rulers.name, `%${normalizedName}%`))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Try matching in alternate names array
  const alternateMatch = await db
    .select()
    .from(rulers)
    .where(sql`${normalizedName} ILIKE ANY(${rulers.alternateNames})`)
    .limit(1);
  
  if (alternateMatch.length > 0) {
    return alternateMatch[0].id;
  }
  
  const [created] = await db
    .insert(rulers)
    .values({
      name: normalizedName,
      alternateNames: name !== normalizedName ? [name] : [],
    })
    .returning();
  
  return created.id;
}

/**
 * Find or create a mint entity
 */
export async function findOrCreateMint(name: string): Promise<string | null> {
  if (!name) return null;
  
  const normalizedName = normalizeMintName(name);
  
  // First try exact match on name
  const existing = await db
    .select()
    .from(mints)
    .where(ilike(mints.name, `%${normalizedName}%`))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Try matching in alternate names array
  const alternateMatch = await db
    .select()
    .from(mints)
    .where(sql`${normalizedName} ILIKE ANY(${mints.alternateNames})`)
    .limit(1);
  
  if (alternateMatch.length > 0) {
    return alternateMatch[0].id;
  }
  
  const [created] = await db
    .insert(mints)
    .values({
      name: normalizedName,
      alternateNames: name !== normalizedName ? [name] : [],
    })
    .returning();
  
  return created.id;
}

/**
 * Find or create a denomination entity
 */
export async function findOrCreateDenomination(name: string): Promise<string | null> {
  if (!name) return null;
  
  const normalized = name.trim().toLowerCase();
  
  const existing = await db
    .select()
    .from(denominations)
    .where(ilike(denominations.name, normalized))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  const [created] = await db
    .insert(denominations)
    .values({
      name: name.trim(),
    })
    .returning();
  
  return created.id;
}

/**
 * Process catalog references for a coin type
 */
export async function processCatalogReferences(
  coinTypeId: string,
  referenceText: string
): Promise<number> {
  if (!referenceText) return 0;
  
  const refs = extractCatalogReferences(referenceText);
  let created = 0;
  
  for (const ref of refs) {
    try {
      const existing = await db
        .select()
        .from(catalogReferences)
        .where(
          and(
            eq(catalogReferences.coinTypeId, coinTypeId),
            eq(catalogReferences.catalogType, ref.catalogType),
            eq(catalogReferences.catalogNumber, ref.catalogNumber)
          )
        )
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(catalogReferences).values({
          coinTypeId,
          catalogType: ref.catalogType,
          catalogNumber: ref.catalogNumber,
          volume: ref.volume,
          isPrimary: created === 0,
        });
        created++;
      }
    } catch (error) {
      console.error(`Error creating catalog ref for ${coinTypeId}:`, error);
    }
  }
  
  return created;
}

/**
 * Run normalization pipeline on all coin types
 */
export async function runNormalizationPipeline(
  limit: number = 1000,
  onProgress?: (progress: { processed: number; total: number }) => void
): Promise<NormalizationResult> {
  const result: NormalizationResult = {
    processed: 0,
    rulersMapped: 0,
    mintsMapped: 0,
    denominationsMapped: 0,
    catalogRefsMapped: 0,
    errors: [],
  };
  
  try {
    const coins = await db
      .select()
      .from(coinTypes)
      .limit(limit);
    
    for (const coin of coins) {
      try {
        // Process ruler/authority
        if (coin.authority || coin.label) {
          const rulerName = coin.authority || extractRulerFromLabel(coin.label);
          if (rulerName) {
            await findOrCreateRuler(rulerName);
            result.rulersMapped++;
          }
        }
        
        // Process mint
        if (coin.mint) {
          await findOrCreateMint(coin.mint);
          result.mintsMapped++;
        }
        
        // Process denomination
        if (coin.denomination) {
          await findOrCreateDenomination(coin.denomination);
          result.denominationsMapped++;
        }
        
        // Extract and create catalog references
        if (coin.referenceText) {
          const refsCreated = await processCatalogReferences(coin.id, coin.referenceText);
          result.catalogRefsMapped += refsCreated;
        }
        
        result.processed++;
        
        if (onProgress && result.processed % 50 === 0) {
          onProgress({ processed: result.processed, total: coins.length });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Coin ${coin.id}: ${errorMsg}`);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Pipeline error: ${errorMsg}`);
  }
  
  return result;
}

/**
 * Extract ruler name from coin label
 */
function extractRulerFromLabel(label: string): string | null {
  const patterns = [
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /under\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  ];
  
  for (const pattern of patterns) {
    const match = label.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Calculate entity resolution confidence score
 */
export function calculateMatchConfidence(
  source: string,
  target: string
): number {
  if (!source || !target) return 0;
  
  const s = source.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  
  if (s === t) return 1.0;
  if (s.includes(t) || t.includes(s)) return 0.8;
  
  // Levenshtein-based similarity
  const distance = levenshteinDistance(s, t);
  const maxLen = Math.max(s.length, t.length);
  const similarity = 1 - distance / maxLen;
  
  return Math.max(0, Math.min(1, similarity));
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

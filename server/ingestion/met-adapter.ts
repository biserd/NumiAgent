// Met Museum Collection API Adapter
// Fetches CC0 coin data from the Metropolitan Museum's Open Access API

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface MetObject {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  department: string;
  objectName: string;
  title: string;
  culture: string;
  period: string;
  dynasty: string;
  reign: string;
  portfolio: string;
  artistDisplayName: string;
  artistDisplayBio: string;
  objectDate: string;
  objectBeginDate: number;
  objectEndDate: number;
  medium: string;
  dimensions: string;
  creditLine: string;
  geographyType: string;
  city: string;
  state: string;
  county: string;
  country: string;
  region: string;
  classification: string;
  rightsAndReproduction: string;
  linkResource: string;
  metadataDate: string;
  repository: string;
  objectURL: string;
  tags: Array<{ term: string; AAT_URL: string; Wikidata_URL: string }>;
}

interface MetSearchResponse {
  total: number;
  objectIDs: number[];
}

const MET_API_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
const SOURCE_ID = "met-museum";

export async function searchMetCoins(query: string = "coin"): Promise<number[]> {
  try {
    // Search without department filter to get more results
    // The Met has coins across multiple departments
    const url = `${MET_API_BASE}/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("Met API search error:", response.status);
      return [];
    }
    
    const data: MetSearchResponse = await response.json();
    return data.objectIDs || [];
  } catch (error) {
    console.error("Met API search failed:", error);
    return [];
  }
}

export async function getMetObject(objectId: number): Promise<MetObject | null> {
  try {
    const url = `${MET_API_BASE}/objects/${objectId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error(`Met API fetch error for ${objectId}:`, error);
    return null;
  }
}

function isCoin(obj: MetObject): boolean {
  const coinKeywords = ["coin", "medal", "medallion", "token", "numismatic"];
  const searchableText = [
    obj.objectName,
    obj.title,
    obj.classification,
  ].join(" ").toLowerCase();
  
  return coinKeywords.some(keyword => searchableText.includes(keyword));
}

function parseMetDate(obj: MetObject): { dateFrom: number | null; dateTo: number | null } {
  return {
    dateFrom: obj.objectBeginDate || null,
    dateTo: obj.objectEndDate || null,
  };
}

function buildLabel(obj: MetObject): string {
  const parts = [obj.title];
  if (obj.reign) parts.push(`(${obj.reign})`);
  if (obj.culture && !obj.title.toLowerCase().includes(obj.culture.toLowerCase())) {
    parts.push(`- ${obj.culture}`);
  }
  return parts.join(" ").trim();
}

export function transformMetObjectToCoinType(obj: MetObject): InsertCoinType | null {
  if (!obj.isPublicDomain) {
    return null;
  }
  
  if (!isCoin(obj)) {
    return null;
  }
  
  const { dateFrom, dateTo } = parseMetDate(obj);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.objectID.toString(),
    sourceUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
    label: buildLabel(obj),
    dateFrom,
    dateTo,
    obvLegend: obj.reign || obj.dynasty || null,
    revLegend: null,
    referenceText: obj.medium || null,
    imageUrl: obj.primaryImage || obj.primaryImageSmall || null,
    isSample: false,
  };
}

export function buildMetRightsRecord(obj: MetObject): InsertRightsRecord {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.objectID.toString(),
    sourceUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
    licenseMetadata: "CC0",
    licenseImages: obj.isPublicDomain ? "CC0" : "ALL_RIGHTS_RESERVED",
    commercialOk: obj.isPublicDomain,
    rehostOk: obj.isPublicDomain,
    cacheOk: obj.isPublicDomain,
    embedOk: obj.isPublicDomain,
    computeEmbeddingsOk: obj.isPublicDomain,
    attributionText: `${obj.creditLine || "The Metropolitan Museum of Art"}, CC0`,
    rightsStatementUrl: "https://www.metmuseum.org/about-the-met/policies-and-documents/open-access",
  };
}

export interface IngestionProgress {
  total: number;
  processed: number;
  ingested: number;
  skipped: number;
  errors: number;
}

export async function* ingestMetCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  // Search for numismatic items - more targeted than broad "coin" search
  // This returns ~200 items which is manageable
  const numismaticIds = await searchMetCoins("numismatic");
  
  // Use numismatic search results, capped at limit
  const idsToProcess = numismaticIds.slice(0, limit);
  
  const progress: IngestionProgress = {
    total: idsToProcess.length,
    processed: 0,
    ingested: 0,
    skipped: 0,
    errors: 0,
  };
  
  for (const objectId of idsToProcess) {
    await new Promise(resolve => setTimeout(resolve, 80));
    
    const obj = await getMetObject(objectId);
    progress.processed++;
    
    if (!obj) {
      progress.errors++;
      onProgress?.(progress);
      continue;
    }
    
    const coinType = transformMetObjectToCoinType(obj);
    
    if (!coinType) {
      progress.skipped++;
      onProgress?.(progress);
      continue;
    }
    
    const rights = buildMetRightsRecord(obj);
    progress.ingested++;
    onProgress?.(progress);
    
    yield { coinType, rights };
  }
}

export const MetAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchMetCoins,
  getObject: getMetObject,
  transform: transformMetObjectToCoinType,
  buildRights: buildMetRightsRecord,
  ingest: ingestMetCoins,
};

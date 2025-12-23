// Walters Art Museum Open Data Adapter
// Fetches CC0 coin data from the Walters Art Museum API
// API Docs: https://api.thewalters.org/

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface WaltersObject {
  ObjectID: number;
  ObjectNumber: string;
  Title: string;
  DisplayDate: string;
  DateBeginYear: number;
  DateEndYear: number;
  Medium: string;
  Dimensions: string;
  CreditLine: string;
  Provenance: string;
  Classification: string;
  ObjectName: string;
  Culture: string;
  Dynasty: string;
  Reign: string;
  Period: string;
  GeographyType: string;
  City: string;
  State: string;
  County: string;
  Country: string;
  Region: string;
  Subregion: string;
  Description: string;
  PrimaryImage: {
    Tiny: string;
    Small: string;
    Medium: string;
    Large: string;
    Raw: string;
  };
  ResourceURL: string;
  PublicAccessDate: string;
  Copyright: string | null;
}

interface WaltersResponse {
  Items: WaltersObject[];
  PageSize: number;
  Page: number;
  Pages: number;
  Total: number;
}

interface IngestionProgress {
  processed: number;
  total: number;
  currentRecord?: string;
}

const WALTERS_API_BASE = "https://api.thewalters.org/v1";
const SOURCE_ID = "walters";

export async function searchWaltersCoins(
  page: number = 1,
  pageSize: number = 25
): Promise<{ objects: WaltersObject[]; total: number; pages: number }> {
  try {
    const params = new URLSearchParams({
      Classification: "Coins",
      pageSize: pageSize.toString(),
      page: page.toString(),
      orderBy: "ObjectID",
    });
    
    const url = `${WALTERS_API_BASE}/objects.json?${params}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error("Walters API search error:", response.status);
      return { objects: [], total: 0, pages: 0 };
    }
    
    const data: WaltersResponse = await response.json();
    return {
      objects: data.Items || [],
      total: data.Total || 0,
      pages: data.Pages || 0,
    };
  } catch (error) {
    console.error("Walters API search failed:", error);
    return { objects: [], total: 0, pages: 0 };
  }
}

export async function getWaltersObject(objectId: number): Promise<WaltersObject | null> {
  try {
    const url = `${WALTERS_API_BASE}/objects/${objectId}.json`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.Data || null;
  } catch (error) {
    console.error(`Walters API fetch error for ${objectId}:`, error);
    return null;
  }
}

function isCoin(obj: WaltersObject): boolean {
  const coinKeywords = ["coin", "medal", "medallion", "token", "numismatic"];
  
  const searchableText = [
    obj.Classification,
    obj.ObjectName,
    obj.Title,
  ].filter(Boolean).join(" ").toLowerCase();
  
  return coinKeywords.some(keyword => searchableText.includes(keyword));
}

function getImageUrl(obj: WaltersObject): string | null {
  if (obj.PrimaryImage) {
    return obj.PrimaryImage.Large || obj.PrimaryImage.Medium || obj.PrimaryImage.Small || null;
  }
  return null;
}

function buildLabel(obj: WaltersObject): string {
  const parts = [obj.Title];
  
  if (obj.Reign && !obj.Title.includes(obj.Reign)) {
    parts.push(`(${obj.Reign})`);
  }
  
  if (obj.Culture && !obj.Title.toLowerCase().includes(obj.Culture.toLowerCase())) {
    parts.push(`- ${obj.Culture}`);
  }
  
  return parts.join(" ").trim();
}

function extractMetal(medium: string | null): string | undefined {
  if (!medium) return undefined;
  
  const metals = ["gold", "silver", "bronze", "copper", "brass", "electrum", "billon"];
  const lowerMedium = medium.toLowerCase();
  
  for (const metal of metals) {
    if (lowerMedium.includes(metal)) {
      return metal.charAt(0).toUpperCase() + metal.slice(1);
    }
  }
  
  return undefined;
}

function extractDenomination(title: string, objectName: string): string | undefined {
  const denominations = [
    "denarius", "aureus", "sestertius", "as", "dupondius", "quadrans",
    "antoninianus", "solidus", "tremissis", "siliqua", "follis",
    "tetradrachm", "drachm", "stater", "obol", "hemidrachm",
    "shekel", "prutah", "lepton"
  ];
  
  const searchText = `${title} ${objectName}`.toLowerCase();
  
  for (const denom of denominations) {
    if (searchText.includes(denom)) {
      return denom.charAt(0).toUpperCase() + denom.slice(1);
    }
  }
  
  return undefined;
}

export function transformWaltersObjectToCoinType(obj: WaltersObject): InsertCoinType | null {
  if (!isCoin(obj)) {
    return null;
  }
  
  const imageUrl = getImageUrl(obj);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.ObjectID.toString(),
    sourceUrl: obj.ResourceURL || `https://art.thewalters.org/detail/${obj.ObjectID}`,
    label: buildLabel(obj),
    dateFrom: obj.DateBeginYear || null,
    dateTo: obj.DateEndYear || null,
    imageUrl,
    authority: obj.Reign || obj.Dynasty || undefined,
    mint: obj.City || obj.Region || obj.Country || undefined,
    metal: extractMetal(obj.Medium),
    denomination: extractDenomination(obj.Title, obj.ObjectName),
    obvLegend: undefined,
    revLegend: undefined,
    referenceText: obj.Description || obj.Provenance,
  };
}

export function buildWaltersRightsRecord(obj: WaltersObject): InsertRightsRecord {
  const isCC0 = !obj.Copyright || obj.Copyright.toLowerCase().includes("public domain");
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.ObjectID.toString(),
    sourceUrl: obj.ResourceURL || `https://art.thewalters.org/detail/${obj.ObjectID}`,
    licenseMetadata: isCC0 ? "CC0" : "UNKNOWN",
    licenseImages: isCC0 ? "CC0" : "UNKNOWN",
    commercialOk: isCC0,
    rehostOk: isCC0,
    cacheOk: isCC0,
    embedOk: isCC0,
    computeEmbeddingsOk: isCC0,
    derivativeOk: isCC0,
    attributionText: obj.CreditLine || "The Walters Art Museum",
    attributionUrl: obj.ResourceURL,
    rightsStatementUrl: "https://thewalters.org/open-access/",
  };
}

export async function* ingestWaltersCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  let page = 1;
  let totalProcessed = 0;
  const pageSize = 25;
  
  while (totalProcessed < limit) {
    const { objects, total, pages } = await searchWaltersCoins(page, pageSize);
    
    if (objects.length === 0) break;
    
    for (const obj of objects) {
      if (totalProcessed >= limit) break;
      
      const coinType = transformWaltersObjectToCoinType(obj);
      if (!coinType) continue;
      
      const rights = buildWaltersRightsRecord(obj);
      
      if (rights.licenseImages !== "CC0") continue;
      
      totalProcessed++;
      
      if (onProgress) {
        onProgress({
          processed: totalProcessed,
          total: Math.min(total, limit),
          currentRecord: obj.ObjectID.toString(),
        });
      }
      
      yield { coinType, rights };
    }
    
    if (page >= pages) break;
    page++;
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

export const WaltersAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchWaltersCoins,
  getById: getWaltersObject,
  transform: transformWaltersObjectToCoinType,
  buildRights: buildWaltersRightsRecord,
  ingest: ingestWaltersCoins,
};

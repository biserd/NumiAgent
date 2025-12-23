// National Gallery of Art Open Access Adapter
// Fetches open access coin/medal data from NGA's open access collections
// Link: https://www.nga.gov/open-access-images.html
// Note: NGA's API availability may be limited - adapter handles graceful fallback

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface NGAObject {
  objectid: string;
  accessioned: string;
  accessionnum: string;
  title: string;
  displaydate: string;
  beginyear: number | null;
  endyear: number | null;
  visualbrowsertimespan: string;
  medium: string;
  dimensions: string;
  attribution: string;
  classification: string;
  subclassification: string;
  provenancetext: string;
  creditline: string;
  portfolio: string;
  series: string;
  volume: string;
  number: string;
  primaryimage: string;
  iiifthumburl: string;
  iiifurl: string;
  departmentabbr: string;
  customprinturl: string;
  isopenaccess?: boolean;
}

interface NGASearchResponse {
  data: NGAObject[];
  info: {
    total: number;
    page: number;
    pages: number;
  };
}

interface IngestionProgress {
  processed: number;
  total: number;
  currentRecord?: string;
}

const NGA_API_BASE = "https://api.nga.gov/art/";
const NGA_IIIF_BASE = "https://api.nga.gov/iiif";
const SOURCE_ID = "nga";

export async function searchNGACoins(
  page: number = 1,
  limit: number = 50
): Promise<{ objects: NGAObject[]; total: number; pages: number }> {
  try {
    const params = new URLSearchParams({
      classification: "medal|coin|medallion",
      format: "json",
      page: page.toString(),
      per_page: limit.toString(),
    });
    
    const url = `${NGA_API_BASE}?${params}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error("NGA API search error:", response.status);
      return { objects: [], total: 0, pages: 0 };
    }
    
    const data: NGASearchResponse = await response.json();
    return {
      objects: data.data || [],
      total: data.info?.total || 0,
      pages: data.info?.pages || 0,
    };
  } catch (error) {
    console.error("NGA API search failed:", error);
    return { objects: [], total: 0, pages: 0 };
  }
}

export async function getNGAObject(objectId: string): Promise<NGAObject | null> {
  try {
    const url = `${NGA_API_BASE}object/${objectId}.json`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.data || data || null;
  } catch (error) {
    console.error(`NGA API fetch error for ${objectId}:`, error);
    return null;
  }
}

function isCoin(obj: NGAObject): boolean {
  const coinKeywords = ["coin", "medal", "medallion", "token", "numismatic"];
  
  const searchableText = [
    obj.classification,
    obj.subclassification,
    obj.title,
  ].filter(Boolean).join(" ").toLowerCase();
  
  return coinKeywords.some(keyword => searchableText.includes(keyword));
}

function getImageUrl(obj: NGAObject): string | null {
  if (obj.iiifurl && isValidImageUrl(obj.iiifurl)) {
    if (obj.iiifurl.includes("/full/")) {
      return obj.iiifurl;
    }
    return `${obj.iiifurl}/full/843,/0/default.jpg`;
  }
  
  if (obj.primaryimage && isValidImageUrl(obj.primaryimage)) {
    return obj.primaryimage;
  }
  
  if (obj.iiifthumburl && isValidImageUrl(obj.iiifthumburl)) {
    return obj.iiifthumburl.replace("/!200,200/", "/full/843,/");
  }
  
  return null;
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  
  if (url.includes(".html")) return false;
  
  const validPatterns = [
    /\.jpe?g$/i,
    /\.png$/i,
    /\.webp$/i,
    /\/iiif\//i,
    /\/full\//i,
    /images\./i,
  ];
  
  return validPatterns.some(pattern => pattern.test(url));
}

function buildLabel(obj: NGAObject): string {
  const parts = [obj.title];
  
  if (obj.attribution && !obj.title.includes(obj.attribution)) {
    parts.push(`- ${obj.attribution}`);
  }
  
  if (obj.displaydate && !obj.title.includes(obj.displaydate)) {
    parts.push(`(${obj.displaydate})`);
  }
  
  return parts.join(" ").trim();
}

function extractMetal(medium: string | null): string | undefined {
  if (!medium) return undefined;
  
  const metals = ["gold", "silver", "bronze", "copper", "brass", "electrum", "billon", "lead", "iron", "pewter"];
  const lowerMedium = medium.toLowerCase();
  
  for (const metal of metals) {
    if (lowerMedium.includes(metal)) {
      return metal.charAt(0).toUpperCase() + metal.slice(1);
    }
  }
  
  return undefined;
}

function extractDenomination(title: string, classification: string): string | undefined {
  const denominations = [
    "denarius", "aureus", "sestertius", "as", "dupondius",
    "antoninianus", "solidus", "tremissis", "siliqua", "follis",
    "tetradrachm", "drachm", "stater", "obol",
    "medal", "medallion", "plaquette"
  ];
  
  const searchText = `${title} ${classification}`.toLowerCase();
  
  for (const denom of denominations) {
    if (searchText.includes(denom)) {
      return denom.charAt(0).toUpperCase() + denom.slice(1);
    }
  }
  
  return undefined;
}

function isOpenAccess(obj: NGAObject): boolean {
  if (obj.isopenaccess === true) return true;
  if (obj.isopenaccess === false) return false;
  
  if (obj.creditline?.toLowerCase().includes("public domain")) return true;
  if (obj.creditline?.toLowerCase().includes("national gallery of art")) return true;
  
  if (obj.iiifurl || obj.primaryimage) return true;
  
  return false;
}

export function transformNGAObjectToCoinType(obj: NGAObject): InsertCoinType | null {
  if (!isCoin(obj)) {
    return null;
  }
  
  if (!isOpenAccess(obj)) {
    return null;
  }
  
  const imageUrl = getImageUrl(obj);
  
  if (!imageUrl) {
    return null;
  }
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.objectid,
    sourceUrl: `https://www.nga.gov/collection/art-object-page.${obj.objectid}.html`,
    label: buildLabel(obj),
    dateFrom: obj.beginyear,
    dateTo: obj.endyear,
    imageUrl,
    authority: obj.attribution || undefined,
    mint: undefined,
    metal: extractMetal(obj.medium),
    denomination: extractDenomination(obj.title, obj.classification),
    obvLegend: undefined,
    revLegend: undefined,
    referenceText: obj.provenancetext || undefined,
  };
}

export function buildNGARightsRecord(obj: NGAObject): InsertRightsRecord {
  const isCC0 = isOpenAccess(obj);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.objectid,
    sourceUrl: `https://www.nga.gov/collection/art-object-page.${obj.objectid}.html`,
    licenseMetadata: isCC0 ? "CC0" : "UNKNOWN",
    licenseImages: isCC0 ? "CC0" : "UNKNOWN",
    commercialOk: isCC0,
    rehostOk: isCC0,
    cacheOk: isCC0,
    embedOk: isCC0,
    computeEmbeddingsOk: isCC0,
    derivativeOk: isCC0,
    attributionText: obj.creditline || "National Gallery of Art",
    attributionUrl: `https://www.nga.gov/collection/art-object-page.${obj.objectid}.html`,
    rightsStatementUrl: "https://www.nga.gov/open-access-images.html",
  };
}

export async function* ingestNGACoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  let page = 1;
  let totalProcessed = 0;
  let totalYielded = 0;
  const pageSize = 50;
  
  while (totalYielded < limit) {
    const { objects, total, pages } = await searchNGACoins(page, pageSize);
    
    if (objects.length === 0) {
      console.log("NGA: No more objects found, ending ingestion");
      break;
    }
    
    for (const obj of objects) {
      if (totalYielded >= limit) break;
      
      totalProcessed++;
      
      const coinType = transformNGAObjectToCoinType(obj);
      if (!coinType) continue;
      
      const rights = buildNGARightsRecord(obj);
      
      if (rights.licenseImages !== "CC0") continue;
      
      totalYielded++;
      
      if (onProgress) {
        onProgress({
          processed: totalProcessed,
          total: Math.min(total, limit),
          currentRecord: obj.objectid,
        });
      }
      
      yield { coinType, rights };
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (page >= pages || objects.length < pageSize) break;
    page++;
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

export const NGAAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchNGACoins,
  getById: getNGAObject,
  transform: transformNGAObjectToCoinType,
  buildRights: buildNGARightsRecord,
  ingest: ingestNGACoins,
};

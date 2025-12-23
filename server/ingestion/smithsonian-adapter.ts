// Smithsonian Open Access Adapter
// Fetches CC0 coin data from the Smithsonian Open Access API
// API Docs: https://www.si.edu/openaccess

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface SmithsonianRecord {
  id: string;
  title: string;
  unitCode: string;
  type: string;
  url: string;
  content: {
    descriptiveNonRepeating?: {
      title?: { content: string };
      unit_code?: string;
      record_link?: string;
      guid?: string;
      online_media?: {
        media?: Array<{
          type: string;
          content: string;
          thumbnail?: string;
        }>;
      };
    };
    indexedStructured?: {
      date?: string[];
      name?: string[];
      culture?: string[];
      place?: string[];
      topic?: string[];
      object_type?: string[];
      material?: string[];
    };
    freetext?: {
      physicalDescription?: Array<{ content: string }>;
      notes?: Array<{ content: string }>;
      creditLine?: Array<{ content: string }>;
      date?: Array<{ content: string }>;
      name?: Array<{ content: string }>;
      place?: Array<{ content: string }>;
      setName?: Array<{ content: string }>;
    };
  };
}

interface SmithsonianSearchResponse {
  response: {
    rowCount: number;
    rows: SmithsonianRecord[];
  };
}

interface IngestionProgress {
  processed: number;
  total: number;
  currentRecord?: string;
}

const SI_API_BASE = "https://api.si.edu/openaccess/api/v1.0";
const SOURCE_ID = "smithsonian";

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.SMITHSONIAN_API_KEY;
  if (!apiKey) {
    console.warn("SMITHSONIAN_API_KEY not set - API requests may be rate limited");
    return "";
  }
  return apiKey;
}

export async function searchSmithsonianCoins(
  query: string = "coin",
  start: number = 0,
  rows: number = 50
): Promise<{ records: SmithsonianRecord[]; total: number }> {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      q: query,
      start: start.toString(),
      rows: rows.toString(),
      api_key: apiKey,
    });
    
    const url = `${SI_API_BASE}/search?${params}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error("Smithsonian API search error:", response.status);
      return { records: [], total: 0 };
    }
    
    const data: SmithsonianSearchResponse = await response.json();
    return {
      records: data.response?.rows || [],
      total: data.response?.rowCount || 0,
    };
  } catch (error) {
    console.error("Smithsonian API search failed:", error);
    return { records: [], total: 0 };
  }
}

export async function getSmithsonianRecord(id: string): Promise<SmithsonianRecord | null> {
  try {
    const url = `${SI_API_BASE}/content/${id}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.response?.content || null;
  } catch (error) {
    console.error(`Smithsonian API fetch error for ${id}:`, error);
    return null;
  }
}

function isCoin(record: SmithsonianRecord): boolean {
  const coinKeywords = ["coin", "medal", "medallion", "token", "numismatic", "denarius", "sestertius", "aureus", "drachm"];
  
  const searchableText = [
    record.title,
    record.content?.indexedStructured?.object_type?.join(" "),
    record.content?.indexedStructured?.topic?.join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
  
  return coinKeywords.some(keyword => searchableText.includes(keyword));
}

function parseDate(record: SmithsonianRecord): { dateFrom: number | null; dateTo: number | null } {
  const dates = record.content?.indexedStructured?.date || [];
  const freetextDates = record.content?.freetext?.date?.map(d => d.content) || [];
  
  const allDates = [...dates, ...freetextDates];
  
  for (const dateStr of allDates) {
    const bcMatch = dateStr.match(/(\d+)\s*(?:BC|BCE)/i);
    if (bcMatch) {
      return { dateFrom: -parseInt(bcMatch[1]), dateTo: -parseInt(bcMatch[1]) };
    }
    
    const adMatch = dateStr.match(/(\d+)\s*(?:AD|CE)?/i);
    if (adMatch) {
      const year = parseInt(adMatch[1]);
      if (year > 0 && year < 2000) {
        return { dateFrom: year, dateTo: year };
      }
    }
    
    const rangeMatch = dateStr.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      return { dateFrom: parseInt(rangeMatch[1]), dateTo: parseInt(rangeMatch[2]) };
    }
  }
  
  return { dateFrom: null, dateTo: null };
}

function getImageUrl(record: SmithsonianRecord): string | null {
  const media = record.content?.descriptiveNonRepeating?.online_media?.media;
  if (media && media.length > 0) {
    return media[0].content || media[0].thumbnail || null;
  }
  return null;
}

function buildLabel(record: SmithsonianRecord): string {
  const parts = [record.title];
  
  const names = record.content?.indexedStructured?.name || [];
  if (names.length > 0 && !record.title.includes(names[0])) {
    parts.push(`- ${names[0]}`);
  }
  
  return parts.join(" ").trim();
}

export function transformSmithsonianRecordToCoinType(record: SmithsonianRecord): InsertCoinType | null {
  if (!isCoin(record)) {
    return null;
  }
  
  const { dateFrom, dateTo } = parseDate(record);
  const imageUrl = getImageUrl(record);
  
  const structured = record.content?.indexedStructured;
  const freetext = record.content?.freetext;
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.url || record.content?.descriptiveNonRepeating?.record_link || `https://collections.si.edu/search/detail/${record.id}`,
    label: buildLabel(record),
    dateFrom,
    dateTo,
    imageUrl,
    authority: structured?.name?.[0] || freetext?.name?.[0]?.content,
    mint: structured?.place?.[0] || freetext?.place?.[0]?.content,
    metal: structured?.material?.[0],
    denomination: undefined,
    obvLegend: undefined,
    revLegend: undefined,
    referenceText: freetext?.notes?.[0]?.content,
  };
}

export function buildSmithsonianRightsRecord(record: SmithsonianRecord): InsertRightsRecord {
  const creditLine = record.content?.freetext?.creditLine?.[0]?.content;
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.url || `https://collections.si.edu/search/detail/${record.id}`,
    licenseMetadata: "CC0",
    licenseImages: "CC0",
    commercialOk: true,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    derivativeOk: true,
    attributionText: creditLine || "Smithsonian Institution",
    attributionUrl: record.url,
    rightsStatementUrl: "https://www.si.edu/openaccess",
  };
}

export async function* ingestSmithsonianCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  // Use a single broad "coin" query to access all 380k+ coin records
  const query = "coin";
  let totalProcessed = 0;
  let totalYielded = 0;
  let start = 0;
  const batchSize = 100; // Larger batch size for efficiency
  
  // First, get the total count
  const { total: grandTotal } = await searchSmithsonianCoins(query, 0, 1);
  console.log(`[INFO] Smithsonian collection has ${grandTotal} coin records available`);
  
  while (totalYielded < limit) {
    const { records, total } = await searchSmithsonianCoins(query, start, batchSize);
    
    if (records.length === 0) {
      console.log(`[INFO] No more records from Smithsonian at offset ${start}`);
      break;
    }
    
    for (const record of records) {
      if (totalYielded >= limit) break;
      
      totalProcessed++;
      
      const coinType = transformSmithsonianRecordToCoinType(record);
      if (!coinType) continue;
      
      const rights = buildSmithsonianRightsRecord(record);
      
      totalYielded++;
      
      if (onProgress) {
        onProgress({
          processed: totalProcessed,
          total: Math.min(grandTotal, limit),
          currentRecord: record.id,
        });
      }
      
      yield { coinType, rights };
    }
    
    start += batchSize;
    
    if (start >= total) {
      console.log(`[INFO] Reached end of Smithsonian collection at offset ${start}`);
      break;
    }
    
    // Rate limiting - be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`[INFO] Smithsonian ingestion complete: ${totalProcessed} processed, ${totalYielded} yielded`);
}

export const SmithsonianAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchSmithsonianCoins,
  getById: getSmithsonianRecord,
  transform: transformSmithsonianRecordToCoinType,
  buildRights: buildSmithsonianRightsRecord,
  ingest: ingestSmithsonianCoins,
};

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

export async function searchSmithsonianCoins(
  query: string = "coin numismatic",
  start: number = 0,
  rows: number = 50
): Promise<{ records: SmithsonianRecord[]; total: number }> {
  try {
    const params = new URLSearchParams({
      q: query,
      start: start.toString(),
      rows: rows.toString(),
      online_visual_material: "true",
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
  const queries = [
    "coin ancient",
    "medal ancient",
    "numismatic roman",
    "numismatic greek",
  ];
  
  let totalProcessed = 0;
  
  for (const query of queries) {
    if (totalProcessed >= limit) break;
    
    let start = 0;
    const batchSize = 50;
    
    while (totalProcessed < limit) {
      const { records, total } = await searchSmithsonianCoins(query, start, batchSize);
      
      if (records.length === 0) break;
      
      for (const record of records) {
        if (totalProcessed >= limit) break;
        
        const coinType = transformSmithsonianRecordToCoinType(record);
        if (!coinType) continue;
        
        const rights = buildSmithsonianRightsRecord(record);
        
        totalProcessed++;
        
        if (onProgress) {
          onProgress({
            processed: totalProcessed,
            total: Math.min(total, limit),
            currentRecord: record.id,
          });
        }
        
        yield { coinType, rights };
      }
      
      start += batchSize;
      
      if (start >= total) break;
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

export const SmithsonianAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchSmithsonianCoins,
  getById: getSmithsonianRecord,
  transform: transformSmithsonianRecordToCoinType,
  buildRights: buildSmithsonianRightsRecord,
  ingest: ingestSmithsonianCoins,
};

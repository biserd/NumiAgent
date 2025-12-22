// IKMK Berlin (Münzkabinett) Adapter
// Fetches coin data from Berlin Münzkabinett's numismatic collection API

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface IKMKObject {
  id: string;
  title: string;
  region?: string;
  authority?: string;
  denomination?: string;
  mint?: string;
  material?: string;
  weight?: string;
  diameter?: string;
  axis?: string;
  dateFrom?: string;
  dateTo?: string;
  dateText?: string;
  obverseDescription?: string;
  reverseDescription?: string;
  obvLegend?: string;
  revLegend?: string;
  referenceText?: string;
  inventoryNumber?: string;
  imageUrlObverse?: string;
  imageUrlReverse?: string;
  permalink?: string;
}

const IKMK_API_BASE = "https://ikmk.smb.museum";
const SOURCE_ID = "ikmk-berlin";

async function fetchIKMKList(
  offset: number = 0, 
  limit: number = 100
): Promise<{ objects: IKMKObject[]; total: number }> {
  try {
    const url = `${IKMK_API_BASE}/nummis/objectdata?offset=${offset}&limit=${limit}&format=json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("IKMK API error:", response.status);
      return { objects: [], total: 0 };
    }
    
    const data = await response.json();
    return {
      objects: data.objects || [],
      total: data.total || 0,
    };
  } catch (error) {
    console.error("IKMK API fetch failed:", error);
    return { objects: [], total: 0 };
  }
}

function parseIKMKDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const num = parseInt(dateStr, 10);
  return isNaN(num) ? null : num;
}

function buildLabel(obj: IKMKObject): string {
  const parts = [];
  if (obj.title) parts.push(obj.title);
  if (obj.authority && !obj.title?.includes(obj.authority)) {
    parts.push(`(${obj.authority})`);
  }
  if (obj.denomination && !obj.title?.includes(obj.denomination)) {
    parts.push(`- ${obj.denomination}`);
  }
  return parts.join(" ").trim() || obj.id;
}

export function transformIKMKObjectToCoinType(obj: IKMKObject): InsertCoinType {
  const dateFrom = parseIKMKDate(obj.dateFrom);
  const dateTo = parseIKMKDate(obj.dateTo);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.id,
    sourceUrl: obj.permalink || `${IKMK_API_BASE}/object?id=${obj.id}`,
    label: buildLabel(obj),
    dateFrom,
    dateTo,
    obvLegend: obj.obvLegend || obj.obverseDescription || null,
    revLegend: obj.revLegend || obj.reverseDescription || null,
    referenceText: obj.referenceText || obj.inventoryNumber || null,
    imageUrl: obj.imageUrlObverse || obj.imageUrlReverse || null,
    isSample: false,
  };
}

export function buildIKMKRightsRecord(obj: IKMKObject): InsertRightsRecord {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: obj.id,
    sourceUrl: obj.permalink || `${IKMK_API_BASE}/object?id=${obj.id}`,
    licenseMetadata: "CC_BY",
    licenseImages: "CC_BY",
    commercialOk: true,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    attributionText: "Münzkabinett, Staatliche Museen zu Berlin, CC BY",
    rightsStatementUrl: "https://creativecommons.org/licenses/by/4.0/",
  };
}

export interface IngestionProgress {
  total: number;
  processed: number;
  ingested: number;
  skipped: number;
  errors: number;
}

export async function* ingestIKMKCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  let offset = 0;
  const batchSize = 50;
  
  const progress: IngestionProgress = {
    total: 0,
    processed: 0,
    ingested: 0,
    skipped: 0,
    errors: 0,
  };
  
  while (progress.ingested < limit) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const { objects, total } = await fetchIKMKList(offset, batchSize);
    
    if (progress.total === 0) {
      progress.total = Math.min(total, limit);
    }
    
    if (objects.length === 0) {
      break;
    }
    
    for (const obj of objects) {
      if (progress.ingested >= limit) break;
      
      progress.processed++;
      
      if (!obj.id) {
        progress.errors++;
        onProgress?.(progress);
        continue;
      }
      
      const coinType = transformIKMKObjectToCoinType(obj);
      const rights = buildIKMKRightsRecord(obj);
      
      progress.ingested++;
      onProgress?.(progress);
      
      yield { coinType, rights };
    }
    
    offset += batchSize;
  }
}

export const IKMKAdapter = {
  sourceId: SOURCE_ID,
  fetchList: fetchIKMKList,
  transform: transformIKMKObjectToCoinType,
  buildRights: buildIKMKRightsRecord,
  ingest: ingestIKMKCoins,
};

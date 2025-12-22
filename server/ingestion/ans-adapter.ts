// American Numismatic Society (ANS) MANTIS Collection Adapter
// Fetches coin data from ANS's open data API at numismatics.org

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";
import { parseStringPromise } from "xml2js";

interface ANSCoinRecord {
  id: string;
  title: string;
  obverse?: {
    legend?: string;
    description?: string;
    portrait?: string;
  };
  reverse?: {
    legend?: string;
    description?: string;
    type?: string;
  };
  authority?: {
    label?: string;
    uri?: string;
  };
  mint?: {
    label?: string;
    uri?: string;
  };
  denomination?: {
    label?: string;
    uri?: string;
  };
  material?: {
    label?: string;
    uri?: string;
  };
  weight?: number;
  diameter?: number;
  axis?: number;
  dateRange?: {
    fromDate?: number;
    toDate?: number;
  };
  reference?: string;
  collection?: string;
  imageUrl?: string;
  sourceUrl?: string;
}

interface AtomEntry {
  id: string[];
  title: string[];
  link?: Array<{ $: { href: string } }>;
  summary?: string[];
  content?: string[];
}

interface AtomFeed {
  feed: {
    entry?: AtomEntry[];
    'opensearch:totalResults'?: string[];
  };
}

const ANS_API_BASE = "http://numismatics.org/search";
const SOURCE_ID = "ans-mantis";

export async function searchANSCoins(
  query: string = "coin",
  start: number = 0
): Promise<{ entries: AtomEntry[]; total: number }> {
  try {
    const url = `${ANS_API_BASE}/apis/search?q=${encodeURIComponent(query)}&format=atom&start=${start}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/atom+xml',
      },
    });
    
    if (!response.ok) {
      console.error("ANS API search error:", response.status);
      return { entries: [], total: 0 };
    }
    
    const text = await response.text();
    const result: AtomFeed = await parseStringPromise(text);
    
    const entries = result.feed?.entry || [];
    const total = parseInt(result.feed?.['opensearch:totalResults']?.[0] || '0', 10);
    
    return { entries, total };
  } catch (error) {
    console.error("ANS API search failed:", error);
    return { entries: [], total: 0 };
  }
}

export async function getANSCoinById(id: string): Promise<ANSCoinRecord | null> {
  try {
    const url = `${ANS_API_BASE}/id/${id}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/ld+json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return parseJSONLDToRecord(id, data);
  } catch (error) {
    console.error(`ANS API fetch error for ${id}:`, error);
    return null;
  }
}

function parseJSONLDToRecord(id: string, data: any): ANSCoinRecord {
  const record: ANSCoinRecord = {
    id,
    title: data['dcterms:title'] || data['@id'] || id,
    sourceUrl: `${ANS_API_BASE}/id/${id}`,
  };
  
  if (data['nmo:hasObverse']) {
    const obv = data['nmo:hasObverse'];
    record.obverse = {
      legend: obv['nmo:hasLegend'] || undefined,
      description: obv['dcterms:description'] || undefined,
    };
  }
  
  if (data['nmo:hasReverse']) {
    const rev = data['nmo:hasReverse'];
    record.reverse = {
      legend: rev['nmo:hasLegend'] || undefined,
      description: rev['dcterms:description'] || undefined,
    };
  }
  
  if (data['nmo:hasAuthority']) {
    const auth = data['nmo:hasAuthority'];
    record.authority = {
      label: typeof auth === 'string' ? auth : auth['rdfs:label'] || auth['@id'],
      uri: typeof auth === 'string' ? undefined : auth['@id'],
    };
  }
  
  if (data['nmo:hasMint']) {
    const mint = data['nmo:hasMint'];
    record.mint = {
      label: typeof mint === 'string' ? mint : mint['rdfs:label'] || mint['@id'],
      uri: typeof mint === 'string' ? undefined : mint['@id'],
    };
  }
  
  if (data['nmo:hasDenomination']) {
    const denom = data['nmo:hasDenomination'];
    record.denomination = {
      label: typeof denom === 'string' ? denom : denom['rdfs:label'] || denom['@id'],
      uri: typeof denom === 'string' ? undefined : denom['@id'],
    };
  }
  
  if (data['nmo:hasMaterial']) {
    const mat = data['nmo:hasMaterial'];
    record.material = {
      label: typeof mat === 'string' ? mat : mat['rdfs:label'] || mat['@id'],
      uri: typeof mat === 'string' ? undefined : mat['@id'],
    };
  }
  
  if (data['nmo:hasWeight']) {
    const weight = data['nmo:hasWeight'];
    record.weight = typeof weight === 'number' ? weight : parseFloat(weight?.['@value'] || weight);
  }
  
  if (data['nmo:hasDiameter']) {
    const diameter = data['nmo:hasDiameter'];
    record.diameter = typeof diameter === 'number' ? diameter : parseFloat(diameter?.['@value'] || diameter);
  }
  
  if (data['nmo:hasAxis']) {
    const axis = data['nmo:hasAxis'];
    record.axis = typeof axis === 'number' ? axis : parseInt(axis?.['@value'] || axis, 10);
  }
  
  if (data['nmo:hasStartDate'] || data['nmo:hasEndDate']) {
    record.dateRange = {
      fromDate: parseDate(data['nmo:hasStartDate']),
      toDate: parseDate(data['nmo:hasEndDate']),
    };
  }
  
  if (data['dcterms:isReferencedBy']) {
    const ref = data['dcterms:isReferencedBy'];
    record.reference = Array.isArray(ref) ? ref.join('; ') : ref;
  }
  
  if (data['foaf:depiction']) {
    const depiction = data['foaf:depiction'];
    record.imageUrl = typeof depiction === 'string' ? depiction : depiction?.['@id'] || depiction?.[0]?.['@id'];
  }
  
  return record;
}

function parseDate(dateValue: any): number | undefined {
  if (!dateValue) return undefined;
  
  if (typeof dateValue === 'number') return dateValue;
  
  const value = dateValue['@value'] || dateValue;
  if (typeof value === 'string') {
    const year = parseInt(value, 10);
    if (!isNaN(year)) return year;
  }
  
  return undefined;
}

function parseAtomEntryId(entry: AtomEntry): string {
  const idUrl = entry.id?.[0] || '';
  const match = idUrl.match(/\/id\/([^\/]+)$/);
  return match ? match[1] : idUrl.split('/').pop() || '';
}

export function transformANSRecordToCoinType(record: ANSCoinRecord): InsertCoinType {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.sourceUrl || `${ANS_API_BASE}/id/${record.id}`,
    label: record.title,
    dateFrom: record.dateRange?.fromDate || null,
    dateTo: record.dateRange?.toDate || null,
    obvLegend: record.obverse?.legend || null,
    revLegend: record.reverse?.legend || null,
    referenceText: record.reference || null,
    imageUrl: record.imageUrl || null,
    isSample: false,
    
    weightG: record.weight?.toString() || null,
    diameterMm: record.diameter?.toString() || null,
    dieAxis: record.axis || null,
    condition: null,
    purity: null,
    
    obvType: record.obverse?.description || null,
    revType: record.reverse?.description || null,
    controlMarks: null,
    
    authority: record.authority?.label || null,
    issuer: null,
    mint: record.mint?.label || null,
    denomination: record.denomination?.label || null,
    metal: record.material?.label || null,
    region: null,
  };
}

export function buildANSRightsRecord(record: ANSCoinRecord): InsertRightsRecord {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.sourceUrl || `${ANS_API_BASE}/id/${record.id}`,
    licenseMetadata: "ODBL",
    licenseImages: "CC_BY_NC_SA",
    commercialOk: false,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    attributionText: "American Numismatic Society",
    rightsStatementUrl: "http://numismatics.org/search/",
  };
}

export interface IngestionProgress {
  total: number;
  processed: number;
  ingested: number;
  skipped: number;
  errors: number;
}

export async function* ingestANSCoins(
  query: string = "department_facet:Greek OR department_facet:Roman",
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  const { entries, total } = await searchANSCoins(query, 0);
  
  const progress: IngestionProgress = {
    total: Math.min(entries.length, limit),
    processed: 0,
    ingested: 0,
    skipped: 0,
    errors: 0,
  };
  
  const entriesToProcess = entries.slice(0, limit);
  
  for (const entry of entriesToProcess) {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const id = parseAtomEntryId(entry);
    if (!id) {
      progress.errors++;
      progress.processed++;
      onProgress?.(progress);
      continue;
    }
    
    const record = await getANSCoinById(id);
    progress.processed++;
    
    if (!record) {
      progress.errors++;
      onProgress?.(progress);
      continue;
    }
    
    const coinType = transformANSRecordToCoinType(record);
    const rights = buildANSRightsRecord(record);
    
    progress.ingested++;
    onProgress?.(progress);
    
    yield { coinType, rights };
  }
}

export const ANSAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchANSCoins,
  getById: getANSCoinById,
  transform: transformANSRecordToCoinType,
  buildRights: buildANSRightsRecord,
  ingest: ingestANSCoins,
};

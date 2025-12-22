// British Museum Collection Adapter
// Fetches coin data from British Museum's SPARQL endpoint

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface BMCoinRecord {
  id: string;
  title: string;
  objectUri: string;
  description?: string;
  material?: string;
  dateText?: string;
  dateFrom?: number;
  dateTo?: number;
  culture?: string;
  region?: string;
  mint?: string;
  denomination?: string;
  authority?: string;
  obvDescription?: string;
  revDescription?: string;
  obvLegend?: string;
  revLegend?: string;
  weight?: number;
  diameter?: number;
  imageUrl?: string;
  reference?: string;
}

interface SPARQLBinding {
  type: string;
  value: string;
}

interface SPARQLResult {
  results: {
    bindings: Array<Record<string, SPARQLBinding>>;
  };
}

const BM_SPARQL_ENDPOINT = "https://collection.britishmuseum.org/sparql.json";
const SOURCE_ID = "british-museum";

const COIN_QUERY = `
PREFIX crm: <http://erlangen-crm.org/current/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT DISTINCT ?object ?title ?description ?material ?dateText ?culture ?region ?imageUrl
WHERE {
  ?object a crm:E22_Man-Made_Object .
  ?object rdfs:label ?title .
  
  # Filter for coins/medals department or numismatic objects
  OPTIONAL { ?object crm:P2_has_type ?type . ?type rdfs:label ?typeLabel }
  OPTIONAL { ?object dcterms:description ?description }
  OPTIONAL { ?object crm:P45_consists_of ?mat . ?mat rdfs:label ?material }
  OPTIONAL { ?object crm:P108i_was_produced_by ?prod . ?prod crm:P4_has_time-span ?ts . ?ts rdfs:label ?dateText }
  OPTIONAL { ?object crm:P108i_was_produced_by ?prod2 . ?prod2 crm:P14_carried_out_by ?actor . ?actor rdfs:label ?culture }
  OPTIONAL { ?object crm:P108i_was_produced_by ?prod3 . ?prod3 crm:P7_took_place_at ?place . ?place rdfs:label ?region }
  OPTIONAL { ?object foaf:depiction ?imageUrl }
  
  FILTER(
    CONTAINS(LCASE(?title), "coin") || 
    CONTAINS(LCASE(?title), "medal") ||
    CONTAINS(LCASE(?title), "denarius") ||
    CONTAINS(LCASE(?title), "aureus") ||
    CONTAINS(LCASE(?title), "sestertius") ||
    CONTAINS(LCASE(?title), "tetradrachm") ||
    CONTAINS(LCASE(?title), "stater") ||
    CONTAINS(LCASE(?title), "drachm")
  )
}
LIMIT %LIMIT%
OFFSET %OFFSET%
`;

export async function searchBMCoins(
  limit: number = 100,
  offset: number = 0
): Promise<BMCoinRecord[]> {
  try {
    const query = COIN_QUERY
      .replace('%LIMIT%', limit.toString())
      .replace('%OFFSET%', offset.toString());
    
    const url = `${BM_SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/sparql-results+json',
      },
    });
    
    if (!response.ok) {
      console.error("BM SPARQL error:", response.status);
      return [];
    }
    
    const data: SPARQLResult = await response.json();
    
    return data.results.bindings.map(binding => {
      const objectUri = binding.object?.value || '';
      const id = extractIdFromUri(objectUri);
      
      return {
        id,
        objectUri,
        title: binding.title?.value || '',
        description: binding.description?.value,
        material: binding.material?.value,
        dateText: binding.dateText?.value,
        dateFrom: parseBMDate(binding.dateText?.value)?.from,
        dateTo: parseBMDate(binding.dateText?.value)?.to,
        culture: binding.culture?.value,
        region: binding.region?.value,
        imageUrl: binding.imageUrl?.value,
      };
    });
  } catch (error) {
    console.error("BM SPARQL search failed:", error);
    return [];
  }
}

function extractIdFromUri(uri: string): string {
  const match = uri.match(/\/object\/([^\/]+)$/);
  return match ? match[1] : uri.split('/').pop() || uri;
}

function parseBMDate(dateText?: string): { from: number; to: number } | null {
  if (!dateText) return null;
  
  const bcMatch = dateText.match(/(\d+)\s*(?:BC|BCE)/i);
  const adMatch = dateText.match(/(\d+)\s*(?:AD|CE)/i);
  const rangeMatch = dateText.match(/(\d+)\s*-\s*(\d+)/);
  
  if (bcMatch) {
    const year = -parseInt(bcMatch[1], 10);
    return { from: year, to: year };
  }
  
  if (adMatch) {
    const year = parseInt(adMatch[1], 10);
    return { from: year, to: year };
  }
  
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    const isBC = dateText.toLowerCase().includes('bc');
    return {
      from: isBC ? -from : from,
      to: isBC ? -to : to,
    };
  }
  
  const centuryMatch = dateText.match(/(\d+)(?:st|nd|rd|th)\s*century/i);
  if (centuryMatch) {
    const century = parseInt(centuryMatch[1], 10);
    const isBC = dateText.toLowerCase().includes('bc');
    const startYear = (century - 1) * 100;
    return {
      from: isBC ? -(startYear + 99) : startYear + 1,
      to: isBC ? -(startYear) : startYear + 100,
    };
  }
  
  return null;
}

function extractLegendFromDescription(description?: string): { obv?: string; rev?: string } {
  if (!description) return {};
  
  const obvMatch = description.match(/obverse[:\s]+([^.;]+)/i);
  const revMatch = description.match(/reverse[:\s]+([^.;]+)/i);
  
  return {
    obv: obvMatch ? obvMatch[1].trim() : undefined,
    rev: revMatch ? revMatch[1].trim() : undefined,
  };
}

export function transformBMRecordToCoinType(record: BMCoinRecord): InsertCoinType {
  const legends = extractLegendFromDescription(record.description);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.objectUri || `http://collection.britishmuseum.org/id/object/${record.id}`,
    label: record.title,
    dateFrom: record.dateFrom || null,
    dateTo: record.dateTo || null,
    obvLegend: legends.obv || record.obvLegend || null,
    revLegend: legends.rev || record.revLegend || null,
    referenceText: record.reference || null,
    imageUrl: record.imageUrl || null,
    isSample: false,
    
    weightG: record.weight?.toString() || null,
    diameterMm: record.diameter?.toString() || null,
    dieAxis: null,
    condition: null,
    purity: null,
    
    obvType: record.obvDescription || null,
    revType: record.revDescription || null,
    controlMarks: null,
    
    authority: record.authority || record.culture || null,
    issuer: null,
    mint: record.mint || null,
    denomination: record.denomination || null,
    metal: record.material || null,
    region: record.region || null,
  };
}

export function buildBMRightsRecord(record: BMCoinRecord): InsertRightsRecord {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.objectUri || `http://collection.britishmuseum.org/id/object/${record.id}`,
    licenseMetadata: "CC_BY_NC_SA",
    licenseImages: "CC_BY_NC_SA",
    commercialOk: false,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    attributionText: "The Trustees of the British Museum",
    rightsStatementUrl: "http://collection.britishmuseum.org/Licensing",
  };
}

export interface IngestionProgress {
  total: number;
  processed: number;
  ingested: number;
  skipped: number;
  errors: number;
}

export async function* ingestBMCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  const records = await searchBMCoins(limit, 0);
  
  const progress: IngestionProgress = {
    total: records.length,
    processed: 0,
    ingested: 0,
    skipped: 0,
    errors: 0,
  };
  
  for (const record of records) {
    progress.processed++;
    
    if (!record.title || !record.id) {
      progress.skipped++;
      onProgress?.(progress);
      continue;
    }
    
    try {
      const coinType = transformBMRecordToCoinType(record);
      const rights = buildBMRightsRecord(record);
      
      progress.ingested++;
      onProgress?.(progress);
      
      yield { coinType, rights };
    } catch (error) {
      progress.errors++;
      onProgress?.(progress);
    }
  }
}

export const BMAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchBMCoins,
  transform: transformBMRecordToCoinType,
  buildRights: buildBMRightsRecord,
  ingest: ingestBMCoins,
};

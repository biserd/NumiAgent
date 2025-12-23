// Nomisma.org Adapter
// Fetches Linked Open Data from Nomisma.org and related projects (OCRE, CRRO)
// Uses SPARQL queries for structured numismatic data
// License: CC-BY (commercial use allowed with attribution)

import type { InsertCoinType, InsertRightsRecord, InsertEntity, InsertEntityEdge } from "@shared/schema";

const NOMISMA_SPARQL = "https://nomisma.org/query";
const OCRE_SPARQL = "https://numismatics.org/ocre/query";
const CRRO_SPARQL = "https://numismatics.org/crro/query";

const SOURCE_ID = "nomisma";
const RATE_LIMIT_MS = 1000;

interface SPARQLBinding {
  [key: string]: { type: string; value: string };
}

interface SPARQLResult {
  results: {
    bindings: SPARQLBinding[];
  };
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeSPARQL(endpoint: string, query: string): Promise<SPARQLBinding[]> {
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("output", "json");
  
  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/sparql-results+json",
      "User-Agent": "NumisVault/1.0 (https://numis-vault.replit.app)"
    }
  });
  
  if (!response.ok) {
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
  }
  
  const data: SPARQLResult = await response.json();
  return data.results?.bindings || [];
}

function extractId(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

function parseYear(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/-?(\d+)/);
  if (match) {
    const year = parseInt(match[0], 10);
    return isNaN(year) ? undefined : year;
  }
  return undefined;
}

// Query to fetch all Roman rulers/authorities from Nomisma
const RULERS_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?uri ?label ?start ?end ?wikidata WHERE {
  ?uri a foaf:Person ;
       skos:prefLabel ?label .
  FILTER(LANG(?label) = "en" || LANG(?label) = "")
  OPTIONAL { ?uri org:hasMembership/org:memberDuring/nmo:hasStartDate ?start }
  OPTIONAL { ?uri org:hasMembership/org:memberDuring/nmo:hasEndDate ?end }
  OPTIONAL { ?uri skos:exactMatch ?wikidata . FILTER(CONTAINS(STR(?wikidata), "wikidata.org")) }
}
LIMIT 1000
`;

// Query to fetch all mints from Nomisma
const MINTS_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT DISTINCT ?uri ?label ?lat ?lon ?pleiades WHERE {
  ?uri a nmo:Mint ;
       skos:prefLabel ?label .
  FILTER(LANG(?label) = "en" || LANG(?label) = "")
  OPTIONAL { ?uri geo:lat ?lat }
  OPTIONAL { ?uri geo:long ?lon }
  OPTIONAL { ?uri skos:exactMatch ?pleiades . FILTER(CONTAINS(STR(?pleiades), "pleiades.stoa.org")) }
}
LIMIT 1000
`;

// Query to fetch denominations from Nomisma
const DENOMINATIONS_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>

SELECT DISTINCT ?uri ?label ?broader WHERE {
  ?uri a nmo:Denomination ;
       skos:prefLabel ?label .
  FILTER(LANG(?label) = "en" || LANG(?label) = "")
  OPTIONAL { ?uri skos:broader ?broader }
}
LIMIT 500
`;

// Query to fetch metals/materials from Nomisma
const MATERIALS_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>

SELECT DISTINCT ?uri ?label WHERE {
  ?uri a nmo:Material ;
       skos:prefLabel ?label .
  FILTER(LANG(?label) = "en" || LANG(?label) = "")
}
LIMIT 100
`;

// Query to fetch coin types from OCRE (Roman Imperial)
const OCRE_TYPES_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?type ?label ?authority ?mint ?denomination ?material ?obvDesc ?revDesc ?startDate ?endDate ?image WHERE {
  ?type a nmo:TypeSeriesItem ;
        skos:prefLabel ?label .
  OPTIONAL { ?type nmo:hasAuthority ?authority }
  OPTIONAL { ?type nmo:hasMint ?mint }
  OPTIONAL { ?type nmo:hasDenomination ?denomination }
  OPTIONAL { ?type nmo:hasMaterial ?material }
  OPTIONAL { ?type nmo:hasObverse/dcterms:description ?obvDesc . FILTER(LANG(?obvDesc) = "en" || LANG(?obvDesc) = "") }
  OPTIONAL { ?type nmo:hasReverse/dcterms:description ?revDesc . FILTER(LANG(?revDesc) = "en" || LANG(?revDesc) = "") }
  OPTIONAL { ?type nmo:hasStartDate ?startDate }
  OPTIONAL { ?type nmo:hasEndDate ?endDate }
  OPTIONAL { ?type foaf:depiction ?image }
}
LIMIT 500
OFFSET {offset}
`;

// Query to fetch coin types from CRRO (Roman Republican)
const CRRO_TYPES_QUERY = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT DISTINCT ?type ?label ?authority ?mint ?denomination ?material ?obvDesc ?revDesc ?startDate ?endDate ?image WHERE {
  ?type a nmo:TypeSeriesItem ;
        skos:prefLabel ?label .
  OPTIONAL { ?type nmo:hasAuthority ?authority }
  OPTIONAL { ?type nmo:hasMint ?mint }
  OPTIONAL { ?type nmo:hasDenomination ?denomination }
  OPTIONAL { ?type nmo:hasMaterial ?material }
  OPTIONAL { ?type nmo:hasObverse/dcterms:description ?obvDesc . FILTER(LANG(?obvDesc) = "en" || LANG(?obvDesc) = "") }
  OPTIONAL { ?type nmo:hasReverse/dcterms:description ?revDesc . FILTER(LANG(?revDesc) = "en" || LANG(?revDesc) = "") }
  OPTIONAL { ?type nmo:hasStartDate ?startDate }
  OPTIONAL { ?type nmo:hasEndDate ?endDate }
  OPTIONAL { ?type foaf:depiction ?image }
}
LIMIT 500
OFFSET {offset}
`;

export class NomismaAdapter {
  
  static async *ingestEntities(
    entityType: 'rulers' | 'mints' | 'denominations' | 'materials',
    limit: number = 100
  ): AsyncGenerator<InsertEntity> {
    let query: string;
    let endpoint = NOMISMA_SPARQL;
    let type: 'PERSON' | 'MINT' | 'DENOMINATION' | 'METAL';
    
    switch (entityType) {
      case 'rulers':
        query = RULERS_QUERY;
        type = 'PERSON';
        break;
      case 'mints':
        query = MINTS_QUERY;
        type = 'MINT';
        break;
      case 'denominations':
        query = DENOMINATIONS_QUERY;
        type = 'DENOMINATION';
        break;
      case 'materials':
        query = MATERIALS_QUERY;
        type = 'METAL';
        break;
    }
    
    console.log(`[nomisma] Fetching ${entityType} from Nomisma SPARQL...`);
    
    try {
      const bindings = await executeSPARQL(endpoint, query);
      console.log(`[nomisma] Got ${bindings.length} ${entityType} results`);
      
      let count = 0;
      for (const binding of bindings) {
        if (count >= limit) break;
        
        const uri = binding.uri?.value;
        const label = binding.label?.value;
        
        // Skip bindings without valid URI or label (handles blank nodes)
        if (!uri || !label || uri.startsWith('_:') || !uri.startsWith('http')) {
          console.log(`[nomisma] Skipping invalid binding: uri=${uri}, label=${label}`);
          continue;
        }
        
        const entity: InsertEntity = {
          type,
          label: label.trim(),
          nomismaUri: uri,
          wikidataQid: binding.wikidata?.value ? extractId(binding.wikidata.value) : undefined,
          pleiadesUri: binding.pleiades?.value || undefined,
          isSample: false,
        };
        
        count++;
        yield entity;
        
        if (count % 50 === 0) {
          console.log(`[nomisma] Processed ${count} ${entityType}`);
        }
      }
      
      console.log(`[nomisma] Completed ingesting ${count} ${entityType}`);
    } catch (error) {
      console.error(`[nomisma] Error fetching ${entityType}:`, error);
      throw error;
    }
  }
  
  static async *ingest(
    limit: number = 100,
    corpus: 'ocre' | 'crro' = 'ocre'
  ): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
    const endpoint = corpus === 'ocre' ? OCRE_SPARQL : CRRO_SPARQL;
    const queryTemplate = corpus === 'ocre' ? OCRE_TYPES_QUERY : CRRO_TYPES_QUERY;
    
    console.log(`[nomisma] Starting ${corpus.toUpperCase()} coin type ingestion (limit: ${limit})`);
    
    let offset = 0;
    let totalYielded = 0;
    const batchSize = 500;
    
    while (totalYielded < limit) {
      const query = queryTemplate.replace('{offset}', offset.toString());
      
      console.log(`[nomisma] Fetching ${corpus.toUpperCase()} types, offset ${offset}...`);
      
      try {
        await delay(RATE_LIMIT_MS);
        const bindings = await executeSPARQL(endpoint, query);
        
        if (bindings.length === 0) {
          console.log(`[nomisma] No more results at offset ${offset}`);
          break;
        }
        
        console.log(`[nomisma] Got ${bindings.length} coin types`);
        
        for (const binding of bindings) {
          if (totalYielded >= limit) break;
          
          const typeUri = binding.type?.value;
          const label = binding.label?.value;
          
          if (!typeUri || !label) continue;
          
          const recordId = extractId(typeUri);
          const authorityUri = binding.authority?.value;
          const mintUri = binding.mint?.value;
          const denomUri = binding.denomination?.value;
          const materialUri = binding.material?.value;
          
          const coinType: InsertCoinType = {
            sourceId: SOURCE_ID,
            sourceRecordId: recordId,
            sourceUrl: typeUri,
            label,
            authority: authorityUri ? extractId(authorityUri) : undefined,
            mint: mintUri ? extractId(mintUri) : undefined,
            denomination: denomUri ? extractId(denomUri) : undefined,
            metal: materialUri ? extractId(materialUri) : undefined,
            obvType: binding.obvDesc?.value,
            revType: binding.revDesc?.value,
            dateFrom: parseYear(binding.startDate?.value),
            dateTo: parseYear(binding.endDate?.value),
            imageUrl: binding.image?.value,
            isSample: false,
          };
          
          const rights: InsertRightsRecord = {
            sourceId: SOURCE_ID,
            sourceRecordId: recordId,
            sourceUrl: typeUri,
            licenseMetadata: 'CC_BY',
            licenseImages: binding.image?.value ? 'CC_BY' : 'UNKNOWN',
            commercialOk: true,
            rehostOk: true,
            cacheOk: true,
            embedOk: true,
            computeEmbeddingsOk: true,
            derivativeOk: true,
            attributionText: corpus === 'ocre' 
              ? 'Online Coins of the Roman Empire (OCRE), American Numismatic Society'
              : 'Coinage of the Roman Republic Online (CRRO), American Numismatic Society',
            attributionUrl: typeUri,
          };
          
          totalYielded++;
          yield { coinType, rights };
          
          if (totalYielded % 50 === 0) {
            console.log(`[nomisma] Progress: ${totalYielded}/${limit} coin types`);
          }
        }
        
        offset += batchSize;
        
      } catch (error) {
        console.error(`[nomisma] SPARQL error at offset ${offset}:`, error);
        throw error;
      }
    }
    
    console.log(`[nomisma] Completed: ${totalYielded} coin types ingested from ${corpus.toUpperCase()}`);
  }
  
  static async *ingestEdges(
    limit: number = 100
  ): AsyncGenerator<InsertEntityEdge> {
    console.log(`[nomisma] Fetching entity relationships...`);
    
    const edgeQuery = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX org: <http://www.w3.org/ns/org#>

SELECT DISTINCT ?ruler ?mint ?denomination ?material WHERE {
  {
    ?type a nmo:TypeSeriesItem ;
          nmo:hasAuthority ?ruler ;
          nmo:hasMint ?mint .
  } UNION {
    ?type a nmo:TypeSeriesItem ;
          nmo:hasAuthority ?ruler ;
          nmo:hasDenomination ?denomination .
  } UNION {
    ?type a nmo:TypeSeriesItem ;
          nmo:hasMint ?mint ;
          nmo:hasDenomination ?denomination .
  } UNION {
    ?type a nmo:TypeSeriesItem ;
          nmo:hasDenomination ?denomination ;
          nmo:hasMaterial ?material .
  }
}
LIMIT ${limit}
`;
    
    try {
      const bindings = await executeSPARQL(NOMISMA_SPARQL, edgeQuery);
      console.log(`[nomisma] Got ${bindings.length} relationship bindings`);
      
      let count = 0;
      const seenEdges = new Set<string>();
      
      for (const binding of bindings) {
        const ruler = binding.ruler?.value;
        const mint = binding.mint?.value;
        const denomination = binding.denomination?.value;
        const material = binding.material?.value;
        
        if (ruler && mint) {
          const edgeKey = `${ruler}|${mint}|MINTED_AT`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            yield {
              srcId: extractId(ruler),
              dstId: extractId(mint),
              edgeType: 'MINTED_AT',
              provenance: 'nomisma.org',
              metadata: { rulerUri: ruler, mintUri: mint }
            };
            count++;
          }
        }
        
        if (ruler && denomination) {
          const edgeKey = `${ruler}|${denomination}|HAS_DENOMINATION`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            yield {
              srcId: extractId(ruler),
              dstId: extractId(denomination),
              edgeType: 'HAS_DENOMINATION',
              provenance: 'nomisma.org',
              metadata: { rulerUri: ruler, denominationUri: denomination }
            };
            count++;
          }
        }
        
        if (mint && denomination) {
          const edgeKey = `${mint}|${denomination}|HAS_DENOMINATION`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            yield {
              srcId: extractId(mint),
              dstId: extractId(denomination),
              edgeType: 'HAS_DENOMINATION',
              provenance: 'nomisma.org',
              metadata: { mintUri: mint, denominationUri: denomination }
            };
            count++;
          }
        }
        
        if (denomination && material) {
          const edgeKey = `${denomination}|${material}|HAS_METAL`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            yield {
              srcId: extractId(denomination),
              dstId: extractId(material),
              edgeType: 'HAS_METAL',
              provenance: 'nomisma.org',
              metadata: { denominationUri: denomination, materialUri: material }
            };
            count++;
          }
        }
      }
      
      console.log(`[nomisma] Generated ${count} unique edges`);
    } catch (error) {
      console.error(`[nomisma] Error fetching edges:`, error);
      throw error;
    }
  }
  
  static async getStats(): Promise<{
    rulers: number;
    mints: number;
    denominations: number;
    materials: number;
  }> {
    const countQuery = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX nmo: <http://nomisma.org/ontology#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT 
  (COUNT(DISTINCT ?person) AS ?rulers)
  (COUNT(DISTINCT ?mint) AS ?mints)
  (COUNT(DISTINCT ?denom) AS ?denominations)
  (COUNT(DISTINCT ?material) AS ?materials)
WHERE {
  { ?person a foaf:Person }
  UNION { ?mint a nmo:Mint }
  UNION { ?denom a nmo:Denomination }
  UNION { ?material a nmo:Material }
}
`;
    
    try {
      const bindings = await executeSPARQL(NOMISMA_SPARQL, countQuery);
      if (bindings.length > 0) {
        const b = bindings[0];
        return {
          rulers: parseInt(b.rulers?.value || '0', 10),
          mints: parseInt(b.mints?.value || '0', 10),
          denominations: parseInt(b.denominations?.value || '0', 10),
          materials: parseInt(b.materials?.value || '0', 10),
        };
      }
    } catch (error) {
      console.error(`[nomisma] Error getting stats:`, error);
    }
    
    return { rulers: 0, mints: 0, denominations: 0, materials: 0 };
  }
}

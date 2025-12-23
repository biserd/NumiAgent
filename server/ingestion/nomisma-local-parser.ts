/**
 * Nomisma Local RDF Parser
 * 
 * Parses the local Nomisma data dump from GitHub to extract entities
 * (rulers, mints, denominations, materials) without relying on SPARQL queries.
 * 
 * Data format: RDF/XML files in nomisma-data/id/ directory
 * License: CC-BY (commercial use allowed with attribution)
 */

import { createReadStream, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import type { InsertEntity } from '@shared/schema';

const NOMISMA_DATA_DIR = 'nomisma-data/id';

// RDF namespace URIs
const NMO = 'http://nomisma.org/ontology#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const GEO = 'http://www.w3.org/2003/01/geo/wgs84_pos#';
const DCTERMS = 'http://purl.org/dc/terms/';

// Entity type mappings from RDF types
const ENTITY_TYPE_MAP: Record<string, string> = {
  [`${NMO}Mint`]: 'mint',
  [`${NMO}Denomination`]: 'denomination',
  [`${NMO}Material`]: 'metal',
  [`${FOAF}Person`]: 'ruler',
  [`${FOAF}Organization`]: 'authority',
};

interface ParsedEntity {
  uri: string;
  type: string | null;
  label: string | null;
  definition: string | null;
  wikidataQid: string | null;
  pleiadesUri: string | null;
  hasMaterial: string | null;
  broader: string | null;
  isPartOf: string | null;
  lat: number | null;
  lng: number | null;
}

interface Triple {
  subject: { value: string };
  predicate: { value: string };
  object: { value: string; language?: string };
}

/**
 * Parse a single RDF/XML file and extract entity data
 */
async function parseRdfFile(filePath: string): Promise<ParsedEntity | null> {
  return new Promise((resolve, reject) => {
    const parser = new RdfXmlParser();
    const entity: ParsedEntity = {
      uri: '',
      type: null,
      label: null,
      definition: null,
      wikidataQid: null,
      pleiadesUri: null,
      hasMaterial: null,
      broader: null,
      isPartOf: null,
      lat: null,
      lng: null,
    };

    let mainSubject = '';

    parser.on('data', (quad: Triple) => {
      const subjectUri = quad.subject.value;
      const predicate = quad.predicate.value;
      const objectValue = quad.object.value;
      const lang = quad.object.language;

      // Track main subject (first nomisma.org/id/ URI)
      if (!mainSubject && subjectUri.startsWith('http://nomisma.org/id/') && !subjectUri.includes('#')) {
        mainSubject = subjectUri;
        entity.uri = subjectUri;
      }

      // Only process triples about the main subject
      if (subjectUri !== mainSubject) return;

      // Extract entity type
      if (predicate === `${RDF}type`) {
        const mappedType = ENTITY_TYPE_MAP[objectValue];
        if (mappedType) {
          entity.type = mappedType;
        }
      }

      // Extract English label
      if (predicate === `${SKOS}prefLabel` && lang === 'en') {
        entity.label = objectValue;
      }

      // Extract English definition
      if (predicate === `${SKOS}definition` && lang === 'en') {
        entity.definition = objectValue;
      }

      // Extract Wikidata QID
      if ((predicate === `${SKOS}exactMatch` || predicate === `${SKOS}closeMatch`) &&
          objectValue.includes('wikidata.org/entity/')) {
        const match = objectValue.match(/Q\d+/);
        if (match) {
          entity.wikidataQid = match[0];
        }
      }

      // Extract Pleiades URI
      if ((predicate === `${SKOS}exactMatch` || predicate === `${SKOS}closeMatch`) &&
          objectValue.includes('pleiades.stoa.org/places/')) {
        entity.pleiadesUri = objectValue;
      }

      // Extract material link for denominations
      if (predicate === `${NMO}hasMaterial`) {
        entity.hasMaterial = objectValue;
      }

      // Extract broader relationship (hierarchical parent)
      if (predicate === `${SKOS}broader` && objectValue.startsWith('http://nomisma.org/id/')) {
        entity.broader = objectValue;
      }

      // Extract isPartOf relationship (category membership)
      if (predicate === `${DCTERMS}isPartOf` && objectValue.startsWith('http://nomisma.org/id/')) {
        entity.isPartOf = objectValue;
      }
    });

    parser.on('error', (error: Error) => {
      console.error(`Error parsing ${filePath}:`, error.message);
      resolve(null);
    });

    parser.on('end', () => {
      if (entity.uri && entity.label && entity.type) {
        resolve(entity);
      } else {
        resolve(null);
      }
    });

    const stream = createReadStream(filePath, { encoding: 'utf8' });
    stream.on('error', (error) => {
      console.error(`Error reading ${filePath}:`, error.message);
      resolve(null);
    });
    stream.pipe(parser);
  });
}

/**
 * Get list of all RDF files in the Nomisma data directory
 */
export function getNomismaDataFiles(): string[] {
  if (!existsSync(NOMISMA_DATA_DIR)) {
    console.log('[nomisma-local] Data directory not found:', NOMISMA_DATA_DIR);
    return [];
  }

  const files = readdirSync(NOMISMA_DATA_DIR)
    .filter(f => f.endsWith('.rdf'))
    .map(f => join(NOMISMA_DATA_DIR, f));

  console.log(`[nomisma-local] Found ${files.length} RDF files`);
  return files;
}

/**
 * Check if local Nomisma data is available
 */
export function isLocalDataAvailable(): boolean {
  return existsSync(NOMISMA_DATA_DIR);
}

// Cache for stats to avoid recounting every time
let cachedStats: { available: boolean; totalFiles: number; rulers: number; mints: number; denominations: number; materials: number } | null = null;
let statsCacheTime: number = 0;
const STATS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get stats about available local Nomisma data
 * Processes all files for accurate counts (cached for 1 hour)
 */
export async function getLocalDataStats(): Promise<{
  available: boolean;
  totalFiles: number;
  rulers: number;
  mints: number;
  denominations: number;
  materials: number;
}> {
  if (!isLocalDataAvailable()) {
    return { available: false, totalFiles: 0, rulers: 0, mints: 0, denominations: 0, materials: 0 };
  }

  // Return cached stats if still valid
  if (cachedStats && Date.now() - statsCacheTime < STATS_CACHE_TTL) {
    return cachedStats;
  }

  const files = getNomismaDataFiles();
  const counts = { ruler: 0, mint: 0, denomination: 0, metal: 0, authority: 0, other: 0 };
  
  // Process all files for accurate counts
  console.log(`[nomisma-local] Counting entities in ${files.length} files...`);
  let processed = 0;
  
  for (const file of files) {
    try {
      const entity = await parseRdfFile(file);
      if (entity?.type) {
        counts[entity.type as keyof typeof counts] = (counts[entity.type as keyof typeof counts] || 0) + 1;
      } else {
        counts.other++;
      }
      processed++;
      
      if (processed % 2000 === 0) {
        console.log(`[nomisma-local] Processed ${processed}/${files.length} files`);
      }
    } catch (error) {
      // Skip files that fail to parse
    }
  }

  console.log(`[nomisma-local] Count complete: ${counts.ruler} rulers, ${counts.mint} mints, ${counts.denomination} denominations, ${counts.metal} materials`);
  
  cachedStats = {
    available: true,
    totalFiles: files.length,
    rulers: counts.ruler + counts.authority, // Include authorities with rulers
    mints: counts.mint,
    denominations: counts.denomination,
    materials: counts.metal,
  };
  statsCacheTime = Date.now();
  
  return cachedStats;
}

/**
 * Generator function to ingest entities of a specific type from local RDF files
 */
export async function* ingestEntitiesFromLocal(
  entityType: 'ruler' | 'mint' | 'denomination' | 'metal',
  limit: number = 1000
): AsyncGenerator<InsertEntity> {
  const files = getNomismaDataFiles();
  let count = 0;
  let processed = 0;

  console.log(`[nomisma-local] Starting ${entityType} ingestion from ${files.length} files`);

  for (const file of files) {
    if (count >= limit) break;
    
    try {
      const entity = await parseRdfFile(file);
      processed++;

      if (entity && entity.type === entityType) {
        const insertEntity: InsertEntity = {
          type: entityType,
          label: entity.label!,
          nomismaUri: entity.uri,
          wikidataQid: entity.wikidataQid || undefined,
          pleiadesUri: entity.pleiadesUri || undefined,
          isSample: false,
        };

        count++;
        yield insertEntity;

        if (count % 100 === 0) {
          console.log(`[nomisma-local] Processed ${processed} files, found ${count} ${entityType}`);
        }
      }
    } catch (error) {
      console.error(`[nomisma-local] Error processing ${file}:`, error);
    }
  }

  console.log(`[nomisma-local] Completed: found ${count} ${entityType} from ${processed} files`);
}

/**
 * Relationship info extracted from RDF files (needs entity ID resolution before becoming edges)
 */
interface RelationshipInfo {
  sourceUri: string;
  targetUri: string;
  edgeType: string;
}

/**
 * Generator function to extract relationship info from local RDF files
 * These need to be resolved to entity IDs before creating edges
 */
export async function* extractRelationshipsFromLocal(
  limit: number = 5000
): AsyncGenerator<RelationshipInfo> {
  const files = getNomismaDataFiles();
  let count = 0;
  let processed = 0;

  console.log(`[nomisma-local] Starting relationship extraction from ${files.length} files`);

  for (const file of files) {
    if (count >= limit) break;
    
    try {
      const entity = await parseRdfFile(file);
      processed++;

      if (!entity) continue;

      // For denominations, extract HAS_METAL relationships
      if (entity.type === 'denomination' && entity.hasMaterial) {
        const rel: RelationshipInfo = {
          sourceUri: entity.uri,
          targetUri: entity.hasMaterial,
          edgeType: 'HAS_METAL',
        };
        count++;
        yield rel;
      }

      // Extract BROADER_THAN relationships (hierarchical: entity → parent)
      if (entity.broader) {
        const rel: RelationshipInfo = {
          sourceUri: entity.uri,
          targetUri: entity.broader,
          edgeType: 'BROADER_THAN',
        };
        count++;
        yield rel;
      }

      // Extract PART_OF relationships (category membership)
      if (entity.isPartOf) {
        const rel: RelationshipInfo = {
          sourceUri: entity.uri,
          targetUri: entity.isPartOf,
          edgeType: 'PART_OF',
        };
        count++;
        yield rel;
      }

      if (count % 500 === 0) {
        console.log(`[nomisma-local] Extracted ${count} relationships from ${processed} files`);
      }
    } catch (error) {
      console.error(`[nomisma-local] Error extracting relationships from ${file}:`, error);
    }
  }

  console.log(`[nomisma-local] Completed: extracted ${count} relationships from ${processed} files`);
}

/**
 * Extract coin types from local RDF files (denominations that can be linked to mints/rulers)
 */
export interface LocalCoinType {
  uri: string;
  label: string;
  authority?: string;
  authorityLabel?: string;
  mint?: string;
  mintLabel?: string;
  denomination?: string;
  denominationLabel?: string;
  material?: string;
  materialLabel?: string;
}

export async function* extractCoinTypesFromLocal(
  entityUri?: string
): AsyncGenerator<LocalCoinType> {
  const files = getNomismaDataFiles();
  let count = 0;
  let processed = 0;

  console.log(`[nomisma-local] Extracting coin types from local RDF files`);

  for (const file of files) {
    if (processed >= 5000) break; // Reasonable limit per run
    
    try {
      const entity = await parseRdfFile(file);
      processed++;

      // Extract denominations and other coin type entities as coin types
      if (entity && (entity.type === 'denomination' || entity.type === 'mint')) {
        const coinType: LocalCoinType = {
          uri: entity.uri,
          label: entity.label || entity.uri.split('/').pop() || 'Unknown',
        };
        
        count++;
        yield coinType;

        if (count % 500 === 0) {
          console.log(`[nomisma-local] Extracted ${count} coin types from ${processed} files`);
        }
      }
    } catch (error) {
      console.error(`[nomisma-local] Error extracting coin type from ${file}:`, error);
    }
  }

  console.log(`[nomisma-local] Completed: extracted ${count} coin types from ${processed} files`);
}

export const NomismaLocalParser = {
  isLocalDataAvailable,
  getLocalDataStats,
  getNomismaDataFiles,
  ingestEntitiesFromLocal,
  extractRelationshipsFromLocal,
  extractCoinTypesFromLocal,
};

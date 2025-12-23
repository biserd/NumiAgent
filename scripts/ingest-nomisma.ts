import { db } from "../server/db";
import { entities } from "../shared/schema";
import { eq } from "drizzle-orm";

const NOMISMA_DATA_DIR = "nomisma-data/id";

const ENTITY_TYPE_MAP: Record<string, string> = {
  'http://nomisma.org/ontology#Mint': 'mint',
  'http://nomisma.org/ontology#Denomination': 'denomination',
  'http://nomisma.org/ontology#Material': 'metal',
  'http://xmlns.com/foaf/0.1/Person': 'ruler',
  'http://nomisma.org/ontology#Authority': 'authority',
};

const DB_TYPE_MAP: Record<string, string> = {
  'ruler': 'PERSON',
  'authority': 'PERSON',
  'mint': 'MINT',
  'denomination': 'DENOMINATION',
  'metal': 'METAL',
};

async function parseRdfFile(filePath: string): Promise<any | null> {
  const { createReadStream } = await import('fs');
  const { RdfXmlParser } = await import('rdfxml-streaming-parser');
  
  return new Promise((resolve) => {
    const parser = new RdfXmlParser();
    const entity: any = {
      uri: '',
      type: null,
      label: null,
      wikidataQid: null,
      pleiadesUri: null,
    };
    let mainSubject = '';

    parser.on('data', (quad: any) => {
      const subjectUri = quad.subject.value;
      const predicate = quad.predicate.value;
      const objectValue = quad.object.value;
      const lang = quad.object.language;

      if (!mainSubject && subjectUri.startsWith('http://nomisma.org/id/') && !subjectUri.includes('#')) {
        mainSubject = subjectUri;
        entity.uri = subjectUri;
      }

      if (subjectUri !== mainSubject) return;

      if (predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        const mappedType = ENTITY_TYPE_MAP[objectValue];
        if (mappedType) entity.type = mappedType;
      }

      if (predicate === 'http://www.w3.org/2004/02/skos/core#prefLabel' && lang === 'en') {
        entity.label = objectValue;
      }

      if (predicate === 'http://www.w3.org/2004/02/skos/core#exactMatch' || 
          predicate === 'http://www.w3.org/2004/02/skos/core#closeMatch') {
        if (objectValue.includes('wikidata.org/entity/Q')) {
          const match = objectValue.match(/Q\d+/);
          if (match) entity.wikidataQid = match[0];
        }
        if (objectValue.includes('pleiades.stoa.org/places/')) {
          entity.pleiadesUri = objectValue;
        }
      }
    });

    parser.on('end', () => {
      if (entity.uri && entity.type && entity.label) {
        resolve(entity);
      } else {
        resolve(null);
      }
    });

    parser.on('error', () => resolve(null));

    createReadStream(filePath, 'utf8').pipe(parser);
  });
}

async function ingestEntities(entityType: string, limit?: number) {
  const { readdirSync } = await import('fs');
  const { join } = await import('path');
  
  const files = readdirSync(NOMISMA_DATA_DIR)
    .filter(f => f.endsWith('.rdf'))
    .map(f => join(NOMISMA_DATA_DIR, f));
  
  console.log(`[ingest] Starting ${entityType} ingestion from ${files.length} files...`);
  
  let ingested = 0;
  let skipped = 0;
  let processed = 0;
  const maxToIngest = limit || Infinity;

  for (const file of files) {
    if (ingested >= maxToIngest) break;
    
    try {
      const entity = await parseRdfFile(file);
      processed++;
      
      if (!entity) continue;
      
      const isMatchingType = (entityType === 'ruler' && (entity.type === 'ruler' || entity.type === 'authority')) ||
                             entity.type === entityType;
      
      if (!isMatchingType) continue;

      const existing = await db.select().from(entities).where(eq(entities.nomismaUri, entity.uri)).limit(1);
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const dbType = DB_TYPE_MAP[entity.type] || 'OTHER';
      
      await db.insert(entities).values({
        type: dbType,
        label: entity.label,
        nomismaUri: entity.uri,
        wikidataQid: entity.wikidataQid,
        pleiadesUri: entity.pleiadesUri,
      });
      
      ingested++;
      
      if (ingested % 100 === 0) {
        console.log(`[ingest] ${entityType}: ${ingested} ingested, ${skipped} skipped, ${processed} processed`);
      }
    } catch (error) {
      // Skip files that fail
    }
  }
  
  console.log(`[ingest] ${entityType} complete: ${ingested} ingested, ${skipped} skipped`);
  return { ingested, skipped, processed };
}

async function main() {
  console.log("Starting Nomisma entity ingestion...\n");
  
  console.log("=== Ingesting Materials/Metals ===");
  await ingestEntities('metal');
  
  console.log("\n=== Ingesting Denominations ===");
  await ingestEntities('denomination');
  
  console.log("\n=== Ingesting Mints ===");
  await ingestEntities('mint');
  
  console.log("\n=== Ingesting Rulers ===");
  await ingestEntities('ruler');
  
  console.log("\n=== Ingestion Complete ===");
  
  const counts = await db.select().from(entities);
  const typeCounts: Record<string, number> = {};
  for (const e of counts) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  console.log("Entity counts:", typeCounts);
  
  process.exit(0);
}

main().catch(err => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

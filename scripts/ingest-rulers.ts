import { db } from "../server/db";
import { entities } from "../shared/schema";
import { eq } from "drizzle-orm";

const NOMISMA_DATA_DIR = "nomisma-data/id";

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
        if (objectValue === 'http://xmlns.com/foaf/0.1/Person' || 
            objectValue === 'http://nomisma.org/ontology#Authority') {
          entity.type = 'ruler';
        }
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

async function main() {
  const { readdirSync } = await import('fs');
  const { join } = await import('path');
  
  const files = readdirSync(NOMISMA_DATA_DIR)
    .filter(f => f.endsWith('.rdf'))
    .map(f => join(NOMISMA_DATA_DIR, f));
  
  console.log(`[ingest] Starting ruler ingestion from ${files.length} files...`);
  
  let ingested = 0;
  let skipped = 0;
  let processed = 0;

  for (const file of files) {
    try {
      const entity = await parseRdfFile(file);
      processed++;
      
      if (!entity || entity.type !== 'ruler') continue;

      const existing = await db.select().from(entities).where(eq(entities.nomismaUri, entity.uri)).limit(1);
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(entities).values({
        type: 'PERSON',
        label: entity.label,
        nomismaUri: entity.uri,
        wikidataQid: entity.wikidataQid,
        pleiadesUri: entity.pleiadesUri,
      });
      
      ingested++;
      
      if (ingested % 500 === 0) {
        console.log(`[ingest] rulers: ${ingested} ingested, ${skipped} skipped, ${processed} processed`);
      }
    } catch (error) {
      // Skip files that fail
    }
  }
  
  console.log(`[ingest] rulers complete: ${ingested} ingested, ${skipped} skipped`);
  
  const counts = await db.select().from(entities);
  const typeCounts: Record<string, number> = {};
  for (const e of counts) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  console.log("Final entity counts:", typeCounts);
  
  process.exit(0);
}

main().catch(err => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

import { db } from "../server/db";
import { entities, entityEdges } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const NOMISMA_DATA_DIR = "nomisma-data/id";

async function parseRdfFileForEdges(filePath: string): Promise<{ uri: string; metalUri: string } | null> {
  const { createReadStream } = await import('fs');
  const { RdfXmlParser } = await import('rdfxml-streaming-parser');
  
  return new Promise((resolve) => {
    const parser = new RdfXmlParser();
    let mainSubject = '';
    let isDenomination = false;
    let metalUri: string | null = null;

    parser.on('data', (quad: any) => {
      const subjectUri = quad.subject.value;
      const predicate = quad.predicate.value;
      const objectValue = quad.object.value;

      if (!mainSubject && subjectUri.startsWith('http://nomisma.org/id/') && !subjectUri.includes('#')) {
        mainSubject = subjectUri;
      }

      if (subjectUri !== mainSubject) return;

      if (predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        if (objectValue === 'http://nomisma.org/ontology#Denomination') {
          isDenomination = true;
        }
      }

      if (predicate === 'http://nomisma.org/ontology#hasMaterial') {
        metalUri = objectValue;
      }
    });

    parser.on('end', () => {
      if (mainSubject && isDenomination && metalUri) {
        resolve({ uri: mainSubject, metalUri });
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
  
  console.log(`[edges] Starting HAS_METAL edge ingestion from ${files.length} files...`);
  
  let created = 0;
  let skipped = 0;
  let processed = 0;
  let noMatch = 0;

  for (const file of files) {
    try {
      const edge = await parseRdfFileForEdges(file);
      processed++;
      
      if (!edge) continue;

      // Find the denomination entity
      const denominations = await db.select().from(entities).where(eq(entities.nomismaUri, edge.uri)).limit(1);
      if (denominations.length === 0) {
        noMatch++;
        continue;
      }

      // Find the metal entity
      const metals = await db.select().from(entities).where(eq(entities.nomismaUri, edge.metalUri)).limit(1);
      if (metals.length === 0) {
        noMatch++;
        continue;
      }

      const srcId = denominations[0].id;
      const dstId = metals[0].id;

      // Check if edge already exists
      const existingEdge = await db.select().from(entityEdges)
        .where(and(
          eq(entityEdges.srcId, srcId),
          eq(entityEdges.dstId, dstId),
          eq(entityEdges.edgeType, 'HAS_METAL')
        ))
        .limit(1);

      if (existingEdge.length > 0) {
        skipped++;
        continue;
      }

      // Create the edge
      await db.insert(entityEdges).values({
        srcId,
        dstId,
        edgeType: 'HAS_METAL',
        provenance: 'nomisma-local',
        confidence: 1.0,
      });
      
      created++;
      
      if (created % 50 === 0) {
        console.log(`[edges] HAS_METAL: ${created} created, ${skipped} skipped, ${noMatch} no match`);
      }
    } catch (error) {
      // Skip files that fail
    }
  }
  
  console.log(`[edges] HAS_METAL complete: ${created} created, ${skipped} skipped, ${noMatch} no match`);
  
  // Count total edges
  const edgeCounts = await db.select().from(entityEdges);
  const typeCounts: Record<string, number> = {};
  for (const e of edgeCounts) {
    typeCounts[e.edgeType] = (typeCounts[e.edgeType] || 0) + 1;
  }
  console.log("Edge counts:", typeCounts);
  
  process.exit(0);
}

main().catch(err => {
  console.error("Edge ingestion failed:", err);
  process.exit(1);
});

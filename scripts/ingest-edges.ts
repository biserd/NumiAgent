import { db } from "../server/db";
import { entities, entityEdges } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const NOMISMA_DATA_DIR = "nomisma-data/id";

const NMO = 'http://nomisma.org/ontology#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DCTERMS = 'http://purl.org/dc/terms/';

interface ParsedEdges {
  uri: string;
  metalUri: string | null;
  broaderUri: string | null;
  isPartOfUri: string | null;
}

async function parseRdfFileForEdges(filePath: string): Promise<ParsedEdges | null> {
  const { createReadStream } = await import('fs');
  const { RdfXmlParser } = await import('rdfxml-streaming-parser');
  
  return new Promise((resolve) => {
    const parser = new RdfXmlParser();
    let mainSubject = '';
    let metalUri: string | null = null;
    let broaderUri: string | null = null;
    let isPartOfUri: string | null = null;

    parser.on('data', (quad: any) => {
      const subjectUri = quad.subject.value;
      const predicate = quad.predicate.value;
      const objectValue = quad.object.value;

      if (!mainSubject && subjectUri.startsWith('http://nomisma.org/id/') && !subjectUri.includes('#')) {
        mainSubject = subjectUri;
      }

      if (subjectUri !== mainSubject) return;

      if (predicate === `${NMO}hasMaterial`) {
        metalUri = objectValue;
      }

      if (predicate === `${SKOS}broader` && objectValue.startsWith('http://nomisma.org/id/')) {
        broaderUri = objectValue;
      }

      if (predicate === `${DCTERMS}isPartOf` && objectValue.startsWith('http://nomisma.org/id/')) {
        isPartOfUri = objectValue;
      }
    });

    parser.on('end', () => {
      if (mainSubject && (metalUri || broaderUri || isPartOfUri)) {
        resolve({ uri: mainSubject, metalUri, broaderUri, isPartOfUri });
      } else {
        resolve(null);
      }
    });

    parser.on('error', () => resolve(null));

    createReadStream(filePath, 'utf8').pipe(parser);
  });
}

async function createEdge(srcId: string, dstId: string, edgeType: string): Promise<boolean> {
  const existingEdge = await db.select().from(entityEdges)
    .where(and(
      eq(entityEdges.srcId, srcId),
      eq(entityEdges.dstId, dstId),
      eq(entityEdges.edgeType, edgeType)
    ))
    .limit(1);

  if (existingEdge.length > 0) {
    return false;
  }

  await db.insert(entityEdges).values({
    srcId,
    dstId,
    edgeType,
    provenance: 'nomisma-local',
    confidence: '1.0000',
  });
  
  return true;
}

async function main() {
  const { readdirSync } = await import('fs');
  const { join } = await import('path');
  
  const files = readdirSync(NOMISMA_DATA_DIR)
    .filter(f => f.endsWith('.rdf'))
    .map(f => join(NOMISMA_DATA_DIR, f));
  
  console.log(`[edges] Starting edge ingestion from ${files.length} files...`);
  
  const counts = {
    HAS_METAL: { created: 0, skipped: 0, noMatch: 0 },
    BROADER_THAN: { created: 0, skipped: 0, noMatch: 0 },
    PART_OF: { created: 0, skipped: 0, noMatch: 0 },
  };
  
  let processed = 0;

  for (const file of files) {
    try {
      const edges = await parseRdfFileForEdges(file);
      processed++;
      
      if (!edges) continue;

      const srcEntities = await db.select().from(entities).where(eq(entities.nomismaUri, edges.uri)).limit(1);
      if (srcEntities.length === 0) continue;
      const srcId = srcEntities[0].id;

      if (edges.metalUri) {
        const dstEntities = await db.select().from(entities).where(eq(entities.nomismaUri, edges.metalUri)).limit(1);
        if (dstEntities.length > 0) {
          const created = await createEdge(srcId, dstEntities[0].id, 'HAS_METAL');
          if (created) counts.HAS_METAL.created++;
          else counts.HAS_METAL.skipped++;
        } else {
          counts.HAS_METAL.noMatch++;
        }
      }

      if (edges.broaderUri) {
        const dstEntities = await db.select().from(entities).where(eq(entities.nomismaUri, edges.broaderUri)).limit(1);
        if (dstEntities.length > 0) {
          const created = await createEdge(srcId, dstEntities[0].id, 'BROADER_THAN');
          if (created) counts.BROADER_THAN.created++;
          else counts.BROADER_THAN.skipped++;
        } else {
          counts.BROADER_THAN.noMatch++;
        }
      }

      if (edges.isPartOfUri) {
        const dstEntities = await db.select().from(entities).where(eq(entities.nomismaUri, edges.isPartOfUri)).limit(1);
        if (dstEntities.length > 0) {
          const created = await createEdge(srcId, dstEntities[0].id, 'PART_OF');
          if (created) counts.PART_OF.created++;
          else counts.PART_OF.skipped++;
        } else {
          counts.PART_OF.noMatch++;
        }
      }

      if (processed % 2000 === 0) {
        console.log(`[edges] Processed ${processed}/${files.length} files`);
        console.log(`  HAS_METAL: ${counts.HAS_METAL.created} created, ${counts.HAS_METAL.skipped} skipped`);
        console.log(`  BROADER_THAN: ${counts.BROADER_THAN.created} created, ${counts.BROADER_THAN.skipped} skipped`);
        console.log(`  PART_OF: ${counts.PART_OF.created} created, ${counts.PART_OF.skipped} skipped`);
      }
    } catch (error) {
      // Skip files that fail
    }
  }
  
  console.log(`\n[edges] COMPLETE:`);
  console.log(`  HAS_METAL: ${counts.HAS_METAL.created} created, ${counts.HAS_METAL.skipped} skipped, ${counts.HAS_METAL.noMatch} no match`);
  console.log(`  BROADER_THAN: ${counts.BROADER_THAN.created} created, ${counts.BROADER_THAN.skipped} skipped, ${counts.BROADER_THAN.noMatch} no match`);
  console.log(`  PART_OF: ${counts.PART_OF.created} created, ${counts.PART_OF.skipped} skipped, ${counts.PART_OF.noMatch} no match`);
  
  const totalEdges = await db.select().from(entityEdges);
  const typeCounts: Record<string, number> = {};
  for (const e of totalEdges) {
    typeCounts[e.edgeType] = (typeCounts[e.edgeType] || 0) + 1;
  }
  console.log("\nTotal edge counts:", typeCounts);
  
  process.exit(0);
}

main().catch(err => {
  console.error("Edge ingestion failed:", err);
  process.exit(1);
});

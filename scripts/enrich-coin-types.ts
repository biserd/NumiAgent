import { db } from '../server/db';
import { entities, coinTypes, sources } from '../shared/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { getCoinTypesForMint, getCoinTypesForRuler } from '../server/services/nomisma-sparql';
import pLimit from 'p-limit';

const NOMISMA_SOURCE_ID = 'nomisma-sparql';
const BATCH_SIZE = 10;
const RATE_LIMIT_DELAY = 2000;

interface EnrichmentStats {
  entitiesProcessed: number;
  coinTypesCreated: number;
  errors: number;
  skipped: number;
}

async function ensureNomismaSource(): Promise<void> {
  const existing = await db.select().from(sources).where(eq(sources.id, NOMISMA_SOURCE_ID)).limit(1);
  
  if (existing.length === 0) {
    await db.insert(sources).values({
      id: NOMISMA_SOURCE_ID,
      name: 'Nomisma.org SPARQL',
      homepageUrl: 'https://nomisma.org',
      accessMethod: 'sparql',
      baseUrl: 'https://nomisma.org/sparql',
      defaultLicenseMetadata: 'CC_BY',
      defaultLicenseImages: 'UNKNOWN',
      defaultActions: {},
      isEnabled: true,
      isSample: false,
    });
    console.log('Created Nomisma source record');
  }
}

async function getExistingCoinTypeUris(): Promise<Set<string>> {
  const existing = await db.select({ nomismaUri: coinTypes.nomismaUri })
    .from(coinTypes)
    .where(isNotNull(coinTypes.nomismaUri));
  
  return new Set(existing.map(r => r.nomismaUri).filter(Boolean) as string[]);
}

async function enrichEntity(
  entity: typeof entities.$inferSelect,
  existingUris: Set<string>,
  stats: EnrichmentStats
): Promise<void> {
  try {
    let fetchedTypes;
    
    if (entity.type === 'MINT') {
      fetchedTypes = await getCoinTypesForMint(entity.nomismaUri!, 100);
    } else if (entity.type === 'PERSON') {
      fetchedTypes = await getCoinTypesForRuler(entity.nomismaUri!, 100);
    } else {
      stats.skipped++;
      return;
    }

    if (!fetchedTypes || fetchedTypes.length === 0) {
      stats.skipped++;
      return;
    }

    for (const ct of fetchedTypes) {
      if (!ct.uri || existingUris.has(ct.uri)) {
        continue;
      }

      try {
        await db.insert(coinTypes).values({
          sourceId: NOMISMA_SOURCE_ID,
          nomismaUri: ct.uri,
          sourceUrl: ct.uri,
          label: ct.label || ct.uri.split('/').pop() || 'Unknown',
          authority: ct.authorityLabel,
          mint: ct.mintLabel || (entity.type === 'MINT' ? entity.label : undefined),
          denomination: ct.denominationLabel,
          metal: ct.materialLabel,
          linkedEntityId: entity.id,
        });

        existingUris.add(ct.uri);
        stats.coinTypesCreated++;
      } catch (insertError) {
        console.error(`  Error inserting coin type ${ct.uri}:`, insertError);
        stats.errors++;
      }
    }

    stats.entitiesProcessed++;
  } catch (error) {
    console.error(`Error enriching entity ${entity.label}:`, error);
    stats.errors++;
  }
}

async function main() {
  console.log('=== Nomisma Coin Type Enrichment ===\n');

  await ensureNomismaSource();
  const existingUris = await getExistingCoinTypeUris();
  console.log(`Found ${existingUris.size} existing coin types with Nomisma URIs\n`);

  const entitiesToEnrich = await db.select()
    .from(entities)
    .where(
      and(
        isNotNull(entities.nomismaUri),
        sql`${entities.type} IN ('MINT', 'PERSON')`
      )
    );

  console.log(`Found ${entitiesToEnrich.length} entities with Nomisma URIs to enrich\n`);

  const stats: EnrichmentStats = {
    entitiesProcessed: 0,
    coinTypesCreated: 0,
    errors: 0,
    skipped: 0,
  };

  const limit = pLimit(1);

  for (let i = 0; i < entitiesToEnrich.length; i += BATCH_SIZE) {
    const batch = entitiesToEnrich.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entitiesToEnrich.length / BATCH_SIZE)} (${batch.length} entities)...`);

    await Promise.all(
      batch.map(entity => 
        limit(async () => {
          console.log(`  Enriching: ${entity.label} (${entity.type})`);
          await enrichEntity(entity, existingUris, stats);
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        })
      )
    );

    console.log(`  Batch complete. Running totals: ${stats.coinTypesCreated} types created\n`);
  }

  console.log('\n=== Enrichment Complete ===');
  console.log(`Entities processed: ${stats.entitiesProcessed}`);
  console.log(`Coin types created: ${stats.coinTypesCreated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);

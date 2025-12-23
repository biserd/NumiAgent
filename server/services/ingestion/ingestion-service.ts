import { db } from '../../db';
import { sources, coinTypes, rightsRecords, embeddingJobs } from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { BaseMuseumAdapter } from './base-adapter';
import type { MuseumObject, IngestionResult, IngestionOptions } from './types';
import { canComputeEmbeddings } from './types';
import { batchProcess } from './rate-limiter';

export class IngestionService {
  private adapter: BaseMuseumAdapter;

  constructor(adapter: BaseMuseumAdapter) {
    this.adapter = adapter;
  }

  async runIngestion(options: IngestionOptions = {}): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      objectsProcessed: 0,
      objectsIngested: 0,
      objectsSkipped: 0,
      imagesDownloaded: 0,
      errors: [],
      duration: 0,
    };

    try {
      const source = await this.ensureSource();
      
      console.log(`Starting ingestion for ${source.name}...`);
      
      const objectIds = await this.adapter.searchCoins(options.filterQuery, options);
      console.log(`Found ${objectIds.length} coin objects to process`);

      const idsToProcess = options.limit 
        ? objectIds.slice(options.offset || 0, (options.offset || 0) + options.limit)
        : objectIds.slice(options.offset || 0);

      console.log(`Processing ${idsToProcess.length} objects...`);

      await batchProcess(
        idsToProcess,
        async (externalId) => {
          try {
            result.objectsProcessed++;
            
            const existing = await db.select()
              .from(coinTypes)
              .where(and(
                eq(coinTypes.sourceId, source.id),
                eq(coinTypes.sourceRecordId, externalId)
              ))
              .limit(1);

            if (existing.length > 0) {
              result.objectsSkipped++;
              return;
            }

            const obj = await this.adapter.fetchObject(externalId);
            if (!obj) {
              result.objectsSkipped++;
              return;
            }

            if (options.dryRun) {
              console.log(`[DRY RUN] Would ingest: ${obj.title}`);
              result.objectsIngested++;
              return;
            }

            await this.ingestObject(source.id, obj, options);
            result.objectsIngested++;

            if (result.objectsProcessed % 10 === 0) {
              console.log(`Progress: ${result.objectsProcessed}/${idsToProcess.length}`);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.errors.push({ externalId, error: message });
            console.error(`Error processing ${externalId}:`, message);
          }
        },
        {
          batchSize: options.batchSize || 10,
          concurrency: 2,
          onProgress: (completed, total) => {
            if (completed % 50 === 0) {
              console.log(`Batch progress: ${completed}/${total}`);
            }
          },
        }
      );

    } catch (error) {
      console.error('Ingestion failed:', error);
      throw error;
    }

    result.duration = Date.now() - startTime;
    console.log(`Ingestion complete. Processed: ${result.objectsProcessed}, Ingested: ${result.objectsIngested}, Skipped: ${result.objectsSkipped}, Errors: ${result.errors.length}`);
    
    return result;
  }

  private async ensureSource(): Promise<typeof sources.$inferSelect> {
    const sourceId = this.adapter.getSourceId();
    
    const [existing] = await db.select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);

    if (existing) return existing;

    const [newSource] = await db.insert(sources)
      .values({
        id: sourceId,
        name: sourceId,
        accessMethod: 'api',
        defaultLicenseMetadata: this.adapter.getDefaultLicense(),
        defaultLicenseImages: this.adapter.getDefaultLicense(),
        defaultActions: { embed: true, display: true, download: true },
        isEnabled: true,
      })
      .returning();

    return newSource;
  }

  private async ingestObject(
    sourceId: string,
    obj: MuseumObject,
    options: IngestionOptions
  ): Promise<void> {
    const license = obj.licenseCode || this.adapter.getDefaultLicense();
    const sourceUrl = obj.objectUrl || `https://example.com/${obj.externalId}`;

    const [rights] = await db.insert(rightsRecords)
      .values({
        sourceId,
        sourceRecordId: obj.externalId,
        sourceUrl,
        licenseMetadata: license,
        licenseImages: license,
        commercialOk: obj.isPublicDomain,
        rehostOk: obj.isPublicDomain,
        cacheOk: true,
        embedOk: true,
        computeEmbeddingsOk: canComputeEmbeddings(license),
        attributionText: obj.creditLine || null,
        attributionUrl: obj.objectUrl || null,
        derivativeOk: obj.isPublicDomain,
      })
      .returning();

    const [coinType] = await db.insert(coinTypes)
      .values({
        sourceId,
        sourceRecordId: obj.externalId,
        sourceUrl: obj.objectUrl,
        label: obj.title,
        dateFrom: obj.beginDate,
        dateTo: obj.endDate,
        referenceText: obj.description,
        rightsId: rights.id,
        imageUrl: obj.primaryImageUrl,
        authority: obj.reign || obj.dynasty,
        issuer: obj.artistDisplayName,
        mint: obj.geography?.mint || obj.geography?.city,
        denomination: obj.classification,
        metal: obj.medium,
        region: obj.geography?.region || obj.geography?.country,
      })
      .returning();

    if (canComputeEmbeddings(license) && obj.primaryImageUrl) {
      await db.insert(embeddingJobs)
        .values({
          coinTypeId: coinType.id,
          imageUrl: obj.primaryImageUrl,
          imageType: 'obverse',
          status: 'PENDING',
          priority: 5,
        });
    }
  }
}

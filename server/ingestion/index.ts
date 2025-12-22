// Ingestion Engine
// Orchestrates data ingestion from museum sources into the coin types database

import { storage } from "../storage";
import { MetAdapter } from "./met-adapter";
import { IKMKAdapter } from "./ikmk-adapter";
import { ANSAdapter } from "./ans-adapter";
import { BMAdapter } from "./bm-adapter";
import type { InsertCoinType, InsertRightsRecord, IngestionRun } from "@shared/schema";

export interface IngestionResult {
  runId: string;
  sourceId: string;
  recordsProcessed: number;
  recordsIngested: number;
  recordsSkipped: number;
  errors: string[];
  durationMs: number;
}

type IngestionAdapter = typeof MetAdapter | typeof IKMKAdapter | typeof ANSAdapter | typeof BMAdapter;

const adapters: Record<string, IngestionAdapter> = {
  "met-museum": MetAdapter,
  "ikmk-berlin": IKMKAdapter,
  "ans-mantis": ANSAdapter,
  "british-museum": BMAdapter,
};

export async function runIngestion(
  runId: string,
  sourceId: string,
  limit: number = 100
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  // Update existing run to RUNNING status
  await storage.updateIngestionRun(runId, {
    status: "RUNNING",
    startedAt: new Date(),
  });
  
  const adapter = adapters[sourceId];
  if (!adapter) {
    const error = `No adapter found for source: ${sourceId}`;
    errors.push(error);
    
    await storage.updateIngestionRun(runId, {
      status: "FAILED",
      errorMessage: error,
      completedAt: new Date(),
    });
    
    return {
      runId,
      sourceId,
      recordsProcessed: 0,
      recordsIngested: 0,
      recordsSkipped: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
  
  let recordsProcessed = 0;
  let recordsIngested = 0;
  let recordsSkipped = 0;
  
  try {
    // Different adapters have different signatures, call appropriately
    let ingestionGenerator: AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }>;
    
    if (sourceId === 'ans-mantis') {
      // ANS adapter takes (query, limit)
      const defaultQuery = "department_facet:Greek OR department_facet:Roman";
      ingestionGenerator = ANSAdapter.ingest(defaultQuery, limit);
    } else if (sourceId === 'british-museum') {
      ingestionGenerator = BMAdapter.ingest(limit);
    } else if (sourceId === 'met-museum') {
      ingestionGenerator = MetAdapter.ingest(limit);
    } else if (sourceId === 'ikmk-berlin') {
      ingestionGenerator = IKMKAdapter.ingest(limit);
    } else {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    
    for await (const { coinType, rights } of ingestionGenerator) {
      recordsProcessed++;
      
      try {
        const existingCoinType = await storage.getCoinTypeBySourceRecord(
          coinType.sourceId,
          coinType.sourceRecordId || ""
        );
        
        if (existingCoinType) {
          recordsSkipped++;
          continue;
        }
        
        const createdRights = await storage.createRightsRecord(rights);
        
        await storage.createCoinType({
          ...coinType,
          rightsId: createdRights.id,
        });
        
        recordsIngested++;
        
        if (recordsProcessed % 10 === 0) {
          await storage.updateIngestionRun(runId, {
            recordsProcessed,
            recordsIngested,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${coinType.sourceRecordId}: ${errorMsg}`);
      }
    }
    
    await storage.updateIngestionRun(runId, {
      status: "COMPLETED",
      recordsProcessed,
      recordsIngested,
      completedAt: new Date(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal error: ${errorMsg}`);
    
    await storage.updateIngestionRun(runId, {
      status: "FAILED",
      recordsProcessed,
      recordsIngested,
      errorMessage: errorMsg,
      completedAt: new Date(),
    });
  }
  
  return {
    runId,
    sourceId,
    recordsProcessed,
    recordsIngested,
    recordsSkipped,
    errors,
    durationMs: Date.now() - startTime,
  };
}

export async function getAvailableAdapters(): Promise<string[]> {
  return Object.keys(adapters);
}

export { MetAdapter, IKMKAdapter, ANSAdapter, BMAdapter };

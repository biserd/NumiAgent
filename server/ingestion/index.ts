// Ingestion Engine
// Orchestrates data ingestion from museum sources into the coin types database

import { storage } from "../storage";
import { MetAdapter } from "./met-adapter";
import { IKMKAdapter } from "./ikmk-adapter";
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

type IngestionAdapter = typeof MetAdapter | typeof IKMKAdapter;

const adapters: Record<string, IngestionAdapter> = {
  "met-museum": MetAdapter,
  "ikmk-berlin": IKMKAdapter,
};

export async function runIngestion(
  sourceId: string,
  limit: number = 100
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  const run = await storage.createIngestionRun({
    sourceId,
    status: "RUNNING",
    recordsProcessed: 0,
    recordsIngested: 0,
  });
  
  const adapter = adapters[sourceId];
  if (!adapter) {
    const error = `No adapter found for source: ${sourceId}`;
    errors.push(error);
    
    await storage.updateIngestionRun(run.id, {
      status: "FAILED",
      errorMessage: error,
      completedAt: new Date(),
    });
    
    return {
      runId: run.id,
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
    for await (const { coinType, rights } of adapter.ingest(limit)) {
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
          await storage.updateIngestionRun(run.id, {
            recordsProcessed,
            recordsIngested,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${coinType.sourceRecordId}: ${errorMsg}`);
      }
    }
    
    await storage.updateIngestionRun(run.id, {
      status: "COMPLETED",
      recordsProcessed,
      recordsIngested,
      completedAt: new Date(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal error: ${errorMsg}`);
    
    await storage.updateIngestionRun(run.id, {
      status: "FAILED",
      recordsProcessed,
      recordsIngested,
      errorMessage: errorMsg,
      completedAt: new Date(),
    });
  }
  
  return {
    runId: run.id,
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

export { MetAdapter, IKMKAdapter };

// Ingestion Engine
// Orchestrates data ingestion from museum sources into the coin types database

import { storage } from "../storage";
import { MetAdapter } from "./met-adapter";
import { IKMKAdapter } from "./ikmk-adapter";
import { ANSAdapter } from "./ans-adapter";
import { BMAdapter } from "./bm-adapter";
import { SmithsonianAdapter } from "./smithsonian-adapter";
import { WaltersAdapter } from "./walters-adapter";
import { ArticAdapter } from "./artic-adapter";
import { NGAAdapter } from "./nga-adapter";
import type { InsertCoinType, InsertRightsRecord, IngestionRun, LogLevel } from "@shared/schema";

class IngestionLogger {
  constructor(private runId: string) {}
  
  async log(level: LogLevel, message: string, metadata?: { recordId?: string; cursor?: string; data?: Record<string, unknown> }) {
    console.log(`[${level}] ${message}`, metadata?.data || '');
    await storage.createIngestionLog({
      runId: this.runId,
      level,
      message,
      recordId: metadata?.recordId || null,
      cursor: metadata?.cursor || null,
      metadata: metadata?.data || null,
    });
  }
  
  debug(message: string, metadata?: { recordId?: string; cursor?: string; data?: Record<string, unknown> }) {
    return this.log('DEBUG', message, metadata);
  }
  
  info(message: string, metadata?: { recordId?: string; cursor?: string; data?: Record<string, unknown> }) {
    return this.log('INFO', message, metadata);
  }
  
  warn(message: string, metadata?: { recordId?: string; cursor?: string; data?: Record<string, unknown> }) {
    return this.log('WARN', message, metadata);
  }
  
  error(message: string, metadata?: { recordId?: string; cursor?: string; data?: Record<string, unknown> }) {
    return this.log('ERROR', message, metadata);
  }
}

export interface IngestionResult {
  runId: string;
  sourceId: string;
  recordsProcessed: number;
  recordsIngested: number;
  recordsSkipped: number;
  errors: string[];
  durationMs: number;
}

type IngestionAdapter = 
  | typeof MetAdapter 
  | typeof IKMKAdapter 
  | typeof ANSAdapter 
  | typeof BMAdapter
  | typeof SmithsonianAdapter
  | typeof WaltersAdapter
  | typeof ArticAdapter
  | typeof NGAAdapter;

const adapters: Record<string, IngestionAdapter> = {
  "met-museum": MetAdapter,
  "ikmk-berlin": IKMKAdapter,
  "ans-mantis": ANSAdapter,
  "british-museum": BMAdapter,
  "smithsonian": SmithsonianAdapter,
  "walters-museum": WaltersAdapter,
  "artic-chicago": ArticAdapter,
  "nga-washington": NGAAdapter,
};

export async function runIngestion(
  runId: string,
  sourceId: string,
  limit: number = 100,
  resumeFromCursor?: string
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const logger = new IngestionLogger(runId);
  
  await logger.info(`Starting ingestion for source: ${sourceId}`, { data: { limit, resumeFromCursor } });
  
  // Update existing run to RUNNING status
  await storage.updateIngestionRun(runId, {
    status: "RUNNING",
    startedAt: new Date(),
  });
  
  const adapter = adapters[sourceId];
  if (!adapter) {
    const error = `No adapter found for source: ${sourceId}. Available adapters: ${Object.keys(adapters).join(', ')}`;
    errors.push(error);
    await logger.error(error);
    
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
    await logger.info(`Initializing adapter for ${sourceId}`);
    
    // Different adapters have different signatures, call appropriately
    let ingestionGenerator: AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }>;
    
    switch (sourceId) {
      case 'ans-mantis': {
        const defaultQuery = "department_facet:Greek OR department_facet:Roman";
        ingestionGenerator = ANSAdapter.ingest(defaultQuery, limit);
        break;
      }
      case 'british-museum': {
        ingestionGenerator = BMAdapter.ingest(limit);
        break;
      }
      case 'met-museum': {
        ingestionGenerator = MetAdapter.ingest(limit);
        break;
      }
      case 'ikmk-berlin': {
        ingestionGenerator = IKMKAdapter.ingest(limit);
        break;
      }
      case 'smithsonian': {
        ingestionGenerator = SmithsonianAdapter.ingest(limit);
        break;
      }
      case 'walters-museum': {
        ingestionGenerator = WaltersAdapter.ingest(limit);
        break;
      }
      case 'artic-chicago': {
        ingestionGenerator = ArticAdapter.ingest(limit);
        break;
      }
      case 'nga-washington': {
        ingestionGenerator = NGAAdapter.ingest(limit);
        break;
      }
      default: {
        throw new Error(`Unknown source: ${sourceId}`);
      }
    }
    
    await logger.info(`Fetching records from ${sourceId} API...`);
    
    for await (const { coinType, rights } of ingestionGenerator) {
      recordsProcessed++;
      const recordId = coinType.sourceRecordId || `record-${recordsProcessed}`;
      
      try {
        const existingCoinType = await storage.getCoinTypeBySourceRecord(
          coinType.sourceId,
          coinType.sourceRecordId || ""
        );
        
        if (existingCoinType) {
          recordsSkipped++;
          await logger.debug(`Skipped duplicate: ${recordId}`, { recordId, cursor: recordId });
          continue;
        }
        
        const createdRights = await storage.createRightsRecord(rights);
        
        await storage.createCoinType({
          ...coinType,
          rightsId: createdRights.id,
        });
        
        recordsIngested++;
        
        // Log progress every 10 records
        if (recordsProcessed % 10 === 0) {
          await logger.info(`Progress: ${recordsProcessed} processed, ${recordsIngested} ingested, ${recordsSkipped} skipped`, {
            cursor: recordId,
            data: { recordsProcessed, recordsIngested, recordsSkipped }
          });
          
          await storage.updateIngestionRun(runId, {
            recordsProcessed,
            recordsIngested,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${recordId}: ${errorMsg}`);
        await logger.error(`Failed to process record: ${recordId}`, { 
          recordId, 
          cursor: recordId,
          data: { error: errorMsg } 
        });
      }
    }
    
    await logger.info(`Ingestion completed successfully`, {
      data: { recordsProcessed, recordsIngested, recordsSkipped, durationMs: Date.now() - startTime }
    });
    
    await storage.updateIngestionRun(runId, {
      status: "COMPLETED",
      recordsProcessed,
      recordsIngested,
      completedAt: new Date(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal error: ${errorMsg}`);
    
    await logger.error(`Ingestion failed with fatal error: ${errorMsg}`, {
      data: { 
        error: errorMsg, 
        recordsProcessed, 
        recordsIngested,
        reason: 'FATAL_ERROR',
        canResume: true 
      }
    });
    
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

export { 
  MetAdapter, 
  IKMKAdapter, 
  ANSAdapter, 
  BMAdapter,
  SmithsonianAdapter,
  WaltersAdapter,
  ArticAdapter,
  NGAAdapter,
};

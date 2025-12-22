// Async embedding worker
// Processes embedding jobs from the queue
// Respects rights gating - only computes embeddings when license permits

import { db } from '../db';
import { embeddingJobs, coinTypes, rightsRecords, imageEmbeddings } from '@shared/schema';
import { eq, and, sql, asc, isNull, or } from 'drizzle-orm';
import { EmbeddingService, canComputeEmbeddings } from './embedding-service';

const BATCH_SIZE = 5;
const WORKER_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

let isWorkerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

export async function createEmbeddingJob(params: {
  coinTypeId?: string;
  userCoinId?: string;
  imageUrl: string;
  imageType: 'obverse' | 'reverse' | 'combined';
  priority?: number;
}): Promise<string> {
  const [job] = await db.insert(embeddingJobs).values({
    coinTypeId: params.coinTypeId,
    userCoinId: params.userCoinId,
    imageUrl: params.imageUrl,
    imageType: params.imageType,
    priority: params.priority || 0,
    status: 'PENDING',
  }).returning({ id: embeddingJobs.id });
  
  return job.id;
}

export async function createEmbeddingJobsForCoinType(coinTypeId: string): Promise<string[]> {
  const [coinType] = await db.select()
    .from(coinTypes)
    .where(eq(coinTypes.id, coinTypeId))
    .limit(1);
  
  if (!coinType || !coinType.imageUrl) {
    return [];
  }
  
  let rights = null;
  if (coinType.rightsId) {
    [rights] = await db.select()
      .from(rightsRecords)
      .where(eq(rightsRecords.id, coinType.rightsId))
      .limit(1);
  }
  
  if (rights) {
    const gating = canComputeEmbeddings(rights);
    if (!gating.allowed) {
      console.log(`Skipping embedding for coin type ${coinTypeId}: ${gating.reason}`);
      return [];
    }
  }
  
  const hasExisting = await EmbeddingService.hasEmbedding(coinTypeId);
  if (hasExisting) {
    console.log(`Embedding already exists for coin type ${coinTypeId}`);
    return [];
  }
  
  const jobId = await createEmbeddingJob({
    coinTypeId,
    imageUrl: coinType.imageUrl,
    imageType: 'combined',
    priority: 0,
  });
  
  return [jobId];
}

export async function processNextBatch(): Promise<number> {
  const jobs = await db.select()
    .from(embeddingJobs)
    .where(
      and(
        eq(embeddingJobs.status, 'PENDING'),
        sql`${embeddingJobs.attempts} < ${embeddingJobs.maxAttempts}`
      )
    )
    .orderBy(asc(embeddingJobs.priority), asc(embeddingJobs.scheduledAt))
    .limit(BATCH_SIZE);
  
  if (jobs.length === 0) {
    return 0;
  }
  
  let processed = 0;
  
  for (const job of jobs) {
    try {
      await db.update(embeddingJobs)
        .set({
          status: 'PROCESSING',
          startedAt: new Date(),
          attempts: job.attempts + 1,
        })
        .where(eq(embeddingJobs.id, job.id));
      
      let rights = null;
      if (job.coinTypeId) {
        const [coinType] = await db.select()
          .from(coinTypes)
          .where(eq(coinTypes.id, job.coinTypeId))
          .limit(1);
        
        if (coinType?.rightsId) {
          [rights] = await db.select()
            .from(rightsRecords)
            .where(eq(rightsRecords.id, coinType.rightsId))
            .limit(1);
        }
      }
      
      if (rights) {
        const gating = canComputeEmbeddings(rights);
        if (!gating.allowed) {
          await db.update(embeddingJobs)
            .set({
              status: 'SKIPPED',
              errorMessage: gating.reason,
              completedAt: new Date(),
            })
            .where(eq(embeddingJobs.id, job.id));
          continue;
        }
      }
      
      const result = await EmbeddingService.computeAndStoreEmbedding({
        coinTypeId: job.coinTypeId || undefined,
        userCoinId: job.userCoinId || undefined,
        imageUrl: job.imageUrl,
        imageType: job.imageType as 'obverse' | 'reverse' | 'combined',
      });
      
      if (result.success && result.embeddingId) {
        await db.update(embeddingJobs)
          .set({
            status: 'COMPLETED',
            resultEmbeddingId: result.embeddingId,
            completedAt: new Date(),
          })
          .where(eq(embeddingJobs.id, job.id));
        processed++;
      } else {
        const shouldRetry = job.attempts + 1 < MAX_RETRIES;
        await db.update(embeddingJobs)
          .set({
            status: shouldRetry ? 'PENDING' : 'FAILED',
            errorMessage: result.error || 'Unknown error',
            completedAt: shouldRetry ? null : new Date(),
          })
          .where(eq(embeddingJobs.id, job.id));
      }
    } catch (error) {
      console.error(`Error processing embedding job ${job.id}:`, error);
      
      const shouldRetry = job.attempts + 1 < MAX_RETRIES;
      await db.update(embeddingJobs)
        .set({
          status: shouldRetry ? 'PENDING' : 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: shouldRetry ? null : new Date(),
        })
        .where(eq(embeddingJobs.id, job.id));
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return processed;
}

export async function getJobStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const stats = await db.select({
    status: embeddingJobs.status,
    count: sql<number>`count(*)`,
  })
    .from(embeddingJobs)
    .groupBy(embeddingJobs.status);
  
  const result = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  
  for (const row of stats) {
    const status = row.status.toLowerCase() as keyof typeof result;
    if (status in result) {
      result[status] = Number(row.count);
    }
  }
  
  return result;
}

export function startWorker(): void {
  if (isWorkerRunning) {
    console.log('Embedding worker already running');
    return;
  }
  
  isWorkerRunning = true;
  console.log('Starting embedding worker...');
  
  workerInterval = setInterval(async () => {
    try {
      const processed = await processNextBatch();
      if (processed > 0) {
        console.log(`Embedding worker processed ${processed} jobs`);
      }
    } catch (error) {
      console.error('Embedding worker error:', error);
    }
  }, WORKER_INTERVAL_MS);
}

export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isWorkerRunning = false;
  console.log('Embedding worker stopped');
}

export function isRunning(): boolean {
  return isWorkerRunning;
}

export const EmbeddingWorker = {
  createEmbeddingJob,
  createEmbeddingJobsForCoinType,
  processNextBatch,
  getJobStats,
  startWorker,
  stopWorker,
  isRunning,
};

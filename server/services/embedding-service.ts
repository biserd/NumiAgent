// In-house embedding service using CLIP model
// Runs on CPU via @xenova/transformers - no external AI APIs
// Rights-gated: Only computes embeddings when license permits

import { pipeline } from '@xenova/transformers';
import { db } from '../db';
import { imageEmbeddings } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

const MODEL_NAME = 'Xenova/clip-vit-base-patch32';
const EMBEDDING_DIM = 512;
const MODEL_VERSION = 'clip-vit-base-patch32';

// Using any type for pipeline since ImageFeatureExtractionPipeline doesn't match Pipeline interface
let imageEncoder: any = null;
let isModelLoading = false;

export async function getImageEncoder(): Promise<any> {
  if (imageEncoder) return imageEncoder;
  
  if (isModelLoading) {
    while (isModelLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (imageEncoder) return imageEncoder;
  }
  
  isModelLoading = true;
  try {
    console.log('Loading CLIP image encoder...');
    imageEncoder = await pipeline('image-feature-extraction', MODEL_NAME, {
      quantized: true,
    });
    console.log('CLIP image encoder loaded successfully');
    return imageEncoder;
  } finally {
    isModelLoading = false;
  }
}

export interface RightsGatingResult {
  allowed: boolean;
  reason: string;
  licenseMetadata?: string;
  licenseImages?: string;
}

export function canComputeEmbeddings(rights: {
  licenseImages?: string | null;
  licenseMetadata?: string | null;
  computeEmbeddingsOk?: boolean;
  commercialOk?: boolean;
  derivativeOk?: boolean;
}): RightsGatingResult {
  if (rights.computeEmbeddingsOk === true) {
    return { allowed: true, reason: 'Explicitly allowed by rights record' };
  }
  
  if (rights.computeEmbeddingsOk === false) {
    return { allowed: false, reason: 'Explicitly blocked by rights record' };
  }
  
  const license = rights.licenseImages?.toUpperCase() || 'UNKNOWN';
  
  switch (license) {
    case 'CC0':
    case 'PDM':
      return { 
        allowed: true, 
        reason: 'Public domain - embeddings allowed',
        licenseImages: license,
      };
    
    case 'CC_BY':
    case 'CC-BY':
      return { 
        allowed: true, 
        reason: 'CC-BY - embeddings allowed with attribution',
        licenseImages: license,
      };
    
    case 'CC_BY_SA':
    case 'CC-BY-SA':
      return { 
        allowed: false, 
        reason: 'CC-BY-SA - share-alike requirement incompatible with commercial corpus',
        licenseImages: license,
      };
    
    case 'CC_BY_NC':
    case 'CC-BY-NC':
    case 'CC_BY_NC_SA':
    case 'CC-BY-NC-SA':
      return { 
        allowed: false, 
        reason: 'Non-commercial license - not suitable for commercial corpus',
        licenseImages: license,
      };
    
    case 'ALL_RIGHTS_RESERVED':
      return { 
        allowed: false, 
        reason: 'All rights reserved - embeddings not permitted',
        licenseImages: license,
      };
    
    case 'UNKNOWN':
    default:
      return { 
        allowed: false, 
        reason: 'Unknown license - defaulting to link-out only',
        licenseImages: license,
      };
  }
}

export function canComputeEmbeddingsForUserUpload(): RightsGatingResult {
  return {
    allowed: true,
    reason: 'User upload - user owns the photo',
  };
}

export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NumisVault-Bot/1.0 (research; numismatics)',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to download image: ${response.status} ${url}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      console.error(`Not an image: ${contentType} ${url}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading image: ${error}`);
    return null;
  }
}

export async function computeImageEmbedding(imageData: Buffer | string): Promise<number[] | null> {
  try {
    const encoder = await getImageEncoder();
    
    let input: string;
    if (Buffer.isBuffer(imageData)) {
      const base64 = imageData.toString('base64');
      const mimeType = detectMimeType(imageData);
      input = `data:${mimeType};base64,${base64}`;
    } else {
      input = imageData;
    }
    
    const output = await encoder(input, { pooling: 'mean', normalize: true });
    
    const embedding = Array.from(output.data as Float32Array);
    
    if (embedding.length !== EMBEDDING_DIM) {
      console.warn(`Unexpected embedding dimension: ${embedding.length}, expected ${EMBEDDING_DIM}`);
    }
    
    return embedding;
  } catch (error) {
    console.error(`Error computing embedding: ${error}`);
    return null;
  }
}

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

export async function storeEmbedding(params: {
  coinTypeId?: string;
  userCoinId?: string;
  imageAssetId?: string;
  imageType: 'obverse' | 'reverse' | 'combined';
  embedding: number[];
  sourceImageUrl?: string;
}): Promise<string> {
  const [result] = await db.insert(imageEmbeddings).values({
    coinTypeId: params.coinTypeId,
    userCoinId: params.userCoinId,
    imageAssetId: params.imageAssetId,
    imageType: params.imageType,
    modelVersion: MODEL_VERSION,
    embeddingDim: EMBEDDING_DIM,
    embedding: JSON.stringify(params.embedding),
    sourceImageUrl: params.sourceImageUrl,
  }).returning({ id: imageEmbeddings.id });
  
  return result.id;
}

export async function computeAndStoreEmbedding(params: {
  coinTypeId?: string;
  userCoinId?: string;
  imageUrl: string;
  imageType: 'obverse' | 'reverse' | 'combined';
  rightsRecord?: {
    licenseImages?: string | null;
    computeEmbeddingsOk?: boolean;
  };
  isUserUpload?: boolean;
}): Promise<{ success: boolean; embeddingId?: string; error?: string }> {
  if (params.isUserUpload) {
    const gating = canComputeEmbeddingsForUserUpload();
    if (!gating.allowed) {
      return { success: false, error: gating.reason };
    }
  } else if (params.rightsRecord) {
    const gating = canComputeEmbeddings(params.rightsRecord);
    if (!gating.allowed) {
      return { success: false, error: gating.reason };
    }
  } else if (params.coinTypeId) {
    return { success: false, error: 'Rights record required for museum coin embeddings' };
  }
  
  const imageData = await downloadImage(params.imageUrl);
  if (!imageData) {
    return { success: false, error: 'Failed to download image' };
  }
  
  const embedding = await computeImageEmbedding(imageData);
  if (!embedding) {
    return { success: false, error: 'Failed to compute embedding' };
  }
  
  const embeddingId = await storeEmbedding({
    coinTypeId: params.coinTypeId,
    userCoinId: params.userCoinId,
    imageType: params.imageType,
    embedding,
    sourceImageUrl: params.imageUrl,
  });
  
  return { success: true, embeddingId };
}

export async function findSimilarByEmbedding(
  queryEmbedding: number[],
  options: {
    limit?: number;
    minSimilarity?: number;
    imageType?: 'obverse' | 'reverse' | 'combined';
    excludeCoinTypeIds?: string[];
  } = {}
): Promise<Array<{
  coinTypeId: string | null;
  userCoinId: string | null;
  similarity: number;
  imageType: string;
}>> {
  const { 
    limit = 20, 
    minSimilarity = 0.5,
    imageType,
    excludeCoinTypeIds = [],
  } = options;
  
  const queryVec = `'[${queryEmbedding.join(',')}]'::vector`;
  
  let whereClause = '';
  if (imageType) {
    whereClause += ` AND image_type = '${imageType}'`;
  }
  if (excludeCoinTypeIds.length > 0) {
    const excludeList = excludeCoinTypeIds.map(id => `'${id}'`).join(',');
    whereClause += ` AND (coin_type_id IS NULL OR coin_type_id NOT IN (${excludeList}))`;
  }
  
  const results = await db.execute(sql`
    SELECT 
      coin_type_id,
      user_coin_id,
      image_type,
      1 - (embedding::vector <=> ${sql.raw(queryVec)}) as similarity
    FROM image_embeddings
    WHERE 1=1 ${sql.raw(whereClause)}
    ORDER BY embedding::vector <=> ${sql.raw(queryVec)}
    LIMIT ${limit}
  `);
  
  return (results.rows as any[])
    .filter(row => row.similarity >= minSimilarity)
    .map(row => ({
      coinTypeId: row.coin_type_id,
      userCoinId: row.user_coin_id,
      similarity: parseFloat(row.similarity),
      imageType: row.image_type,
    }));
}

export async function getEmbeddingForCoinType(coinTypeId: string, imageType?: string): Promise<number[] | null> {
  const conditions = [eq(imageEmbeddings.coinTypeId, coinTypeId)];
  if (imageType) {
    conditions.push(eq(imageEmbeddings.imageType, imageType));
  }
  
  const [result] = await db.select()
    .from(imageEmbeddings)
    .where(and(...conditions))
    .orderBy(desc(imageEmbeddings.computedAt))
    .limit(1);
  
  if (!result) return null;
  
  return JSON.parse(result.embedding);
}

export async function getEmbeddingForUserCoin(userCoinId: string, imageType?: string): Promise<number[] | null> {
  const conditions = [eq(imageEmbeddings.userCoinId, userCoinId)];
  if (imageType) {
    conditions.push(eq(imageEmbeddings.imageType, imageType));
  }
  
  const [result] = await db.select()
    .from(imageEmbeddings)
    .where(and(...conditions))
    .orderBy(desc(imageEmbeddings.computedAt))
    .limit(1);
  
  if (!result) return null;
  
  return JSON.parse(result.embedding);
}

export async function hasEmbedding(coinTypeId?: string, userCoinId?: string): Promise<boolean> {
  const conditions = [];
  if (coinTypeId) conditions.push(eq(imageEmbeddings.coinTypeId, coinTypeId));
  if (userCoinId) conditions.push(eq(imageEmbeddings.userCoinId, userCoinId));
  
  if (conditions.length === 0) return false;
  
  const [result] = await db.select({ count: sql`count(*)` })
    .from(imageEmbeddings)
    .where(and(...conditions));
  
  return parseInt(result.count as string) > 0;
}

export const EmbeddingService = {
  getImageEncoder,
  canComputeEmbeddings,
  canComputeEmbeddingsForUserUpload,
  downloadImage,
  computeImageEmbedding,
  storeEmbedding,
  computeAndStoreEmbedding,
  findSimilarByEmbedding,
  getEmbeddingForCoinType,
  getEmbeddingForUserCoin,
  hasEmbedding,
  MODEL_NAME,
  MODEL_VERSION,
  EMBEDDING_DIM,
};

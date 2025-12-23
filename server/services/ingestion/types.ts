export interface MuseumObject {
  sourceId: string;
  externalId: string;
  title: string;
  description?: string;
  objectDate?: string;
  beginDate?: number;
  endDate?: number;
  medium?: string;
  dimensions?: string;
  culture?: string;
  period?: string;
  dynasty?: string;
  reign?: string;
  classification?: string;
  department?: string;
  creditLine?: string;
  accessionNumber?: string;
  artistDisplayName?: string;
  geography?: {
    country?: string;
    region?: string;
    city?: string;
    mint?: string;
  };
  primaryImageUrl?: string;
  additionalImageUrls?: string[];
  isPublicDomain: boolean;
  licenseCode?: string;
  objectUrl?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface IngestionResult {
  objectsProcessed: number;
  objectsIngested: number;
  objectsSkipped: number;
  imagesDownloaded: number;
  errors: Array<{ externalId: string; error: string }>;
  duration: number;
}

export interface IngestionOptions {
  limit?: number;
  offset?: number;
  batchSize?: number;
  downloadImages?: boolean;
  dryRun?: boolean;
  filterQuery?: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  type: 'met' | 'artic' | 'walters' | 'smithsonian';
  baseUrl: string;
  apiKey?: string;
  rateLimit: number;
  defaultLicense: string;
  enabled: boolean;
}

export const ALLOWED_LICENSES = ['CC0', 'PDM', 'CC-BY', 'CC-BY-SA'] as const;
export type AllowedLicense = typeof ALLOWED_LICENSES[number];

export function isAllowedLicense(license: string): license is AllowedLicense {
  return ALLOWED_LICENSES.includes(license as AllowedLicense);
}

export function canComputeEmbeddings(license: string): boolean {
  return ['CC0', 'PDM', 'CC-BY'].includes(license);
}

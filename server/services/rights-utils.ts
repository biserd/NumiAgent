// Centralized Rights Enforcement Utilities
// Handles license validation for ingestion and embedding computation

import type { LicenseCode } from "@shared/schema";

export interface RightsCheckResult {
  allowed: boolean;
  reason: string;
  license?: string;
}

// Allowed licenses for commercial corpus (ingestion + embeddings)
const ALLOWED_LICENSES: string[] = ['CC0', 'PDM', 'CC_BY', 'CC-BY'];

// Blocked licenses - explicit rejection
const BLOCKED_LICENSES: string[] = [
  'CC_BY_SA', 'CC-BY-SA',
  'CC_BY_NC', 'CC-BY-NC', 
  'CC_BY_NC_SA', 'CC-BY-NC-SA',
  'ALL_RIGHTS_RESERVED',
  'ODBL', // Open Database License - metadata ok but not images
];

export function isLicenseAllowedForIngestion(license: string | null | undefined): RightsCheckResult {
  if (!license) {
    return {
      allowed: false,
      reason: 'No license specified - defaulting to link-out only',
      license: 'UNKNOWN',
    };
  }

  const normalizedLicense = license.toUpperCase().replace(/-/g, '_');

  // Check if explicitly allowed
  if (ALLOWED_LICENSES.some(l => l.toUpperCase().replace(/-/g, '_') === normalizedLicense)) {
    return {
      allowed: true,
      reason: `License ${license} allows commercial use and embedding`,
      license,
    };
  }

  // Check if explicitly blocked
  if (BLOCKED_LICENSES.some(l => l.toUpperCase().replace(/-/g, '_') === normalizedLicense)) {
    return {
      allowed: false,
      reason: `License ${license} not compatible with commercial corpus`,
      license,
    };
  }

  // Unknown license - default to block
  return {
    allowed: false,
    reason: `Unknown license ${license} - defaulting to link-out only`,
    license,
  };
}

export function canIngestRecord(rights: {
  licenseImages?: string | null;
  licenseMetadata?: string | null;
}): RightsCheckResult {
  // Check image license (primary concern for embeddings)
  const imageCheck = isLicenseAllowedForIngestion(rights.licenseImages);
  
  if (!imageCheck.allowed) {
    return {
      allowed: false,
      reason: `Image: ${imageCheck.reason}`,
      license: rights.licenseImages || undefined,
    };
  }

  return {
    allowed: true,
    reason: 'Rights resolved - ingestion allowed',
    license: rights.licenseImages || undefined,
  };
}

export function canComputeEmbeddings(rights: {
  licenseImages?: string | null;
  licenseMetadata?: string | null;
  computeEmbeddingsOk?: boolean | null;
  commercialOk?: boolean | null;
}): RightsCheckResult {
  // Explicit flag takes precedence
  if (rights.computeEmbeddingsOk === true) {
    return { allowed: true, reason: 'Explicitly allowed by rights record' };
  }
  
  if (rights.computeEmbeddingsOk === false) {
    return { allowed: false, reason: 'Explicitly blocked by rights record' };
  }

  // Fall back to license check
  return isLicenseAllowedForIngestion(rights.licenseImages);
}

export function canComputeEmbeddingsForUserUpload(): RightsCheckResult {
  return {
    allowed: true,
    reason: 'User upload - user owns the photo',
  };
}

// Format license for display
export function formatLicenseDisplay(license: string | null | undefined): string {
  if (!license) return 'Unknown';
  
  const licenseMap: Record<string, string> = {
    'CC0': 'CC0 (Public Domain)',
    'PDM': 'Public Domain Mark',
    'CC_BY': 'CC BY 4.0',
    'CC-BY': 'CC BY 4.0',
    'CC_BY_SA': 'CC BY-SA 4.0',
    'CC-BY-SA': 'CC BY-SA 4.0',
    'CC_BY_NC': 'CC BY-NC 4.0',
    'CC-BY-NC': 'CC BY-NC 4.0',
    'CC_BY_NC_SA': 'CC BY-NC-SA 4.0',
    'CC-BY-NC-SA': 'CC BY-NC-SA 4.0',
    'ALL_RIGHTS_RESERVED': 'All Rights Reserved',
    'ODBL': 'ODbL 1.0',
    'UNKNOWN': 'Unknown',
  };

  return licenseMap[license.toUpperCase()] || license;
}

// Get license badge color class
export function getLicenseBadgeVariant(license: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!license) return 'outline';
  
  const normalized = license.toUpperCase().replace(/-/g, '_');
  
  if (['CC0', 'PDM'].includes(normalized)) {
    return 'default'; // Green/primary for public domain
  }
  
  if (['CC_BY'].includes(normalized)) {
    return 'secondary'; // Blue for attribution-only
  }
  
  if (BLOCKED_LICENSES.some(l => l.toUpperCase().replace(/-/g, '_') === normalized)) {
    return 'destructive'; // Red for blocked
  }
  
  return 'outline'; // Neutral for unknown
}

// Generate attribution text
export function generateAttribution(source: {
  name?: string;
  attributionTemplate?: string | null;
  homepageUrl?: string | null;
}, rights: {
  attributionText?: string | null;
  licenseImages?: string | null;
}): string {
  if (rights.attributionText) {
    return rights.attributionText;
  }
  
  if (source.attributionTemplate) {
    return source.attributionTemplate;
  }
  
  const license = formatLicenseDisplay(rights.licenseImages);
  return `Courtesy of ${source.name || 'Unknown Source'}, ${license}`;
}

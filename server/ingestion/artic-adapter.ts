// Art Institute of Chicago API + IIIF Adapter
// Fetches CC0 coin data from the Art Institute of Chicago API
// API Docs: https://api.artic.edu/docs/

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface ArticArtwork {
  id: number;
  api_model: string;
  api_link: string;
  is_public_domain: boolean;
  title: string;
  alt_titles: string[] | null;
  date_start: number | null;
  date_end: number | null;
  date_display: string;
  artist_display: string;
  artist_id: number | null;
  artist_title: string | null;
  place_of_origin: string;
  dimensions: string;
  medium_display: string;
  credit_line: string;
  publication_history: string | null;
  exhibition_history: string | null;
  provenance_text: string | null;
  inscriptions: string | null;
  classification_id: number | null;
  classification_title: string | null;
  department_id: number | null;
  department_title: string | null;
  artwork_type_id: number;
  artwork_type_title: string;
  style_id: number | null;
  style_title: string | null;
  style_titles: string[];
  culture_id: number | null;
  image_id: string | null;
  alt_image_ids: string[];
  document_ids: string[];
  thumbnail: {
    lqip: string;
    width: number;
    height: number;
    alt_text: string;
  } | null;
}

interface ArticSearchResponse {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    total_pages: number;
    current_page: number;
  };
  data: ArticArtwork[];
  config: {
    iiif_url: string;
    website_url: string;
  };
}

interface IngestionProgress {
  processed: number;
  total: number;
  currentRecord?: string;
}

const ARTIC_API_BASE = "https://api.artic.edu/api/v1";
const ARTIC_IIIF_BASE = "https://www.artic.edu/iiif/2";
const SOURCE_ID = "artic-chicago";

export async function searchArticCoins(
  page: number = 1,
  limit: number = 50
): Promise<{ artworks: ArticArtwork[]; total: number; iiifBase: string }> {
  try {
    const params = new URLSearchParams({
      q: "coin medal numismatic",
      page: page.toString(),
      limit: limit.toString(),
      fields: [
        "id", "api_link", "is_public_domain", "title", "alt_titles",
        "date_start", "date_end", "date_display", "artist_display",
        "artist_title", "place_of_origin", "dimensions", "medium_display",
        "credit_line", "inscriptions", "classification_title",
        "department_title", "artwork_type_title", "style_title",
        "style_titles", "image_id", "alt_image_ids", "thumbnail",
        "provenance_text"
      ].join(","),
    });
    
    const url = `${ARTIC_API_BASE}/artworks/search?${params}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error("Art Institute API search error:", response.status);
      return { artworks: [], total: 0, iiifBase: ARTIC_IIIF_BASE };
    }
    
    const data: ArticSearchResponse = await response.json();
    return {
      artworks: data.data || [],
      total: data.pagination?.total || 0,
      iiifBase: data.config?.iiif_url || ARTIC_IIIF_BASE,
    };
  } catch (error) {
    console.error("Art Institute API search failed:", error);
    return { artworks: [], total: 0, iiifBase: ARTIC_IIIF_BASE };
  }
}

export async function getArticArtwork(id: number): Promise<ArticArtwork | null> {
  try {
    const url = `${ARTIC_API_BASE}/artworks/${id}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error(`Art Institute API fetch error for ${id}:`, error);
    return null;
  }
}

function isCoin(artwork: ArticArtwork): boolean {
  const coinKeywords = ["coin", "medal", "medallion", "token", "numismatic", "denarius", "aureus", "sestertius"];
  
  const searchableText = [
    artwork.title,
    artwork.artwork_type_title,
    artwork.classification_title,
    artwork.department_title,
    ...(artwork.style_titles || []),
  ].filter(Boolean).join(" ").toLowerCase();
  
  return coinKeywords.some(keyword => searchableText.includes(keyword));
}

function getIIIFImageUrl(imageId: string | null, iiifBase: string): string | null {
  if (!imageId) return null;
  return `${iiifBase}/${imageId}/full/843,/0/default.jpg`;
}

function buildLabel(artwork: ArticArtwork): string {
  const parts = [artwork.title];
  
  if (artwork.artist_title && !artwork.title.includes(artwork.artist_title)) {
    parts.push(`- ${artwork.artist_title}`);
  }
  
  if (artwork.date_display && !artwork.title.includes(artwork.date_display)) {
    parts.push(`(${artwork.date_display})`);
  }
  
  return parts.join(" ").trim();
}

function extractMetal(medium: string | null): string | undefined {
  if (!medium) return undefined;
  
  const metals = ["gold", "silver", "bronze", "copper", "brass", "electrum", "billon", "lead", "iron"];
  const lowerMedium = medium.toLowerCase();
  
  for (const metal of metals) {
    if (lowerMedium.includes(metal)) {
      return metal.charAt(0).toUpperCase() + metal.slice(1);
    }
  }
  
  return undefined;
}

function extractDenomination(title: string): string | undefined {
  const denominations = [
    "denarius", "aureus", "sestertius", "as", "dupondius", "quadrans",
    "antoninianus", "solidus", "tremissis", "siliqua", "follis",
    "tetradrachm", "drachm", "stater", "obol", "hemidrachm",
    "shekel", "prutah", "lepton", "medal", "medallion"
  ];
  
  const lowerTitle = title.toLowerCase();
  
  for (const denom of denominations) {
    if (lowerTitle.includes(denom)) {
      return denom.charAt(0).toUpperCase() + denom.slice(1);
    }
  }
  
  return undefined;
}

function extractLegends(inscriptions: string | null): { obvLegend?: string; revLegend?: string } {
  if (!inscriptions) return {};
  
  const obvMatch = inscriptions.match(/(?:obverse|obv\.?)[:\s]+([^;]+)/i);
  const revMatch = inscriptions.match(/(?:reverse|rev\.?)[:\s]+([^;]+)/i);
  
  return {
    obvLegend: obvMatch ? obvMatch[1].trim() : undefined,
    revLegend: revMatch ? revMatch[1].trim() : undefined,
  };
}

export function transformArticArtworkToCoinType(
  artwork: ArticArtwork,
  iiifBase: string = ARTIC_IIIF_BASE
): InsertCoinType | null {
  if (!artwork.is_public_domain) {
    return null;
  }
  
  if (!isCoin(artwork)) {
    return null;
  }
  
  const imageUrl = getIIIFImageUrl(artwork.image_id, iiifBase);
  const { obvLegend, revLegend } = extractLegends(artwork.inscriptions);
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: artwork.id.toString(),
    sourceUrl: `https://www.artic.edu/artworks/${artwork.id}`,
    label: buildLabel(artwork),
    dateFrom: artwork.date_start,
    dateTo: artwork.date_end,
    imageUrl,
    authority: artwork.artist_title || undefined,
    mint: artwork.place_of_origin || undefined,
    metal: extractMetal(artwork.medium_display),
    denomination: extractDenomination(artwork.title),
    obvLegend,
    revLegend,
    referenceText: artwork.provenance_text || undefined,
  };
}

export function buildArticRightsRecord(artwork: ArticArtwork): InsertRightsRecord {
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: artwork.id.toString(),
    sourceUrl: `https://www.artic.edu/artworks/${artwork.id}`,
    licenseMetadata: "CC0",
    licenseImages: "CC0",
    commercialOk: true,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    derivativeOk: true,
    attributionText: artwork.credit_line || "Art Institute of Chicago",
    attributionUrl: `https://www.artic.edu/artworks/${artwork.id}`,
    rightsStatementUrl: "https://www.artic.edu/terms",
  };
}

export async function* ingestArticCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  let page = 1;
  let totalProcessed = 0;
  const pageSize = 50;
  
  while (totalProcessed < limit) {
    const { artworks, total, iiifBase } = await searchArticCoins(page, pageSize);
    
    if (artworks.length === 0) break;
    
    for (const artwork of artworks) {
      if (totalProcessed >= limit) break;
      
      const coinType = transformArticArtworkToCoinType(artwork, iiifBase);
      if (!coinType) continue;
      
      const rights = buildArticRightsRecord(artwork);
      
      totalProcessed++;
      
      if (onProgress) {
        onProgress({
          processed: totalProcessed,
          total: Math.min(total, limit),
          currentRecord: artwork.id.toString(),
        });
      }
      
      yield { coinType, rights };
    }
    
    if (artworks.length < pageSize) break;
    page++;
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

export const ArticAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchArticCoins,
  getById: getArticArtwork,
  transform: transformArticArtworkToCoinType,
  buildRights: buildArticRightsRecord,
  ingest: ingestArticCoins,
};

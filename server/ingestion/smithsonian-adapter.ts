// Smithsonian Open Access Adapter
// Fetches CC0 coin data from the Smithsonian Open Access API
// API Docs: https://www.si.edu/openaccess

import type { InsertCoinType, InsertRightsRecord } from "@shared/schema";

interface SmithsonianRecord {
  id: string;
  title: string;
  unitCode: string;
  type: string;
  url: string;
  content: {
    descriptiveNonRepeating?: {
      title?: { content: string };
      unit_code?: string;
      record_link?: string;
      guid?: string;
      online_media?: {
        media?: Array<{
          type: string;
          content: string;
          thumbnail?: string;
        }>;
      };
    };
    indexedStructured?: {
      date?: string[];
      name?: string[];
      culture?: string[];
      place?: string[];
      topic?: string[];
      object_type?: string[];
      material?: string[];
    };
    freetext?: {
      physicalDescription?: Array<{ content: string }>;
      notes?: Array<{ content: string }>;
      creditLine?: Array<{ content: string }>;
      date?: Array<{ content: string }>;
      name?: Array<{ content: string }>;
      place?: Array<{ content: string }>;
      setName?: Array<{ content: string }>;
    };
  };
}

interface SmithsonianSearchResponse {
  response: {
    rowCount: number;
    rows: SmithsonianRecord[];
  };
}

interface IngestionProgress {
  processed: number;
  total: number;
  currentRecord?: string;
}

const SI_API_BASE = "https://api.si.edu/openaccess/api/v1.0";
const SOURCE_ID = "smithsonian";

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.SMITHSONIAN_API_KEY;
  if (!apiKey) {
    console.warn("SMITHSONIAN_API_KEY not set - API requests may be rate limited");
    return "";
  }
  return apiKey;
}

export async function searchSmithsonianCoins(
  query: string = "coin",
  start: number = 0,
  rows: number = 50
): Promise<{ records: SmithsonianRecord[]; total: number }> {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      q: query,
      start: start.toString(),
      rows: rows.toString(),
      api_key: apiKey,
    });
    
    const url = `${SI_API_BASE}/search?${params}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error("Smithsonian API search error:", response.status);
      return { records: [], total: 0 };
    }
    
    const data: SmithsonianSearchResponse = await response.json();
    return {
      records: data.response?.rows || [],
      total: data.response?.rowCount || 0,
    };
  } catch (error) {
    console.error("Smithsonian API search failed:", error);
    return { records: [], total: 0 };
  }
}

export async function getSmithsonianRecord(id: string): Promise<SmithsonianRecord | null> {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      api_key: apiKey,
    });
    const url = `${SI_API_BASE}/content/${id}?${params}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.response?.content || null;
  } catch (error) {
    console.error(`Smithsonian API fetch error for ${id}:`, error);
    return null;
  }
}

function isCoin(record: SmithsonianRecord): boolean {
  const title = (record.title || "").toLowerCase();
  const objectTypes = (record.content?.indexedStructured?.object_type || []).map(t => 
    typeof t === 'string' ? t.toLowerCase() : (t as any)?.content?.toLowerCase() || ''
  );
  
  // Exclude books, catalogs, documents, and other non-physical coin items
  const excludeKeywords = [
    "catalog", "catalogue", "book", "bibliography", "journal", "magazine",
    "manuscript", "document", "paper", "pamphlet", "periodical", "publication",
    "guide", "handbook", "dictionary", "encyclopedia", "atlas", "thesis",
    "dissertation", "report", "newsletter", "proceedings", "text", "volume",
    "edition", "reprint", "facsimile", "photocopy", "microfilm", "slide",
    "photograph of", "image of", "picture of", "drawing of", "painting of",
    "coin box", "coin case", "coin holder", "coin cabinet", "coin tray",
    "telephone", "machine", "scale", "balance", "die", "mold", "press",
    // Publication indicators
    "foreword", "edited by", "compiled by", "lesson plan", "illustrated",
    "fully illustrated", "price list", "auction", "sale", "advertisement",
    "brochure", "flyer", "leaflet", "circular", "announcement", "inventory",
    "checklist", "register", "index", "list of", "collection of", "history of",
    "story of", "treasury of", "world of", "introduction to", "study of",
    // Publisher/author patterns
    "/ by", "/ edited", "/ compiled", ": a guide", ": an introduction",
    "pages", "pp.", "vol.", "no.", "issue", "quarterly", "monthly", "annual",
    // Display items
    "display board", "coin display", "exhibit", "exhibition"
  ];
  
  // Check if title contains excluded keywords
  if (excludeKeywords.some(keyword => title.includes(keyword))) {
    return false;
  }
  
  // Exclude titles that end with author attribution pattern (common in book titles)
  // Pattern: "Title - Author, Name" or "Title - Institution"
  const authorPattern = / - [A-Z][a-zA-Z]+,?\s*[A-Z]?[a-zA-Z]*$/;
  const institutionPattern = / - [A-Z][a-zA-Z\s]+(?:Inc|Ltd|Co|Company|Museum|Society|Institute|Press|Publishers?)\.?$/i;
  if (authorPattern.test(record.title || "") || institutionPattern.test(record.title || "")) {
    // Check if it still might be a coin (some coins have attribution too)
    const hasCoinIndicator = ["coin", "medal", "token", "denarius", "drachm", "stater", "aureus"].some(
      ind => title.includes(ind) && !title.includes(ind + "s of") && !title.includes("about " + ind)
    );
    if (!hasCoinIndicator) {
      return false;
    }
  }
  
  // Exclude if object type is clearly not a coin
  const excludeObjectTypes = [
    "books", "book", "texts", "photographs", "drawings", "paintings",
    "documents", "manuscripts", "prints", "posters", "cards", "postcards",
    "equipment", "tools", "containers", "boxes", "furniture"
  ];
  
  if (objectTypes.some(ot => excludeObjectTypes.some(excl => ot.includes(excl)))) {
    return false;
  }
  
  // Coin-related object types that indicate actual coins
  const coinObjectTypes = [
    "coin", "coins", "medal", "medals", "medallion", "medallions",
    "token", "tokens", "currency", "money", "numismatic"
  ];
  
  // Check if object_type explicitly mentions coins
  const hasObjectTypeCoin = objectTypes.some(ot => 
    coinObjectTypes.some(cot => ot.includes(cot))
  );
  
  // If object type explicitly says it's a coin, accept it
  if (hasObjectTypeCoin) {
    return true;
  }
  
  // For items without explicit coin object type, check if title contains coin keywords
  // These are broader patterns that match anywhere in the title
  const coinKeywordsInTitle = [
    "coin", "medal", "medallion", "token", "currency",
    "denarius", "sestertius", "aureus", "drachm", "tetradrachm",
    "stater", "solidus", "follis", "antoninianus", "dupondius",
    "obol", "hemidrachm", "didrachm", "tridrachm", "decadrachm",
    "as ", " as ", "nummus", "siliqua", "tremissis", "semis",
    "quadrans", "sesterius", "quinarius", "victoriatus"
  ];
  
  // Also check topic field for coin-related terms
  const topics = (record.content?.indexedStructured?.topic || []).map(t => 
    typeof t === 'string' ? t.toLowerCase() : (t as any)?.content?.toLowerCase() || ''
  );
  const hasTopicCoin = topics.some(topic => 
    coinKeywordsInTitle.some(keyword => topic.includes(keyword))
  );
  
  if (hasTopicCoin) {
    return true;
  }
  
  // Check if title contains any coin keyword (anywhere in title)
  if (coinKeywordsInTitle.some(keyword => title.includes(keyword))) {
    return true;
  }
  
  // Check physical description for coin indicators
  const physDesc = record.content?.freetext?.physicalDescription?.map(p => p.content.toLowerCase()).join(" ") || "";
  const physDescCoinKeywords = ["coin", "medal", "struck", "minted", "obverse", "reverse", "denomination"];
  if (physDescCoinKeywords.some(keyword => physDesc.includes(keyword))) {
    return true;
  }
  
  return false;
}

function parseDate(record: SmithsonianRecord): { dateFrom: number | null; dateTo: number | null } {
  const dates = record.content?.indexedStructured?.date || [];
  const freetextDates = record.content?.freetext?.date?.map(d => d.content) || [];
  
  const allDates = [...dates, ...freetextDates];
  
  for (const dateStr of allDates) {
    const bcMatch = dateStr.match(/(\d+)\s*(?:BC|BCE)/i);
    if (bcMatch) {
      return { dateFrom: -parseInt(bcMatch[1]), dateTo: -parseInt(bcMatch[1]) };
    }
    
    const adMatch = dateStr.match(/(\d+)\s*(?:AD|CE)?/i);
    if (adMatch) {
      const year = parseInt(adMatch[1]);
      if (year > 0 && year < 2000) {
        return { dateFrom: year, dateTo: year };
      }
    }
    
    const rangeMatch = dateStr.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      return { dateFrom: parseInt(rangeMatch[1]), dateTo: parseInt(rangeMatch[2]) };
    }
  }
  
  return { dateFrom: null, dateTo: null };
}

function getImageUrl(record: SmithsonianRecord): string | null {
  const media = record.content?.descriptiveNonRepeating?.online_media?.media;
  if (media && media.length > 0) {
    return media[0].content || media[0].thumbnail || null;
  }
  return null;
}

function buildLabel(record: SmithsonianRecord): string {
  const title = record.title || "";
  const structured = record.content?.indexedStructured;
  const freetext = record.content?.freetext;
  
  // If title is very generic (just "coin", "medal", etc.), try to build a richer label
  const genericTitles = ["coin", "coins", "medal", "medals", "token", "tokens", "currency"];
  const isGenericTitle = genericTitles.includes(title.toLowerCase().trim());
  
  if (isGenericTitle) {
    const labelParts: string[] = [];
    
    // Helper to safely get string value from potentially object field
    const getString = (val: any): string | null => {
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object' && typeof val.content === 'string') return val.content;
      return null;
    };
    
    // Try to get denomination or object type
    const objectType = getString(structured?.object_type?.[0]);
    if (objectType && !genericTitles.includes(objectType.toLowerCase())) {
      labelParts.push(objectType);
    } else {
      labelParts.push(title);
    }
    
    // Add culture/civilization
    const culture = getString(structured?.culture?.[0]);
    if (culture) {
      labelParts.push(`(${culture})`);
    }
    
    // Add place/mint
    const place = getString(structured?.place?.[0]) || freetext?.place?.[0]?.content;
    if (place && !labelParts.some(p => p.includes(place))) {
      labelParts.push(`- ${place}`);
    }
    
    // Add name/ruler if available
    const name = getString(structured?.name?.[0]) || freetext?.name?.[0]?.content;
    if (name && !labelParts.some(p => p.includes(name))) {
      labelParts.push(`- ${name}`);
    }
    
    // Add date if available
    const date = getString(structured?.date?.[0]) || freetext?.date?.[0]?.content;
    if (date) {
      labelParts.push(`[${date}]`);
    }
    
    return labelParts.join(" ").trim() || title;
  }
  
  // For non-generic titles, append ruler/name if not already in title
  const parts = [title];
  const names = structured?.name || [];
  if (names.length > 0) {
    // Handle both string and object formats
    const firstName = typeof names[0] === 'string' ? names[0] : (names[0] as any)?.content;
    if (firstName && typeof firstName === 'string' && !title.toLowerCase().includes(firstName.toLowerCase())) {
      parts.push(`- ${firstName}`);
    }
  }
  
  // Add culture if not in title
  const cultureVal = structured?.culture?.[0];
  const culture = typeof cultureVal === 'string' ? cultureVal : (cultureVal as any)?.content;
  if (culture && typeof culture === 'string' && !title.toLowerCase().includes(culture.toLowerCase())) {
    parts.push(`(${culture})`);
  }
  
  return parts.join(" ").trim();
}

function parsePhysicalDescription(record: SmithsonianRecord): {
  weight: string | null;
  diameter: string | null;
  metal: string | null;
  denomination: string | null;
} {
  const physDesc = record.content?.freetext?.physicalDescription?.map(p => p.content).join(" ") || "";
  const notes = record.content?.freetext?.notes?.map(n => n.content).join(" ") || "";
  const combined = `${physDesc} ${notes}`.toLowerCase();
  
  let weight: string | null = null;
  let diameter: string | null = null;
  let metal: string | null = null;
  let denomination: string | null = null;
  
  // Parse weight (grams, g, gr) - return numeric string only
  const weightMatch = combined.match(/(\d+\.?\d*)\s*(grams?|g\b|gr\b)/i);
  if (weightMatch) {
    weight = weightMatch[1];
  }
  
  // Parse diameter (mm, millimeters, cm) - return numeric string in mm
  const diamMatch = combined.match(/(\d+\.?\d*)\s*(mm|millimeters?|centimeters?|cm)/i);
  if (diamMatch) {
    const value = parseFloat(diamMatch[1]);
    const unit = diamMatch[2].toLowerCase();
    if (unit.startsWith('c')) {
      diameter = String(value * 10);
    } else {
      diameter = String(value);
    }
  }
  
  // Parse metal
  const metals = ["gold", "silver", "bronze", "copper", "brass", "electrum", "billon", "iron", "lead", "tin", "nickel"];
  for (const m of metals) {
    if (combined.includes(m)) {
      metal = m.charAt(0).toUpperCase() + m.slice(1);
      break;
    }
  }
  
  // Parse denomination from common patterns
  const denomPatterns = [
    /\b(denarius|denarii)\b/i,
    /\b(sestertius|sestertii|sesterius)\b/i,
    /\b(aureus|aurei)\b/i,
    /\b(as|asses)\b/i,
    /\b(dupondius|dupondii)\b/i,
    /\b(antoninianus|antoniniani)\b/i,
    /\b(solidus|solidi)\b/i,
    /\b(tremissis|tremisses)\b/i,
    /\b(follis|folles)\b/i,
    /\b(drachm|drachms|drachma|drachmae)\b/i,
    /\b(tetradrachm|tetradrachms)\b/i,
    /\b(stater|staters)\b/i,
    /\b(obol|obols|obolus)\b/i,
  ];
  
  for (const pattern of denomPatterns) {
    const match = combined.match(pattern);
    if (match) {
      denomination = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      break;
    }
  }
  
  return { weight, diameter, metal, denomination };
}

export function transformSmithsonianRecordToCoinType(record: SmithsonianRecord): InsertCoinType | null {
  if (!isCoin(record)) {
    return null;
  }
  
  const { dateFrom, dateTo } = parseDate(record);
  const imageUrl = getImageUrl(record);
  const { weight, diameter, metal: parsedMetal, denomination: parsedDenom } = parsePhysicalDescription(record);
  
  const structured = record.content?.indexedStructured;
  const freetext = record.content?.freetext;
  
  // Get metal from structured data or parsed from description
  const metal = structured?.material?.[0] || parsedMetal;
  
  // Get authority - try name, then culture
  const authority = structured?.name?.[0] || freetext?.name?.[0]?.content || structured?.culture?.[0];
  
  // Get mint/place
  const mint = structured?.place?.[0] || freetext?.place?.[0]?.content;
  
  // Get region from culture if not used as authority
  const region = structured?.culture?.[0] && structured?.name?.[0] ? structured.culture[0] : undefined;
  
  // Build reference text from notes and set name
  const notes = freetext?.notes?.map(n => n.content).join("; ") || "";
  const setName = freetext?.setName?.[0]?.content || "";
  const referenceText = [setName, notes].filter(Boolean).join(" - ") || undefined;
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.url || record.content?.descriptiveNonRepeating?.record_link || `https://collections.si.edu/search/detail/${record.id}`,
    label: buildLabel(record),
    dateFrom,
    dateTo,
    imageUrl,
    authority,
    mint,
    metal,
    denomination: parsedDenom,
    region,
    weightG: weight,
    diameterMm: diameter,
    obvLegend: undefined,
    revLegend: undefined,
    referenceText,
  };
}

export function buildSmithsonianRightsRecord(record: SmithsonianRecord): InsertRightsRecord {
  const creditLine = record.content?.freetext?.creditLine?.[0]?.content;
  
  return {
    sourceId: SOURCE_ID,
    sourceRecordId: record.id,
    sourceUrl: record.url || `https://collections.si.edu/search/detail/${record.id}`,
    licenseMetadata: "CC0",
    licenseImages: "CC0",
    commercialOk: true,
    rehostOk: true,
    cacheOk: true,
    embedOk: true,
    computeEmbeddingsOk: true,
    derivativeOk: true,
    attributionText: creditLine || "Smithsonian Institution",
    attributionUrl: record.url,
    rightsStatementUrl: "https://www.si.edu/openaccess",
  };
}

export async function* ingestSmithsonianCoins(
  limit: number = 100,
  onProgress?: (progress: IngestionProgress) => void
): AsyncGenerator<{ coinType: InsertCoinType; rights: InsertRightsRecord }> {
  // Use a single broad "coin" query to access all 380k+ coin records
  const query = "coin";
  let totalProcessed = 0;
  let totalYielded = 0;
  let start = 0;
  const batchSize = 100; // Larger batch size for efficiency
  
  // First, get the total count
  const { total: grandTotal } = await searchSmithsonianCoins(query, 0, 1);
  console.log(`[INFO] Smithsonian collection has ${grandTotal} coin records available`);
  
  while (totalYielded < limit) {
    const { records, total } = await searchSmithsonianCoins(query, start, batchSize);
    
    if (records.length === 0) {
      console.log(`[INFO] No more records from Smithsonian at offset ${start}`);
      break;
    }
    
    for (const record of records) {
      if (totalYielded >= limit) break;
      
      totalProcessed++;
      
      const coinType = transformSmithsonianRecordToCoinType(record);
      if (!coinType) continue;
      
      const rights = buildSmithsonianRightsRecord(record);
      
      totalYielded++;
      
      if (onProgress) {
        onProgress({
          processed: totalProcessed,
          total: Math.min(grandTotal, limit),
          currentRecord: record.id,
        });
      }
      
      yield { coinType, rights };
    }
    
    start += batchSize;
    
    if (start >= total) {
      console.log(`[INFO] Reached end of Smithsonian collection at offset ${start}`);
      break;
    }
    
    // Rate limiting - Smithsonian allows 30 requests/min, so ~2 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`[INFO] Smithsonian ingestion complete: ${totalProcessed} processed, ${totalYielded} yielded`);
}

export const SmithsonianAdapter = {
  sourceId: SOURCE_ID,
  searchCoins: searchSmithsonianCoins,
  getById: getSmithsonianRecord,
  transform: transformSmithsonianRecordToCoinType,
  buildRights: buildSmithsonianRightsRecord,
  ingest: ingestSmithsonianCoins,
};

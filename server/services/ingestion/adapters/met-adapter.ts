import { BaseMuseumAdapter } from '../base-adapter';
import type { MuseumObject, IngestionOptions, SourceConfig } from '../types';

interface MetObject {
  objectID: number;
  isHighlight: boolean;
  accessionNumber: string;
  accessionYear: string;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  additionalImages: string[];
  department: string;
  objectName: string;
  title: string;
  culture: string;
  period: string;
  dynasty: string;
  reign: string;
  artistDisplayName: string;
  artistDisplayBio: string;
  objectDate: string;
  objectBeginDate: number;
  objectEndDate: number;
  medium: string;
  dimensions: string;
  creditLine: string;
  geographyType: string;
  city: string;
  state: string;
  county: string;
  country: string;
  region: string;
  classification: string;
  objectURL: string;
  rightsAndReproduction: string;
}

interface MetSearchResponse {
  total: number;
  objectIDs: number[] | null;
}

export class MetMuseumAdapter extends BaseMuseumAdapter {
  static createConfig(): SourceConfig {
    return {
      id: 'met-museum',
      name: 'The Metropolitan Museum of Art',
      type: 'met',
      baseUrl: 'https://collectionapi.metmuseum.org/public/collection/v1',
      rateLimit: 40,
      defaultLicense: 'CC0',
      enabled: true,
    };
  }

  constructor() {
    super(MetMuseumAdapter.createConfig());
  }

  async fetchObjectIds(options?: IngestionOptions): Promise<string[]> {
    const url = `${this.config.baseUrl}/objects`;
    const data = await this.fetchWithRateLimit<MetSearchResponse>(url);
    return (data.objectIDs || []).map(id => String(id));
  }

  async searchCoins(query?: string, options?: IngestionOptions): Promise<string[]> {
    const searchUrl = new URL(`${this.config.baseUrl}/search`);
    searchUrl.searchParams.set('hasImages', 'true');
    searchUrl.searchParams.set('isOnView', 'false');
    
    const searchTerms = query || 'coin ancient';
    searchUrl.searchParams.set('q', searchTerms);
    
    searchUrl.searchParams.set('departmentId', '13');
    
    const data = await this.fetchWithRateLimit<MetSearchResponse>(searchUrl.toString());
    return (data.objectIDs || []).map(id => String(id));
  }

  async fetchObject(externalId: string): Promise<MuseumObject | null> {
    try {
      const url = `${this.config.baseUrl}/objects/${externalId}`;
      const obj = await this.fetchWithRateLimit<MetObject>(url);

      if (!obj || !obj.objectID) return null;

      const classification = (obj.classification || '').toLowerCase();
      const objectName = (obj.objectName || '').toLowerCase();
      const isCoin = classification.includes('coin') || 
                     objectName.includes('coin') || 
                     objectName.includes('numismatic') ||
                     classification.includes('numismatic');

      if (!isCoin && !objectName.includes('medal')) {
        return null;
      }

      return {
        sourceId: this.config.id,
        externalId: String(obj.objectID),
        title: obj.title || 'Untitled',
        description: this.buildDescription(obj),
        objectDate: obj.objectDate,
        beginDate: obj.objectBeginDate,
        endDate: obj.objectEndDate,
        medium: obj.medium,
        dimensions: obj.dimensions,
        culture: obj.culture,
        period: obj.period,
        dynasty: obj.dynasty,
        reign: obj.reign,
        classification: obj.objectName || obj.classification,
        department: obj.department,
        creditLine: obj.creditLine,
        accessionNumber: obj.accessionNumber,
        artistDisplayName: obj.artistDisplayName,
        geography: {
          country: obj.country,
          region: obj.region,
          city: obj.city,
        },
        primaryImageUrl: obj.isPublicDomain ? obj.primaryImage : undefined,
        additionalImageUrls: obj.isPublicDomain ? obj.additionalImages : undefined,
        isPublicDomain: obj.isPublicDomain,
        licenseCode: obj.isPublicDomain ? 'CC0' : 'UNKNOWN',
        objectUrl: obj.objectURL,
        rawMetadata: obj as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`Failed to fetch Met object ${externalId}:`, error);
      return null;
    }
  }

  private buildDescription(obj: MetObject): string {
    const parts: string[] = [];
    
    if (obj.objectName) parts.push(obj.objectName);
    if (obj.culture) parts.push(`Culture: ${obj.culture}`);
    if (obj.period) parts.push(`Period: ${obj.period}`);
    if (obj.dynasty) parts.push(`Dynasty: ${obj.dynasty}`);
    if (obj.reign) parts.push(`Reign: ${obj.reign}`);
    if (obj.medium) parts.push(`Medium: ${obj.medium}`);
    if (obj.dimensions) parts.push(`Dimensions: ${obj.dimensions}`);
    
    return parts.join('. ');
  }
}

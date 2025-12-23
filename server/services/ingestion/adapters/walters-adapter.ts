import { BaseMuseumAdapter } from '../base-adapter';
import type { MuseumObject, IngestionOptions, SourceConfig } from '../types';

interface WaltersObject {
  ObjectID: number;
  ObjectNumber: string;
  Title: string;
  DisplayDate: string;
  DateBeginYear: number;
  DateEndYear: number;
  Medium: string;
  Dimensions: string;
  CreditLine: string;
  Classification: string;
  Culture: string;
  Period: string;
  Dynasty: string;
  Reign: string;
  Description: string;
  Provenance: string;
  Creator: string;
  GeographicLocation: string;
  PrimaryImage: {
    Tiny: string;
    Small: string;
    Medium: string;
    Large: string;
    Raw: string;
  } | null;
  Images: Array<{
    Tiny: string;
    Small: string;
    Medium: string;
    Large: string;
    Raw: string;
  }>;
  ObjectURL: string;
}

interface WaltersResponse {
  Items: WaltersObject[];
  PageSize: number;
  Page: number;
  NextPage: boolean;
  PrevPage: boolean;
  ReturnCode: number;
  ReturnMessage: string;
  ReturnStatus: boolean;
}

export class WaltersAdapter extends BaseMuseumAdapter {
  static createConfig(): SourceConfig {
    return {
      id: 'walters',
      name: 'The Walters Art Museum',
      type: 'walters',
      baseUrl: 'https://api.thewalters.org/v1',
      rateLimit: 5,
      defaultLicense: 'CC0',
      enabled: true,
    };
  }

  constructor() {
    super(WaltersAdapter.createConfig());
  }

  async fetchObjectIds(options?: IngestionOptions): Promise<string[]> {
    return this.searchCoins(undefined, options);
  }

  async searchCoins(query?: string, options?: IngestionOptions): Promise<string[]> {
    const allIds: string[] = [];
    let page = 1;
    const pageSize = 100;
    const maxPages = options?.limit ? Math.ceil(options.limit / pageSize) : 20;

    while (page <= maxPages) {
      const url = new URL(`${this.config.baseUrl}/objects.json`);
      url.searchParams.set('apikey', 'get');
      url.searchParams.set('Classification', 'Coins');
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('page', String(page));

      if (query) {
        url.searchParams.set('keyword', query);
      }

      try {
        const response = await this.fetchWithRateLimit<WaltersResponse>(url.toString());
        
        if (!response.Items || response.Items.length === 0) break;
        
        for (const item of response.Items) {
          allIds.push(String(item.ObjectID));
        }

        if (!response.NextPage) break;
        page++;
      } catch (error) {
        console.error(`Error fetching Walters page ${page}:`, error);
        break;
      }
    }

    return allIds;
  }

  async fetchObject(externalId: string): Promise<MuseumObject | null> {
    try {
      const url = `${this.config.baseUrl}/objects/${externalId}.json?apikey=get`;
      const response = await this.fetchWithRateLimit<{ Data: WaltersObject }>(url);
      const obj = response.Data;

      if (!obj) return null;

      const classification = (obj.Classification || '').toLowerCase();
      if (!classification.includes('coin') && !classification.includes('numismatic')) {
        return null;
      }

      const primaryImageUrl = obj.PrimaryImage?.Raw || obj.PrimaryImage?.Large;
      const additionalImageUrls = obj.Images?.map(img => img.Raw || img.Large).filter(Boolean);

      const mintMatch = this.extractMintFromGeography(obj.GeographicLocation);

      return {
        sourceId: this.config.id,
        externalId: String(obj.ObjectID),
        title: obj.Title || 'Untitled',
        description: obj.Description,
        objectDate: obj.DisplayDate,
        beginDate: obj.DateBeginYear,
        endDate: obj.DateEndYear,
        medium: obj.Medium,
        dimensions: obj.Dimensions,
        culture: obj.Culture,
        period: obj.Period,
        dynasty: obj.Dynasty,
        reign: obj.Reign,
        classification: obj.Classification,
        creditLine: obj.CreditLine,
        accessionNumber: obj.ObjectNumber,
        artistDisplayName: obj.Creator,
        geography: {
          country: obj.GeographicLocation,
          mint: mintMatch,
        },
        primaryImageUrl,
        additionalImageUrls,
        isPublicDomain: true,
        licenseCode: 'CC0',
        objectUrl: obj.ObjectURL || `https://art.thewalters.org/detail/${obj.ObjectID}`,
        rawMetadata: obj as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`Failed to fetch Walters object ${externalId}:`, error);
      return null;
    }
  }
}

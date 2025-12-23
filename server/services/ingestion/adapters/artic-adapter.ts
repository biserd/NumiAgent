import { BaseMuseumAdapter } from '../base-adapter';
import type { MuseumObject, IngestionOptions, SourceConfig } from '../types';

interface ArticArtwork {
  id: number;
  title: string;
  artist_display: string;
  place_of_origin: string;
  description: string;
  date_display: string;
  date_start: number;
  date_end: number;
  medium_display: string;
  dimensions: string;
  credit_line: string;
  classification_title: string;
  artwork_type_title: string;
  department_title: string;
  is_public_domain: boolean;
  image_id: string;
  alt_image_ids: string[];
  style_title: string;
  api_link: string;
}

interface ArticSearchResponse {
  data: ArticArtwork[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    total_pages: number;
    current_page: number;
  };
  config: {
    iiif_url: string;
  };
}

export class ArticAdapter extends BaseMuseumAdapter {
  private iiifBaseUrl: string = 'https://www.artic.edu/iiif/2';

  static createConfig(): SourceConfig {
    return {
      id: 'artic',
      name: 'Art Institute of Chicago',
      type: 'artic',
      baseUrl: 'https://api.artic.edu/api/v1',
      rateLimit: 1,
      defaultLicense: 'CC0',
      enabled: true,
    };
  }

  constructor() {
    super(ArticAdapter.createConfig());
  }

  async fetchObjectIds(options?: IngestionOptions): Promise<string[]> {
    return this.searchCoins(undefined, options);
  }

  async searchCoins(query?: string, options?: IngestionOptions): Promise<string[]> {
    const allIds: string[] = [];
    const limit = 100;
    let page = 1;
    const maxPages = options?.limit ? Math.ceil(options.limit / limit) : 10;

    while (page <= maxPages) {
      const searchUrl = new URL(`${this.config.baseUrl}/artworks/search`);
      
      const searchParams: Record<string, unknown> = {
        q: query || 'coin ancient numismatic',
        query: {
          bool: {
            must: [
              { term: { is_public_domain: true } }
            ],
            should: [
              { match: { classification_title: 'coin' } },
              { match: { artwork_type_title: 'coin' } },
              { match: { title: 'coin' } },
            ],
            minimum_should_match: 1
          }
        },
        fields: ['id'],
        limit,
        page,
      };

      searchUrl.searchParams.set('params', JSON.stringify(searchParams));

      try {
        const response = await this.fetchWithRateLimit<ArticSearchResponse>(searchUrl.toString());
        
        if (!response.data || response.data.length === 0) break;
        
        for (const item of response.data) {
          allIds.push(String(item.id));
        }

        if (response.pagination.current_page >= response.pagination.total_pages) break;
        page++;
      } catch (error) {
        console.error(`Error fetching ARTIC page ${page}:`, error);
        break;
      }
    }

    return allIds;
  }

  async fetchObject(externalId: string): Promise<MuseumObject | null> {
    try {
      const url = `${this.config.baseUrl}/artworks/${externalId}?fields=id,title,artist_display,place_of_origin,description,date_display,date_start,date_end,medium_display,dimensions,credit_line,classification_title,artwork_type_title,department_title,is_public_domain,image_id,alt_image_ids,style_title,api_link`;
      
      const response = await this.fetchWithRateLimit<{ data: ArticArtwork; config: { iiif_url: string } }>(url);
      const obj = response.data;

      if (!obj) return null;

      if (response.config?.iiif_url) {
        this.iiifBaseUrl = response.config.iiif_url;
      }

      const classification = (obj.classification_title || '').toLowerCase();
      const artworkType = (obj.artwork_type_title || '').toLowerCase();
      const title = (obj.title || '').toLowerCase();

      const isCoin = classification.includes('coin') || 
                     artworkType.includes('coin') || 
                     title.includes('coin') ||
                     classification.includes('numismatic');

      if (!isCoin) {
        return null;
      }

      const primaryImageUrl = obj.image_id 
        ? `${this.iiifBaseUrl}/${obj.image_id}/full/843,/0/default.jpg`
        : undefined;

      const additionalImageUrls = obj.alt_image_ids?.map(
        id => `${this.iiifBaseUrl}/${id}/full/843,/0/default.jpg`
      );

      return {
        sourceId: this.config.id,
        externalId: String(obj.id),
        title: obj.title || 'Untitled',
        description: obj.description || this.buildDescription(obj),
        objectDate: obj.date_display,
        beginDate: obj.date_start,
        endDate: obj.date_end,
        medium: obj.medium_display,
        dimensions: obj.dimensions,
        culture: obj.style_title,
        classification: obj.classification_title || obj.artwork_type_title,
        department: obj.department_title,
        creditLine: obj.credit_line,
        artistDisplayName: obj.artist_display,
        geography: {
          country: obj.place_of_origin,
        },
        primaryImageUrl: obj.is_public_domain ? primaryImageUrl : undefined,
        additionalImageUrls: obj.is_public_domain ? additionalImageUrls : undefined,
        isPublicDomain: obj.is_public_domain,
        licenseCode: obj.is_public_domain ? 'CC0' : 'UNKNOWN',
        objectUrl: `https://www.artic.edu/artworks/${obj.id}`,
        rawMetadata: obj as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`Failed to fetch ARTIC object ${externalId}:`, error);
      return null;
    }
  }

  private buildDescription(obj: ArticArtwork): string {
    const parts: string[] = [];
    
    if (obj.artist_display) parts.push(obj.artist_display);
    if (obj.date_display) parts.push(obj.date_display);
    if (obj.medium_display) parts.push(obj.medium_display);
    if (obj.place_of_origin) parts.push(`Origin: ${obj.place_of_origin}`);
    
    return parts.join('. ');
  }
}

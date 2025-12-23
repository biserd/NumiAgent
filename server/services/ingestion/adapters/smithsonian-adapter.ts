import { BaseMuseumAdapter } from '../base-adapter';
import type { MuseumObject, IngestionOptions, SourceConfig } from '../types';

interface SmithsonianMedia {
  thumbnail: string;
  idsId: string;
  content: string;
  type: string;
  usage: {
    access: string;
  };
}

interface SmithsonianContent {
  descriptiveNonRepeating: {
    title: { content: string };
    record_ID: string;
    record_link: string;
    online_media?: {
      media: SmithsonianMedia[];
    };
  };
  freetext?: {
    date?: Array<{ content: string }>;
    name?: Array<{ content: string; label: string }>;
    notes?: Array<{ content: string; label: string }>;
    physicalDescription?: Array<{ content: string; label: string }>;
    place?: Array<{ content: string; label: string }>;
    topic?: Array<{ content: string; label: string }>;
    setName?: Array<{ content: string }>;
    creditLine?: Array<{ content: string }>;
  };
  indexedStructured?: {
    date?: string[];
    name?: string[];
    topic?: string[];
    place?: string[];
    object_type?: string[];
  };
}

interface SmithsonianRow {
  id: string;
  title: string;
  content: SmithsonianContent;
  url: string;
}

interface SmithsonianSearchResponse {
  response: {
    rows: SmithsonianRow[];
    rowCount: number;
  };
}

export class SmithsonianAdapter extends BaseMuseumAdapter {
  private apiKey: string;

  static createConfig(apiKey?: string): SourceConfig {
    return {
      id: 'smithsonian',
      name: 'Smithsonian Institution',
      type: 'smithsonian',
      baseUrl: 'https://api.si.edu/openaccess/api/v1.0',
      apiKey,
      rateLimit: 5,
      defaultLicense: 'CC0',
      enabled: true,
    };
  }

  constructor(apiKey?: string) {
    super(SmithsonianAdapter.createConfig(apiKey));
    this.apiKey = apiKey || process.env.SMITHSONIAN_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('Smithsonian adapter initialized without API key. Set SMITHSONIAN_API_KEY environment variable.');
    }
  }

  async fetchObjectIds(options?: IngestionOptions): Promise<string[]> {
    return this.searchCoins(undefined, options);
  }

  async searchCoins(query?: string, options?: IngestionOptions): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error('Smithsonian API key is required. Register at https://api.data.gov/signup/');
    }

    const allIds: string[] = [];
    let start = 0;
    const rows = 100;
    const maxResults = options?.limit || 1000;

    while (allIds.length < maxResults) {
      const searchUrl = new URL(`${this.config.baseUrl}/search`);
      searchUrl.searchParams.set('api_key', this.apiKey);
      
      const searchQuery = query || 'coin numismatics currency';
      searchUrl.searchParams.set('q', `${searchQuery} unit_code:NMAH`);
      searchUrl.searchParams.set('start', String(start));
      searchUrl.searchParams.set('rows', String(rows));

      try {
        const response = await this.fetchWithRateLimit<SmithsonianSearchResponse>(searchUrl.toString());
        
        if (!response.response?.rows || response.response.rows.length === 0) break;
        
        for (const item of response.response.rows) {
          allIds.push(item.id);
        }

        if (response.response.rows.length < rows) break;
        start += rows;
      } catch (error) {
        console.error(`Error fetching Smithsonian page at offset ${start}:`, error);
        break;
      }
    }

    return allIds.slice(0, maxResults);
  }

  async fetchObject(externalId: string): Promise<MuseumObject | null> {
    if (!this.apiKey) {
      throw new Error('Smithsonian API key is required');
    }

    try {
      const url = `${this.config.baseUrl}/content/${externalId}?api_key=${this.apiKey}`;
      const response = await this.fetchWithRateLimit<{ response: SmithsonianRow }>(url);
      const row = response.response;

      if (!row || !row.content) return null;

      const content = row.content;
      const desc = content.descriptiveNonRepeating;
      const free = content.freetext || {};
      const indexed = content.indexedStructured || {};

      const objectTypes = indexed.object_type || [];
      const isCoin = objectTypes.some(t => 
        t.toLowerCase().includes('coin') || 
        t.toLowerCase().includes('currency') ||
        t.toLowerCase().includes('numismatic')
      );

      const topics = indexed.topic || [];
      const hasNumismaticTopic = topics.some(t =>
        t.toLowerCase().includes('coin') ||
        t.toLowerCase().includes('numismatic') ||
        t.toLowerCase().includes('currency')
      );

      if (!isCoin && !hasNumismaticTopic) {
        return null;
      }

      const media = desc.online_media?.media || [];
      const cc0Media = media.filter(m => m.usage?.access === 'CC0');
      const primaryImage = cc0Media[0];

      const dateContent = free.date?.[0]?.content;
      const dates = this.normalizeDate(dateContent);

      const physDesc = free.physicalDescription?.map(p => p.content).join('; ');
      const notes = free.notes?.map(n => `${n.label}: ${n.content}`).join('. ');
      const places = free.place?.map(p => p.content) || [];
      const creditLine = free.creditLine?.[0]?.content;

      return {
        sourceId: this.config.id,
        externalId,
        title: desc.title?.content || row.title || 'Untitled',
        description: notes || undefined,
        objectDate: dateContent,
        beginDate: dates.begin,
        endDate: dates.end,
        medium: physDesc,
        classification: objectTypes.join(', '),
        creditLine,
        geography: {
          country: places[0],
          region: places[1],
        },
        primaryImageUrl: primaryImage?.content,
        additionalImageUrls: cc0Media.slice(1).map(m => m.content),
        isPublicDomain: cc0Media.length > 0,
        licenseCode: cc0Media.length > 0 ? 'CC0' : 'UNKNOWN',
        objectUrl: desc.record_link || row.url,
        rawMetadata: row as unknown as Record<string, unknown>,
      };
    } catch (error) {
      console.error(`Failed to fetch Smithsonian object ${externalId}:`, error);
      return null;
    }
  }
}

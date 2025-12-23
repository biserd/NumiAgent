import { RateLimiter, withRetry } from './rate-limiter';
import type { MuseumObject, IngestionResult, IngestionOptions, SourceConfig } from './types';

export abstract class BaseMuseumAdapter {
  protected config: SourceConfig;
  protected rateLimiter: RateLimiter;

  constructor(config: SourceConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  abstract fetchObjectIds(options?: IngestionOptions): Promise<string[]>;
  
  abstract fetchObject(externalId: string): Promise<MuseumObject | null>;

  abstract searchCoins(query?: string, options?: IngestionOptions): Promise<string[]>;

  protected async fetchWithRateLimit<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    await this.rateLimiter.acquire();
    
    return withRetry(
      async () => {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'NumisVault/1.0 (ancient coin research platform)',
            ...options?.headers,
          },
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          (error as any).status = response.status;
          throw error;
        }

        return response.json() as Promise<T>;
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        retryOn: (error: any) => {
          const status = error?.status;
          return status === 429 || status === 503 || status >= 500;
        },
      }
    );
  }

  protected normalizeDate(dateStr: string | undefined): { begin?: number; end?: number } {
    if (!dateStr) return {};
    
    const bcMatch = dateStr.match(/(\d+)\s*(BC|BCE|B\.C\.)/i);
    if (bcMatch) {
      return { begin: -parseInt(bcMatch[1]), end: -parseInt(bcMatch[1]) };
    }
    
    const adMatch = dateStr.match(/(\d+)\s*(AD|CE|A\.D\.)?/i);
    if (adMatch) {
      return { begin: parseInt(adMatch[1]), end: parseInt(adMatch[1]) };
    }
    
    const rangeMatch = dateStr.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      return { begin: parseInt(rangeMatch[1]), end: parseInt(rangeMatch[2]) };
    }
    
    return {};
  }

  protected extractMintFromGeography(geography: string | undefined): string | undefined {
    if (!geography) return undefined;
    
    const mintPatterns = [
      /mint(?:ed)?\s*(?:at|in|:)?\s*([A-Za-z]+)/i,
      /struck\s*(?:at|in)\s*([A-Za-z]+)/i,
    ];
    
    for (const pattern of mintPatterns) {
      const match = geography.match(pattern);
      if (match) return match[1];
    }
    
    return undefined;
  }

  getSourceId(): string {
    return this.config.id;
  }

  getDefaultLicense(): string {
    return this.config.defaultLicense;
  }
}

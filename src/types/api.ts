import { Product, ProductMatch, Synonym, SourcingRecommendation } from './product.js';

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Health check
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  cache: {
    products: number;
    synonyms: number;
    lastRefresh: string;
  };
}

// Product search
export interface ProductSearchRequest {
  query: string;
  includeSourcing?: boolean;
}

export interface ProductSearchResponse {
  query: string;
  synonymResolved: string | null;
  products: Array<{
    name: string;
    category: string;
    url: string;
    websiteColors: string[];
    sourcing?: {
      local: {
        supplier: string;
        moq: number | null;
        leadTime: string;
        colors: string[];
      };
      china: {
        available: boolean;
        moq: number | null;
        air: boolean;
        sea: boolean;
        colors: string;
      };
    };
  }>;
  totalFound: number;
}

// Availability check
export interface AvailabilityRequest {
  query: string;
  quantity?: number;
  urgent?: boolean;
}

export interface AvailabilityResponse {
  query: string;
  parsed: {
    product: string;
    color: string | null;
    quantity: number | null;
    urgent: boolean;
  };
  synonymResolved: string | null;
  availability: {
    found: boolean;
    colorAvailable: boolean;
    matchingProducts: ProductMatch[];
  };
  summary: string;
}

// Synonyms
export interface SynonymsResponse {
  synonyms: Array<{
    customerSays: string;
    weCallIt: string;
  }>;
  total: number;
}

// Scraper
export interface ScraperRunRequest {
  mode?: 'incremental' | 'full';
  dryRun?: boolean;
  categoryUrl?: string;
  limit?: number;
}

export interface ScraperRunResponse {
  mode: string;
  startedAt: string;
  completedAt: string;
  stats: {
    pagesCrawled: number;
    newProducts: number;
    updatedProducts: number;
    unchanged: number;
    errors: number;
  };
}

// Cache refresh
export interface CacheRefreshResponse {
  productsLoaded: number;
  synonymsLoaded: number;
  refreshTimeMs: number;
}

// Parsed query from Claude
export interface ParsedQuery {
  productType: string;
  color: string | null;
  quantity: number | null;
  urgent: boolean;
}

// Multi-product support types
export interface ParsedQueryItem {
  productType: string;
  color: string | null;
  quantity: number | null;
  urgent: boolean;
}

export interface MultiParsedQuery {
  items: ParsedQueryItem[];
  globalUrgent: boolean;
}

export interface MultiAvailabilityRequest {
  query: string;
  urgent?: boolean;
}

export interface ProductAvailabilityResult {
  originalQuery: string;
  parsed: {
    product: string;
    color: string | null;
    quantity: number | null;
    urgent: boolean;
  };
  synonymResolved: string | null;
  availability: {
    found: boolean;
    colorAvailable: boolean;
    matchingProducts: ProductMatch[];
  };
  summary: string;
}

export interface MultiAvailabilityResponse {
  query: string;
  totalProductsRequested: number;
  totalProductsFound: number;
  results: ProductAvailabilityResult[];
  combinedSummary: string;
}

// Product term resolution (for Price Agent)
export interface ResolveRequest {
  terms: string[];
}

export interface ProductResolution {
  input: string;
  canonicalName: string | null;
  confidence: 'exact' | 'synonym' | 'fuzzy' | 'not_found';
  alternates: string[];
  category: string | null;
}

export interface ResolveResponse {
  resolutions: ProductResolution[];
}

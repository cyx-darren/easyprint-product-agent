export interface Product {
  name: string;
  category: string;
  url: string;
  otherNames: string;
  websiteColors: string[];
  sourcing: {
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
  notes: string;
  lastUpdated: string;
}

export interface ScrapedProduct {
  name: string;
  category: string;
  url: string;
  colors: string[];
  scrapedAt: string;
  sourceUrl: string;
}

export interface Synonym {
  customerSays: string;
  weCallIt: string;
  notes: string;
}

export interface ColorAvailability {
  available: boolean;
  source: 'website' | 'local' | 'china' | 'any';
  note?: string;
}

export interface SourcingRecommendation {
  source: 'local' | 'china';
  supplier?: string;
  moq?: number;
  leadTime?: string;
  reason: string;
}

export interface ProductMatch {
  product: Product;
  colorMatch: {
    onWebsite: boolean;
    fromLocal: boolean;
    fromChina: boolean;
  };
  recommendation: SourcingRecommendation;
}

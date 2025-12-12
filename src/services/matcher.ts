import { Product, Synonym, ColorAvailability, SourcingRecommendation, ProductMatch } from '../types/product.js';
import { cacheService } from './cache.js';
import { logger } from '../utils/logger.js';
import { containsIgnoreCase, normalize } from '../utils/helpers.js';

class MatcherService {
  /**
   * Resolve a customer term to internal product name using synonyms
   */
  resolveSynonym(term: string): string | null {
    const synonyms = cacheService.getSynonyms();
    const normalizedTerm = normalize(term);

    // Direct match
    const directMatch = synonyms.find(
      (s) => normalize(s.customerSays) === normalizedTerm
    );
    if (directMatch) {
      logger.debug('Synonym resolved (direct match)', {
        from: term,
        to: directMatch.weCallIt,
      });
      return directMatch.weCallIt;
    }

    // Partial match (term contains synonym)
    const partialMatch = synonyms.find((s) =>
      normalizedTerm.includes(normalize(s.customerSays))
    );
    if (partialMatch) {
      logger.debug('Synonym resolved (partial match)', {
        from: term,
        to: partialMatch.weCallIt,
      });
      return partialMatch.weCallIt;
    }

    return null;
  }

  /**
   * Find products matching a search term
   */
  findProducts(searchTerm: string): Product[] {
    const products = cacheService.getProducts();
    const normalizedSearch = normalize(searchTerm);

    const matches = products.filter((product) => {
      // Match by name
      if (containsIgnoreCase(product.name, searchTerm)) {
        return true;
      }

      // Match by category
      if (containsIgnoreCase(product.category, searchTerm)) {
        return true;
      }

      // Match by other names (synonyms in column D)
      if (product.otherNames) {
        const otherNames = product.otherNames.split(',').map((n) => normalize(n.trim()));
        if (otherNames.some((n) => n.includes(normalizedSearch) || normalizedSearch.includes(n))) {
          return true;
        }
      }

      return false;
    });

    logger.debug('Found products', { searchTerm, count: matches.length });
    return matches;
  }

  /**
   * Check color availability for a product
   */
  checkColorAvailability(product: Product, requestedColor: string | null): ColorAvailability {
    if (!requestedColor) {
      return { available: true, source: 'any' };
    }

    const colorLower = requestedColor.toLowerCase();

    // Check website colors
    const websiteColors = product.websiteColors.map((c) => c.toLowerCase());
    if (websiteColors.some((c) => c.includes(colorLower) || colorLower.includes(c))) {
      return { available: true, source: 'website' };
    }

    // Check local supplier colors
    const localColors = product.sourcing.local.colors.map((c) => c.toLowerCase());
    if (localColors.some((c) => c.includes(colorLower) || colorLower.includes(c))) {
      return { available: true, source: 'local' };
    }

    // Check China colors (often "Any Pantone" or similar)
    const chinaColors = product.sourcing.china.colors.toLowerCase();
    if (
      chinaColors.includes('pantone') ||
      chinaColors.includes('any') ||
      chinaColors.includes(colorLower)
    ) {
      return {
        available: true,
        source: 'china',
        note: 'Custom Pantone color available',
      };
    }

    return { available: false, source: 'any' };
  }

  /**
   * Recommend sourcing based on quantity and urgency
   */
  recommendSourcing(
    product: Product,
    quantity: number | null,
    urgent: boolean
  ): SourcingRecommendation {
    const { local, china } = product.sourcing;

    // No China option available
    if (!china.available) {
      return {
        source: 'local',
        supplier: local.supplier || undefined,
        moq: local.moq || undefined,
        leadTime: local.leadTime || undefined,
        reason: 'China sourcing not available for this product',
      };
    }

    // Urgent - always local
    if (urgent) {
      return {
        source: 'local',
        supplier: local.supplier || undefined,
        moq: local.moq || undefined,
        leadTime: local.leadTime || undefined,
        reason: 'Urgent delivery requested - local supplier fastest',
      };
    }

    // Quantity below China MOQ
    if (quantity && china.moq && quantity < china.moq) {
      return {
        source: 'local',
        supplier: local.supplier || undefined,
        moq: local.moq || undefined,
        leadTime: local.leadTime || undefined,
        reason: `Quantity ${quantity} below China MOQ (${china.moq})`,
      };
    }

    // Quantity meets China MOQ, not urgent
    if (quantity && china.moq && quantity >= china.moq) {
      return {
        source: 'china',
        moq: china.moq,
        reason: `Quantity ${quantity} meets China MOQ (${china.moq}), better pricing`,
      };
    }

    // Default to local if no quantity specified
    return {
      source: 'local',
      supplier: local.supplier || undefined,
      moq: local.moq || undefined,
      leadTime: local.leadTime || undefined,
      reason: 'Default to local supplier for standard orders',
    };
  }

  /**
   * Full product matching with sourcing recommendations
   */
  getProductMatches(
    searchTerm: string,
    color: string | null,
    quantity: number | null,
    urgent: boolean
  ): ProductMatch[] {
    // Try to resolve synonym first
    const resolved = this.resolveSynonym(searchTerm);
    const effectiveSearchTerm = resolved || searchTerm;

    // Find matching products
    const products = this.findProducts(effectiveSearchTerm);

    // Build matches with availability and recommendations
    return products.map((product) => {
      const colorAvailability = this.checkColorAvailability(product, color);
      const recommendation = this.recommendSourcing(product, quantity, urgent);

      return {
        product,
        colorMatch: {
          onWebsite: colorAvailability.source === 'website',
          fromLocal: colorAvailability.source === 'local' || colorAvailability.source === 'website',
          fromChina: product.sourcing.china.available && (colorAvailability.source === 'china' || colorAvailability.available),
        },
        recommendation,
      };
    });
  }
}

export const matcherService = new MatcherService();

import { Request, Response, NextFunction } from 'express';
import { parserService, matcherService, cacheService } from '../../services/index.js';
import { createError } from '../middleware/error.js';
import { generateAvailabilitySummary } from '../../utils/helpers.js';
import {
  ProductSearchRequest,
  ProductSearchResponse,
  AvailabilityRequest,
  AvailabilityResponse,
  SynonymsResponse,
} from '../../types/api.js';

/**
 * POST /api/product/search
 * Search for products by name/category
 */
export async function searchProducts(
  req: Request<{}, {}, ProductSearchRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { query, includeSourcing = true } = req.body;

    if (!query) {
      throw createError('Query is required', 400, 'INVALID_REQUEST', { field: 'query' });
    }

    // Resolve synonym if any
    const synonymResolved = matcherService.resolveSynonym(query);
    const effectiveQuery = synonymResolved || query;

    // Find products
    const products = matcherService.findProducts(effectiveQuery);

    const response: ProductSearchResponse = {
      query,
      synonymResolved,
      products: products.map((p) => ({
        name: p.name,
        category: p.category,
        url: p.url,
        websiteColors: p.websiteColors,
        ...(includeSourcing && {
          sourcing: {
            local: {
              supplier: p.sourcing.local.supplier,
              moq: p.sourcing.local.moq,
              leadTime: p.sourcing.local.leadTime,
              colors: p.sourcing.local.colors,
            },
            china: {
              available: p.sourcing.china.available,
              moq: p.sourcing.china.moq,
              air: p.sourcing.china.air,
              sea: p.sourcing.china.sea,
              colors: p.sourcing.china.colors,
            },
          },
        }),
      })),
      totalFound: products.length,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/product/availability
 * Check product availability with color and sourcing recommendation
 */
export async function checkAvailability(
  req: Request<{}, {}, AvailabilityRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { query, quantity, urgent = false } = req.body;

    if (!query) {
      throw createError('Query is required', 400, 'INVALID_REQUEST', { field: 'query' });
    }

    // Parse query using Claude
    const parsed = await parserService.parseQuery(query);

    // Resolve synonym
    const synonymResolved = matcherService.resolveSynonym(parsed.productType);

    // Get product matches with recommendations
    const matches = matcherService.getProductMatches(
      parsed.productType,
      parsed.color,
      quantity || parsed.quantity,
      urgent || parsed.urgent
    );

    // Determine if color is available in any product
    const colorAvailable = matches.some(
      (m) => m.colorMatch.onWebsite || m.colorMatch.fromLocal || m.colorMatch.fromChina
    );

    // Generate summary
    let summary: string;
    if (matches.length === 0) {
      summary = `No products found matching "${parsed.productType}". Please check the product name or try a different search term.`;
    } else if (parsed.color && !colorAvailable) {
      summary = `Products matching "${parsed.productType}" found, but ${parsed.color} color is not available. Check available colors in the results.`;
    } else {
      const firstMatch = matches[0];
      summary = generateAvailabilitySummary(
        firstMatch.product.name,
        parsed.color,
        firstMatch.recommendation.source,
        firstMatch.recommendation.supplier,
        firstMatch.recommendation.leadTime,
        quantity || parsed.quantity
      );
    }

    const response: AvailabilityResponse = {
      query,
      parsed: {
        product: parsed.productType,
        color: parsed.color,
        quantity: quantity || parsed.quantity,
        urgent: urgent || parsed.urgent,
      },
      synonymResolved,
      availability: {
        found: matches.length > 0,
        colorAvailable,
        matchingProducts: matches.map((m) => ({
          product: m.product,
          colorMatch: m.colorMatch,
          recommendation: m.recommendation,
        })),
      },
      summary,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/product/synonyms
 * Get list of all synonyms
 */
export async function getSynonyms(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const synonyms = cacheService.getSynonyms();

    const response: SynonymsResponse = {
      synonyms: synonyms.map((s) => ({
        customerSays: s.customerSays,
        weCallIt: s.weCallIt,
      })),
      total: synonyms.length,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from 'express';
import { parserService, matcherService, cacheService } from '../../services/index.js';
import { createError } from '../middleware/error.js';
import { generateAvailabilitySummary, generateMultiAvailabilitySummary, parseQuantityFromQuery } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';
import {
  ProductSearchRequest,
  ProductSearchResponse,
  AvailabilityRequest,
  AvailabilityResponse,
  SynonymsResponse,
  MultiAvailabilityRequest,
  MultiAvailabilityResponse,
  ProductAvailabilityResult,
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

    logger.info('Product search request', { query, includeSourcing });

    if (!query) {
      throw createError('Query is required', 400, 'INVALID_REQUEST', { field: 'query' });
    }

    // Resolve synonym if any
    const synonymResolved = matcherService.resolveSynonym(query);
    const effectiveQuery = synonymResolved || query;

    // Find products
    const products = matcherService.findProducts(effectiveQuery);

    // Log sourcing summary for each product
    const sourcingSummary = products.map((p) => ({
      name: p.name,
      localAvailable: !!p.sourcing.local.supplier,
      chinaAvailable: p.sourcing.china.available,
    }));
    logger.info('Product search results', {
      query,
      synonymResolved,
      totalFound: products.length,
      products: sourcingSummary,
    });

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
    let { query, quantity, urgent = false } = req.body;

    logger.info('Availability check request', { query, quantity, urgent });

    if (!query) {
      throw createError('Query is required', 400, 'INVALID_REQUEST', { field: 'query' });
    }

    // If quantity not provided in request body, parse from query text
    if (quantity === null || quantity === undefined) {
      const parsedQuantity = parseQuantityFromQuery(query);
      if (parsedQuantity !== null) {
        quantity = parsedQuantity;
        logger.info(`Parsed quantity ${quantity} from query: "${query}"`);
      }
    }

    // Try to resolve synonym on original query FIRST (before Claude loses context)
    const synonymFromQuery = matcherService.resolveSynonym(query);

    // Parse query using Claude
    const parsed = await parserService.parseQuery(query);

    // Also try to resolve synonym on parsed product type
    const synonymFromParsed = matcherService.resolveSynonym(parsed.productType);

    // Use whichever synonym resolved (prefer original query match)
    const synonymResolved = synonymFromQuery || synonymFromParsed;

    // Determine effective search term (synonym takes priority)
    const effectiveProductType = synonymResolved || parsed.productType;

    // Get product matches with recommendations
    const matches = matcherService.getProductMatches(
      effectiveProductType,
      parsed.color,
      quantity || parsed.quantity,
      urgent || parsed.urgent
    );

    // Determine if color is available in any product
    const colorAvailable = matches.some(
      (m) => m.colorMatch.onWebsite || m.colorMatch.fromLocal || m.colorMatch.fromChina
    );

    // Log recommendations summary
    const recommendationsSummary = matches.map((m) => ({
      product: m.product.name,
      recommendedSource: m.recommendation.source,
      supplier: m.recommendation.supplier,
      leadTime: m.recommendation.leadTime,
    }));
    logger.info('Availability check results', {
      query,
      parsed: { product: parsed.productType, color: parsed.color, quantity: quantity || parsed.quantity },
      synonymResolved,
      effectiveProductType,
      totalMatches: matches.length,
      recommendations: recommendationsSummary,
    });

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
        quantity || parsed.quantity,
        firstMatch.recommendation.warning
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
 * POST /api/product/availability-multi
 * Check availability for MULTIPLE products in a single query
 */
export async function checkMultiAvailability(
  req: Request<{}, {}, MultiAvailabilityRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { query, urgent = false } = req.body;

    logger.info('Multi-availability check request', { query, urgent });

    if (!query) {
      throw createError('Query is required', 400, 'INVALID_REQUEST', { field: 'query' });
    }

    // Parse query for multiple products
    const multiParsed = await parserService.parseMultiQuery(query);

    // Apply global urgency if set in request
    const effectiveUrgent = urgent || multiParsed.globalUrgent;

    const results: ProductAvailabilityResult[] = [];

    // Process each product item
    for (const item of multiParsed.items) {
      // Try to resolve synonym
      const synonymResolved = matcherService.resolveSynonym(item.productType);
      const effectiveProductType = synonymResolved || item.productType;

      // Get product matches
      const matches = matcherService.getProductMatches(
        effectiveProductType,
        item.color,
        item.quantity,
        item.urgent || effectiveUrgent
      );

      // Determine color availability
      const colorAvailable = matches.some(
        (m) => m.colorMatch.onWebsite || m.colorMatch.fromLocal || m.colorMatch.fromChina
      );

      // Generate individual summary
      let summary: string;
      if (matches.length === 0) {
        summary = `No products found matching "${item.productType}".`;
      } else if (item.color && !colorAvailable) {
        summary = `"${item.productType}" found, but ${item.color} color not available.`;
      } else {
        const firstMatch = matches[0];
        summary = generateAvailabilitySummary(
          firstMatch.product.name,
          item.color,
          firstMatch.recommendation.source,
          firstMatch.recommendation.supplier,
          firstMatch.recommendation.leadTime,
          item.quantity,
          firstMatch.recommendation.warning
        );
      }

      // Build original query segment for this item
      const qtyPart = item.quantity ? `${item.quantity} pcs ` : '';
      const colorPart = item.color ? `${item.color} ` : '';
      const originalQuery = `${qtyPart}${colorPart}${item.productType}`.trim();

      results.push({
        originalQuery,
        parsed: {
          product: item.productType,
          color: item.color,
          quantity: item.quantity,
          urgent: item.urgent || effectiveUrgent,
        },
        synonymResolved,
        availability: {
          found: matches.length > 0,
          colorAvailable,
          matchingProducts: matches,
        },
        summary,
      });
    }

    // Log results summary
    const resultsSummary = results.map((r) => ({
      product: r.parsed.product,
      synonymResolved: r.synonymResolved,
      found: r.availability.found,
      matchCount: r.availability.matchingProducts.length,
    }));
    logger.info('Multi-availability check results', {
      query,
      totalProducts: results.length,
      results: resultsSummary,
    });

    // Generate combined summary
    const combinedSummary = generateMultiAvailabilitySummary(
      results.map((r) => ({
        productName: r.availability.found
          ? r.availability.matchingProducts[0].product.name
          : r.parsed.product,
        color: r.parsed.color,
        found: r.availability.found,
        source: r.availability.found
          ? r.availability.matchingProducts[0].recommendation.source
          : undefined,
        supplier: r.availability.found
          ? r.availability.matchingProducts[0].recommendation.supplier
          : undefined,
        quantity: r.parsed.quantity,
        warning: r.availability.found
          ? r.availability.matchingProducts[0].recommendation.warning
          : undefined,
      }))
    );

    const response: MultiAvailabilityResponse = {
      query,
      totalProductsRequested: results.length,
      totalProductsFound: results.filter((r) => r.availability.found).length,
      results,
      combinedSummary,
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

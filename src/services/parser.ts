import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ParsedQuery, MultiParsedQuery, ParsedQueryItem } from '../types/api.js';

const PARSE_QUERY_PROMPT = `Parse this customer query about promotional products and extract the following information. Return ONLY valid JSON, no other text.

Required fields:
- productType: What product they're asking about (string)
- color: Specific color mentioned, or null if not specified
- quantity: Number of units mentioned, or null if not specified
- urgent: Whether they indicate urgency (boolean)

Examples:
- "Do you have white badge case?" -> {"productType":"badge case","color":"white","quantity":null,"urgent":false}
- "Need 200 pcs of card holders urgently" -> {"productType":"card holders","color":null,"quantity":200,"urgent":true}
- "Looking for red USB drives, about 500 pieces, no rush" -> {"productType":"USB drives","color":"red","quantity":500,"urgent":false}

Query: "{query}"

Return ONLY the JSON object:`;

const PARSE_MULTI_QUERY_PROMPT = `Parse this customer query about promotional products and extract ALL product requests mentioned. Return ONLY valid JSON array, no other text.

For EACH product mentioned, extract:
- productType: What product they're asking about (string)
- color: Specific color mentioned for this product, or null
- quantity: Number of units for this product, or null
- urgent: Whether this specific item is urgent (boolean)

Examples:
- "1,500 pcs t-shirts, 500 pcs hoodies" -> [{"productType":"t-shirts","color":null,"quantity":1500,"urgent":false},{"productType":"hoodies","color":null,"quantity":500,"urgent":false}]
- "Need 200 red USB drives and 100 blue pens urgently" -> [{"productType":"USB drives","color":"red","quantity":200,"urgent":true},{"productType":"pens","color":"blue","quantity":100,"urgent":true}]
- "Looking for white badge cases (500) and black lanyards (1000)" -> [{"productType":"badge cases","color":"white","quantity":500,"urgent":false},{"productType":"lanyards","color":"black","quantity":1000,"urgent":false}]
- "5000 pcs of card holders, 2000 keychains, and 1000 notebooks" -> [{"productType":"card holders","color":null,"quantity":5000,"urgent":false},{"productType":"keychains","color":null,"quantity":2000,"urgent":false},{"productType":"notebooks","color":null,"quantity":1000,"urgent":false}]

Query: "{query}"

Return ONLY the JSON array:`;

class ParserService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  /**
   * Parse a natural language query using Claude
   */
  async parseQuery(query: string): Promise<ParsedQuery> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: PARSE_QUERY_PROMPT.replace('{query}', query),
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const parsed = JSON.parse(content.text.trim()) as ParsedQuery;

      logger.debug('Parsed query', { query, parsed });

      return {
        productType: parsed.productType || query,
        color: parsed.color || null,
        quantity: parsed.quantity || null,
        urgent: parsed.urgent || false,
      };
    } catch (error) {
      logger.warn('Failed to parse query with Claude, using fallback', { error, query });
      return this.fallbackParse(query);
    }
  }

  /**
   * Fallback parsing using simple keyword extraction
   */
  private fallbackParse(query: string): ParsedQuery {
    const lowerQuery = query.toLowerCase();

    // Extract quantity
    const quantityMatch = lowerQuery.match(/(\d+)\s*(pcs?|pieces?|units?|qty)?/);
    const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : null;

    // Check for urgency
    const urgentKeywords = ['urgent', 'urgently', 'asap', 'rush', 'quickly', 'fast'];
    const urgent = urgentKeywords.some((kw) => lowerQuery.includes(kw));

    // Extract color (common colors)
    const colors = [
      'white',
      'black',
      'red',
      'blue',
      'green',
      'yellow',
      'orange',
      'purple',
      'pink',
      'brown',
      'grey',
      'gray',
      'silver',
      'gold',
      'tan',
      'navy',
      'maroon',
    ];
    const foundColor = colors.find((c) => lowerQuery.includes(c)) || null;

    // Remove color, quantity, and urgency keywords to get product type
    let productType = lowerQuery
      .replace(/\d+\s*(pcs?|pieces?|units?|qty)?/g, '')
      .replace(new RegExp(urgentKeywords.join('|'), 'gi'), '')
      .replace(new RegExp(colors.join('|'), 'gi'), '')
      .replace(/\b(do you have|need|looking for|want|can i get|any)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Clean up common punctuation
    productType = productType.replace(/[?!.,]+/g, '').trim();

    return {
      productType: productType || query,
      color: foundColor,
      quantity,
      urgent,
    };
  }

  /**
   * Parse a natural language query for MULTIPLE products using Claude
   */
  async parseMultiQuery(query: string): Promise<MultiParsedQuery> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: PARSE_MULTI_QUERY_PROMPT.replace('{query}', query),
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const parsed = JSON.parse(content.text.trim()) as ParsedQueryItem[];

      logger.debug('Parsed multi-query', { query, itemCount: parsed.length, parsed });

      // Check for global urgency keywords
      const urgentKeywords = ['urgent', 'urgently', 'asap', 'rush', 'quickly', 'fast'];
      const globalUrgent = urgentKeywords.some((kw) => query.toLowerCase().includes(kw));

      return {
        items: parsed.map((item) => ({
          productType: item.productType || '',
          color: item.color || null,
          quantity: item.quantity || null,
          urgent: item.urgent || globalUrgent,
        })),
        globalUrgent,
      };
    } catch (error) {
      logger.warn('Failed to parse multi-query with Claude, using fallback', { error, query });
      return this.fallbackParseMulti(query);
    }
  }

  /**
   * Fallback parsing for multiple products using regex patterns
   */
  private fallbackParseMulti(query: string): MultiParsedQuery {
    const items: ParsedQueryItem[] = [];
    const lowerQuery = query.toLowerCase();

    // Check for urgency
    const urgentKeywords = ['urgent', 'urgently', 'asap', 'rush', 'quickly', 'fast'];
    const globalUrgent = urgentKeywords.some((kw) => lowerQuery.includes(kw));

    // Colors to detect
    const colors = [
      'white', 'black', 'red', 'blue', 'green', 'yellow', 'orange',
      'purple', 'pink', 'brown', 'grey', 'gray', 'silver', 'gold', 'tan', 'navy', 'maroon',
    ];

    // Pattern: "1,500 pcs t-shirts" or "500 hoodies" or "t-shirts (500)"
    const pattern = /(\d{1,3}(?:,\d{3})*|\d+)\s*(?:pcs?|pieces?|units?)?\s*(?:of\s+)?([a-zA-Z][a-zA-Z\s-]*?)(?=[,;]|\s+and\s+|\s+\d|$|\))/gi;

    const matches = [...query.matchAll(pattern)];

    for (const match of matches) {
      const quantity = parseInt(match[1].replace(/,/g, ''), 10);
      let productType = match[2].trim();

      // Skip if product type is too short or just whitespace
      if (productType.length < 2) continue;

      // Extract color if present in product type
      let foundColor: string | null = null;
      for (const color of colors) {
        if (productType.toLowerCase().includes(color)) {
          foundColor = color;
          productType = productType.replace(new RegExp(`\\b${color}\\b`, 'gi'), '').trim();
          break;
        }
      }

      // Clean up product type
      productType = productType.replace(/\s+/g, ' ').trim();

      if (productType.length > 0) {
        items.push({
          productType,
          color: foundColor,
          quantity: quantity > 0 ? quantity : null,
          urgent: globalUrgent,
        });
      }
    }

    // If no items found, fall back to single parse
    if (items.length === 0) {
      const singleParsed = this.fallbackParse(query);
      items.push(singleParsed);
    }

    return { items, globalUrgent };
  }
}

export const parserService = new ParserService();

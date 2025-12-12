import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ParsedQuery } from '../types/api.js';

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
}

export const parserService = new ParserService();

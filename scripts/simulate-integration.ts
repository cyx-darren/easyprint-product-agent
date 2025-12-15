/**
 * Simulation: Ticket Manager Agent + Product Agent Integration
 *
 * This script demonstrates how the Ticket Manager Agent routes
 * customer enquiries to the Product Agent based on 4 intents:
 *
 * 1. KNOWLEDGE - Product info, specs, features
 * 2. PRICE - Pricing, quotes, bulk discounts
 * 3. ARTWORK - Artwork requirements, files, templates
 * 4. AVAILABILITY - Stock, colors, lead times, sourcing
 */

import Anthropic from '@anthropic-ai/sdk';

// Simulated Product Agent responses (what our API returns)
interface ProductAgentResponse {
  product: {
    name: string;
    category: string;
    url: string;
    websiteColors: string[];
    sourcing: {
      local: {
        supplier: string;
        moq: number;
        leadTime: string;
        colors: string[];
      };
      china: {
        available: boolean;
        moq: number;
        air: boolean;
        sea: boolean;
        colors: string;
      };
    };
  };
  colorMatch: {
    onWebsite: boolean;
    fromLocal: boolean;
    fromChina: boolean;
  };
  recommendation: {
    source: string;
    supplier?: string;
    moq?: number;
    leadTime?: string;
    reason: string;
  };
}

// Intent classification types
type Intent = 'KNOWLEDGE' | 'PRICE' | 'ARTWORK' | 'AVAILABILITY';

interface ClassifiedTicket {
  customerMessage: string;
  intent: Intent;
  confidence: number;
  extractedEntities: {
    product?: string;
    color?: string;
    quantity?: number;
    urgent?: boolean;
  };
}

// Sample enquiries for simulation
const SAMPLE_ENQUIRIES = [
  // KNOWLEDGE intents
  {
    message: "What's the difference between a badge holder and a lanyard card holder?",
    expectedIntent: 'KNOWLEDGE',
  },
  {
    message: "Do your drawstring bags come with a pocket inside?",
    expectedIntent: 'KNOWLEDGE',
  },

  // PRICE intents
  {
    message: "How much for 500 pieces of white badge holders?",
    expectedIntent: 'PRICE',
  },
  {
    message: "Can I get a quote for 1000 custom lanyards with our company logo?",
    expectedIntent: 'PRICE',
  },

  // ARTWORK intents
  {
    message: "What file format do you need for the logo on tote bags?",
    expectedIntent: 'ARTWORK',
  },
  {
    message: "Can you send me the artwork template for badge holders?",
    expectedIntent: 'ARTWORK',
  },

  // AVAILABILITY intents
  {
    message: "Do you have white badge holders in stock? Need 200 pieces urgently",
    expectedIntent: 'AVAILABILITY',
  },
  {
    message: "Looking for navy blue lanyards, about 500 pieces, no rush",
    expectedIntent: 'AVAILABILITY',
  },
];

// Simulated Google Sheet data
const MOCK_PRODUCT_DATA: Record<string, ProductAgentResponse> = {
  'badge holder': {
    product: {
      name: 'Badge Holder - Horizontal',
      category: 'Badge Accessories',
      url: 'https://easyprint.sg/badge-holder-horizontal',
      websiteColors: ['White', 'Black', 'Clear', 'Blue'],
      sourcing: {
        local: {
          supplier: 'ABC Supplies Pte Ltd',
          moq: 100,
          leadTime: '3-5 working days',
          colors: ['White', 'Black', 'Clear', 'Blue', 'Red'],
        },
        china: {
          available: true,
          moq: 1000,
          air: true,
          sea: true,
          colors: 'Any Pantone',
        },
      },
    },
    colorMatch: {
      onWebsite: true,
      fromLocal: true,
      fromChina: true,
    },
    recommendation: {
      source: 'local',
      supplier: 'ABC Supplies Pte Ltd',
      moq: 100,
      leadTime: '3-5 working days',
      reason: 'Urgent delivery requested - local supplier fastest',
    },
  },
  'lanyard': {
    product: {
      name: 'Polyester Lanyard 15mm',
      category: 'Lanyards',
      url: 'https://easyprint.sg/polyester-lanyard-15mm',
      websiteColors: ['Black', 'Navy Blue', 'Red', 'White', 'Green'],
      sourcing: {
        local: {
          supplier: 'XYZ Trading',
          moq: 100,
          leadTime: '5-7 working days',
          colors: ['Black', 'Navy Blue', 'Red', 'White'],
        },
        china: {
          available: true,
          moq: 500,
          air: true,
          sea: true,
          colors: 'Any Pantone',
        },
      },
    },
    colorMatch: {
      onWebsite: true,
      fromLocal: true,
      fromChina: true,
    },
    recommendation: {
      source: 'china',
      moq: 500,
      reason: 'Quantity 500 meets China MOQ (500), better pricing',
    },
  },
  'tote bag': {
    product: {
      name: 'Non-Woven Tote Bag A4',
      category: 'Bags',
      url: 'https://easyprint.sg/non-woven-tote-bag',
      websiteColors: ['Red', 'Blue', 'Green', 'Black', 'White'],
      sourcing: {
        local: {
          supplier: 'Bag World SG',
          moq: 200,
          leadTime: '7-10 working days',
          colors: ['Red', 'Blue', 'Black', 'White'],
        },
        china: {
          available: true,
          moq: 1000,
          air: true,
          sea: true,
          colors: 'Any Pantone',
        },
      },
    },
    colorMatch: {
      onWebsite: true,
      fromLocal: true,
      fromChina: true,
    },
    recommendation: {
      source: 'local',
      supplier: 'Bag World SG',
      moq: 200,
      leadTime: '7-10 working days',
      reason: 'Default to local supplier for standard orders',
    },
  },
  'drawstring bag': {
    product: {
      name: 'Polyester Drawstring Bag',
      category: 'Bags',
      url: 'https://easyprint.sg/drawstring-bag',
      websiteColors: ['Black', 'Navy', 'Red', 'Royal Blue'],
      sourcing: {
        local: {
          supplier: 'Bag World SG',
          moq: 100,
          leadTime: '5-7 working days',
          colors: ['Black', 'Navy', 'Red'],
        },
        china: {
          available: true,
          moq: 500,
          air: true,
          sea: true,
          colors: 'Any Pantone',
        },
      },
    },
    colorMatch: {
      onWebsite: true,
      fromLocal: true,
      fromChina: true,
    },
    recommendation: {
      source: 'local',
      supplier: 'Bag World SG',
      moq: 100,
      leadTime: '5-7 working days',
      reason: 'Default to local supplier for standard orders',
    },
  },
};

// ============================================================
// SIMULATION FUNCTIONS
// ============================================================

/**
 * Step 1: Ticket Manager classifies the intent
 */
function classifyIntent(message: string): ClassifiedTicket {
  const lowerMessage = message.toLowerCase();

  // Intent detection rules (in production, this would use Claude)
  let intent: Intent;
  let confidence: number;

  // AVAILABILITY signals
  const availabilitySignals = [
    'in stock', 'available', 'have', 'do you have', 'looking for',
    'need', 'urgently', 'urgent', 'asap', 'when can', 'lead time',
    'how fast', 'delivery', 'pieces', 'pcs', 'qty', 'quantity'
  ];

  // PRICE signals
  const priceSignals = [
    'price', 'cost', 'how much', 'quote', 'quotation', 'pricing',
    'discount', 'bulk', 'rate', 'charges', 'budget'
  ];

  // ARTWORK signals
  const artworkSignals = [
    'artwork', 'file', 'format', 'template', 'logo', 'design',
    'ai file', 'pdf', 'vector', 'resolution', 'dpi', 'mockup'
  ];

  // KNOWLEDGE signals
  const knowledgeSignals = [
    'what is', 'what\'s', 'difference', 'features', 'specs',
    'specifications', 'material', 'size', 'dimensions', 'come with',
    'included', 'how does', 'can it', 'does it'
  ];

  // Count signals for each intent
  const counts = {
    AVAILABILITY: availabilitySignals.filter(s => lowerMessage.includes(s)).length,
    PRICE: priceSignals.filter(s => lowerMessage.includes(s)).length,
    ARTWORK: artworkSignals.filter(s => lowerMessage.includes(s)).length,
    KNOWLEDGE: knowledgeSignals.filter(s => lowerMessage.includes(s)).length,
  };

  // Find the intent with highest count
  const maxCount = Math.max(...Object.values(counts));
  intent = (Object.entries(counts).find(([_, v]) => v === maxCount)?.[0] || 'KNOWLEDGE') as Intent;
  confidence = Math.min(0.95, 0.6 + (maxCount * 0.1));

  // Extract entities
  const extractedEntities: ClassifiedTicket['extractedEntities'] = {};

  // Extract product
  const productKeywords = ['badge holder', 'lanyard', 'tote bag', 'drawstring bag', 'card holder'];
  for (const product of productKeywords) {
    if (lowerMessage.includes(product)) {
      extractedEntities.product = product;
      break;
    }
  }

  // Extract color
  const colors = ['white', 'black', 'blue', 'navy', 'navy blue', 'red', 'green', 'clear'];
  for (const color of colors) {
    if (lowerMessage.includes(color)) {
      extractedEntities.color = color;
      break;
    }
  }

  // Extract quantity
  const qtyMatch = lowerMessage.match(/(\d+)\s*(pieces?|pcs?|qty|units?)?/);
  if (qtyMatch) {
    extractedEntities.quantity = parseInt(qtyMatch[1], 10);
  }

  // Extract urgency
  extractedEntities.urgent = ['urgent', 'urgently', 'asap', 'rush'].some(u => lowerMessage.includes(u));

  return {
    customerMessage: message,
    intent,
    confidence,
    extractedEntities,
  };
}

/**
 * Step 2: Route to appropriate handler based on intent
 */
async function routeTicket(ticket: ClassifiedTicket): Promise<string> {
  console.log('\n' + '═'.repeat(70));
  console.log(`📧 CUSTOMER ENQUIRY: "${ticket.customerMessage}"`);
  console.log('─'.repeat(70));
  console.log(`🏷️  Intent: ${ticket.intent} (${(ticket.confidence * 100).toFixed(0)}% confidence)`);
  console.log(`📦 Extracted: ${JSON.stringify(ticket.extractedEntities)}`);
  console.log('─'.repeat(70));

  switch (ticket.intent) {
    case 'KNOWLEDGE':
      return handleKnowledgeIntent(ticket);
    case 'PRICE':
      return handlePriceIntent(ticket);
    case 'ARTWORK':
      return handleArtworkIntent(ticket);
    case 'AVAILABILITY':
      return handleAvailabilityIntent(ticket);
  }
}

/**
 * KNOWLEDGE Intent Handler
 * - Uses Product Agent for product info
 * - May supplement with knowledge base
 */
function handleKnowledgeIntent(ticket: ClassifiedTicket): string {
  console.log('🔍 KNOWLEDGE HANDLER');
  console.log('   → Querying Product Agent for product specifications...');

  const product = ticket.extractedEntities.product;
  if (product && MOCK_PRODUCT_DATA[product]) {
    const data = MOCK_PRODUCT_DATA[product];
    console.log(`   ✓ Found product: ${data.product.name}`);
    console.log(`   → Category: ${data.product.category}`);
    console.log(`   → URL: ${data.product.url}`);
    console.log(`   → Available colors: ${data.product.websiteColors.join(', ')}`);

    return `
📋 DRAFT RESPONSE (KNOWLEDGE):
─────────────────────────────────────
Product: ${data.product.name}
Category: ${data.product.category}

Our ${data.product.name.toLowerCase()} comes in the following colors:
${data.product.websiteColors.join(', ')}

For more details, please visit: ${data.product.url}

[Note: Add specific feature info from knowledge base]
─────────────────────────────────────`;
  }

  return `
📋 DRAFT RESPONSE (KNOWLEDGE):
─────────────────────────────────────
Thank you for your enquiry!

[Product Agent: No specific product found]
[Escalate to: Human agent for detailed product consultation]
─────────────────────────────────────`;
}

/**
 * PRICE Intent Handler
 * - Uses Product Agent for product info and sourcing
 * - Applies pricing rules/calculator
 */
function handlePriceIntent(ticket: ClassifiedTicket): string {
  console.log('💰 PRICE HANDLER');
  console.log('   → Querying Product Agent for product and sourcing info...');

  const product = ticket.extractedEntities.product;
  const quantity = ticket.extractedEntities.quantity;
  const color = ticket.extractedEntities.color;

  if (product && MOCK_PRODUCT_DATA[product]) {
    const data = MOCK_PRODUCT_DATA[product];
    console.log(`   ✓ Found product: ${data.product.name}`);
    console.log(`   → Quantity requested: ${quantity || 'Not specified'}`);
    console.log(`   → Color: ${color || 'Not specified'}`);

    // Determine sourcing recommendation
    const isLargeOrder = quantity && quantity >= data.product.sourcing.china.moq;
    const source = isLargeOrder ? 'china' : 'local';
    const moq = isLargeOrder ? data.product.sourcing.china.moq : data.product.sourcing.local.moq;

    console.log(`   → Recommended source: ${source.toUpperCase()}`);
    console.log(`   → MOQ: ${moq} pcs`);

    return `
📋 DRAFT RESPONSE (PRICE):
─────────────────────────────────────
Product: ${data.product.name}
Quantity: ${quantity || '[Please specify quantity]'}
Color: ${color || '[Please specify color]'}

Based on your requirements:
• Sourcing: ${source === 'local' ? 'Local Supplier' : 'China Direct'}
• MOQ: ${moq} pieces
• Lead Time: ${source === 'local' ? data.product.sourcing.local.leadTime : '15-20 working days (air) / 30-45 days (sea)'}

[PRICING CALCULATOR OUTPUT]
• Unit price: $X.XX per piece
• Setup fee: $XX.XX (one-time)
• Total estimate: $XXX.XX

[Note: Exact pricing to be calculated by pricing engine]
─────────────────────────────────────`;
  }

  return `
📋 DRAFT RESPONSE (PRICE):
─────────────────────────────────────
Thank you for your enquiry!

Could you please specify:
1. What product are you interested in?
2. Quantity required?
3. Preferred color?

This will help us provide an accurate quotation.
─────────────────────────────────────`;
}

/**
 * ARTWORK Intent Handler
 * - Uses Product Agent for product type
 * - Returns artwork requirements from template database
 */
function handleArtworkIntent(ticket: ClassifiedTicket): string {
  console.log('🎨 ARTWORK HANDLER');
  console.log('   → Querying Product Agent for product type...');

  const product = ticket.extractedEntities.product;

  if (product && MOCK_PRODUCT_DATA[product]) {
    const data = MOCK_PRODUCT_DATA[product];
    console.log(`   ✓ Found product: ${data.product.name}`);
    console.log(`   → Fetching artwork requirements for category: ${data.product.category}`);

    // Artwork requirements by category (would come from another database)
    const artworkReqs: Record<string, { format: string; size: string; template: string }> = {
      'Badge Accessories': {
        format: 'AI, PDF, or PNG (300 DPI minimum)',
        size: '85mm x 54mm (standard credit card size)',
        template: 'https://easyprint.sg/templates/badge-holder-template.ai',
      },
      'Lanyards': {
        format: 'AI, PDF, or PNG (300 DPI minimum)',
        size: '900mm x 15mm (15mm width lanyard)',
        template: 'https://easyprint.sg/templates/lanyard-template.ai',
      },
      'Bags': {
        format: 'AI, PDF, or PNG (300 DPI minimum)',
        size: 'Varies by bag size - see template',
        template: 'https://easyprint.sg/templates/bag-template.ai',
      },
    };

    const req = artworkReqs[data.product.category] || artworkReqs['Badge Accessories'];

    return `
📋 DRAFT RESPONSE (ARTWORK):
─────────────────────────────────────
Product: ${data.product.name}
Category: ${data.product.category}

Artwork Requirements:
• Format: ${req.format}
• Print Area: ${req.size}
• Template: ${req.template}

Important Notes:
1. Please ensure all fonts are converted to outlines
2. Use CMYK color mode for accurate color reproduction
3. Include 3mm bleed on all sides

Download our artwork template here: ${req.template}
─────────────────────────────────────`;
  }

  return `
📋 DRAFT RESPONSE (ARTWORK):
─────────────────────────────────────
Thank you for your artwork enquiry!

General artwork requirements:
• Format: AI, PDF, or high-resolution PNG (300 DPI)
• Fonts: Convert all text to outlines
• Colors: CMYK color mode

Please let us know which product you're interested in,
and we'll send you the specific artwork template.
─────────────────────────────────────`;
}

/**
 * AVAILABILITY Intent Handler
 * - PRIMARY use of Product Agent
 * - Full product availability check with sourcing recommendations
 */
function handleAvailabilityIntent(ticket: ClassifiedTicket): string {
  console.log('📦 AVAILABILITY HANDLER');
  console.log('   → Calling Product Agent API: POST /api/product/availability');

  const { product, color, quantity, urgent } = ticket.extractedEntities;

  console.log(`   → Request: { query: "${product}", quantity: ${quantity}, urgent: ${urgent} }`);

  if (product && MOCK_PRODUCT_DATA[product]) {
    const data = MOCK_PRODUCT_DATA[product];
    console.log(`   ✓ Product Agent Response:`);
    console.log(`     - Product found: ${data.product.name}`);
    console.log(`     - Color on website: ${data.colorMatch.onWebsite}`);
    console.log(`     - Available from local: ${data.colorMatch.fromLocal}`);
    console.log(`     - Available from China: ${data.colorMatch.fromChina}`);
    console.log(`     - Recommended source: ${data.recommendation.source.toUpperCase()}`);
    console.log(`     - Reason: ${data.recommendation.reason}`);

    // Build availability response
    const colorStatus = color
      ? (data.product.websiteColors.map(c => c.toLowerCase()).includes(color.toLowerCase())
        ? `✅ ${color} is available`
        : `⚠️ ${color} may need to be sourced from ${data.recommendation.source}`)
      : 'Please specify your preferred color';

    const sourcingInfo = data.recommendation.source === 'local'
      ? `Local Supplier: ${data.product.sourcing.local.supplier}
Lead Time: ${data.product.sourcing.local.leadTime}
MOQ: ${data.product.sourcing.local.moq} pcs`
      : `China Direct (better pricing for large orders)
Lead Time: Air - 15-20 days / Sea - 30-45 days
MOQ: ${data.product.sourcing.china.moq} pcs`;

    return `
📋 DRAFT RESPONSE (AVAILABILITY):
─────────────────────────────────────
Product: ${data.product.name}
Status: ✅ AVAILABLE

Color Check: ${colorStatus}
Available Colors: ${data.product.websiteColors.join(', ')}

Sourcing Recommendation: ${data.recommendation.source.toUpperCase()}
Reason: ${data.recommendation.reason}

${sourcingInfo}

${urgent ? '⚡ URGENT: We can expedite local sourcing for faster delivery.' : ''}

Next Steps:
${quantity ? `1. Confirm order for ${quantity} pcs` : '1. Please confirm quantity needed'}
2. Send artwork file (if custom printing required)
3. We'll prepare a formal quotation

View product: ${data.product.url}
─────────────────────────────────────`;
  }

  return `
📋 DRAFT RESPONSE (AVAILABILITY):
─────────────────────────────────────
Thank you for your enquiry!

We couldn't find an exact match for your product.
Our team will check our inventory and get back to you shortly.

In the meantime, could you please provide:
1. Product name or description
2. Quantity needed
3. Preferred color
4. Delivery timeline

[Escalate to: Human agent for manual lookup]
─────────────────────────────────────`;
}

// ============================================================
// MAIN SIMULATION
// ============================================================

async function runSimulation() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       TICKET MANAGER + PRODUCT AGENT INTEGRATION SIMULATION          ║');
  console.log('║                                                                       ║');
  console.log('║  Demonstrating how enquiries flow through the 4 intents:             ║');
  console.log('║  📚 KNOWLEDGE  |  💰 PRICE  |  🎨 ARTWORK  |  📦 AVAILABILITY          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  for (const enquiry of SAMPLE_ENQUIRIES) {
    // Step 1: Classify the ticket
    const ticket = classifyIntent(enquiry.message);

    // Step 2: Route and handle
    const response = await routeTicket(ticket);

    // Step 3: Display the draft response
    console.log(response);

    // Check if classification matches expected
    const matchIcon = ticket.intent === enquiry.expectedIntent ? '✓' : '✗';
    console.log(`\n${matchIcon} Expected: ${enquiry.expectedIntent}, Got: ${ticket.intent}`);
    console.log('\n');
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                        INTEGRATION SUMMARY                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`
  📊 How the Product Agent is Used by Each Intent:

  ┌─────────────┬──────────────────────────────────────────────────────────┐
  │ Intent      │ Product Agent Usage                                      │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ KNOWLEDGE   │ • GET product specs, features, colors                    │
  │             │ • Returns product URL for reference                      │
  │             │ • Supplements with knowledge base data                   │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ PRICE       │ • GET product info + sourcing options                    │
  │             │ • Determines local vs China based on quantity            │
  │             │ • Feeds into pricing calculator                          │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ ARTWORK     │ • GET product type/category                              │
  │             │ • Maps to artwork templates database                     │
  │             │ • Returns format requirements                            │
  ├─────────────┼──────────────────────────────────────────────────────────┤
  │ AVAILABILITY│ • PRIMARY use case - full API call                       │
  │             │ • POST /api/product/availability                         │
  │             │ • Color matching, sourcing recommendations               │
  │             │ • Lead time estimates, MOQ checking                      │
  └─────────────┴──────────────────────────────────────────────────────────┘

  🔄 Typical Flow:

  Customer Email → Ticket Manager → Intent Classification
                                           │
                 ┌─────────────────────────┼─────────────────────────┐
                 │                         │                         │
                 ▼                         ▼                         ▼
            KNOWLEDGE               PRICE / ARTWORK            AVAILABILITY
                 │                         │                         │
                 └─────────────────────────┼─────────────────────────┘
                                           │
                                           ▼
                                    Product Agent
                                    (Google Sheets)
                                           │
                                           ▼
                                   Draft Response
                                           │
                                           ▼
                                Human Review (if needed)
                                           │
                                           ▼
                                   Send to Customer
  `);
}

// Run the simulation
runSimulation().catch(console.error);

# Product Agent - Project Requirements Document

## Document Info
| Field | Value |
|-------|-------|
| Version | 1.2 |
| Created | December 11, 2025 |
| Updated | December 16, 2025 |
| Status | Ready for Implementation |
| Project | product-agent |

---

## 1. Executive Summary

### 1.1 Purpose
The Product Agent is a specialist service within the AI Ticket Manager ecosystem that handles product availability queries, synonym resolution, and sourcing recommendations. It combines data from the Magento 2 website (public product catalog) with internal intelligence stored in Google Sheets.

### 1.2 Scope
This project includes:
1. **Magento 2 Scraper** - Extracts product catalog to populate Google Sheets
2. **Product Agent API** - Answers availability queries via HTTP endpoints
3. **Google Sheets Integration** - Read/write to Product Intelligence sheet

### 1.3 Out of Scope
- Pricing queries (handled by Price Agent)
- Knowledge base queries (handled by KB Agent)
- Artwork requests (handled by Artwork Agent)
- Discord bot (orchestrator handles Discord interface)

---

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCT AGENT PROJECT                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SCRAPER MODULE                        │   │
│  │                                                          │   │
│  │  • Crawl Magento 2 sitemap/categories                   │   │
│  │  • Extract product data (name, URL, colors, category)   │   │
│  │  • Write to Google Sheets (columns A-E)                 │   │
│  │  • Run on-demand or scheduled                           │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              GOOGLE SHEETS (Product Intelligence)        │   │
│  │                                                          │   │
│  │  Columns A-E: Populated by scraper                      │   │
│  │  Columns F-P: Populated manually by VA                  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AGENT API MODULE                      │   │
│  │                                                          │   │
│  │  POST /api/product/search                               │   │
│  │  POST /api/product/availability                         │   │
│  │  POST /api/product/availability-multi                   │   │
│  │  POST /api/product/resolve  (NEW - for Price Agent)     │   │
│  │  GET  /api/product/synonyms                             │   │
│  │  POST /api/scraper/run                                  │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │    TICKET MANAGER             │
              │    ORCHESTRATOR               │
              │    (External - calls this API)│
              └───────────────────────────────┘
```

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INITIAL SETUP (One-time):                                      │
│  ┌──────────────┐    scrape    ┌──────────────┐                │
│  │  Magento 2   │ ──────────▶  │ Google Sheet │                │
│  │  Website     │   ~400       │ (Cols A-E)   │                │
│  │              │   products   │              │                │
│  └──────────────┘              └──────────────┘                │
│                                       │                         │
│                                       ▼                         │
│                               VA enriches manually              │
│                               (Cols F-P: sourcing info)         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  RUNTIME (Per query):                                           │
│                                                                 │
│  Customer: "Do you have white badge case?"                      │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. SYNONYM LOOKUP                                        │   │
│  │    Sheet: Synonyms tab                                   │   │
│  │    "badge case" → "Card Holder"                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 2. PRODUCT SEARCH                                        │   │
│  │    Sheet: Product Intelligence tab                       │   │
│  │    Find all products matching "Card Holder"              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 3. AVAILABILITY CHECK                                    │   │
│  │    Check if "white" available in:                        │   │
│  │    - Column E (Website Colors)                           │   │
│  │    - Column I (Local Colors)                             │   │
│  │    - Column N (China Colors)                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 4. SOURCING RECOMMENDATION                               │   │
│  │    Based on quantity + urgency:                          │   │
│  │    → LOCAL (Ideahouse) or CHINA                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                     │                                           │
│                     ▼                                           │
│  Return structured response to orchestrator                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Magento 2 Scraper

### 3.1 Overview

The scraper extracts product information from EasyPrint's Magento 2 website and populates columns A-E of the Product Intelligence Google Sheet.

### 3.2 Target Website

| Field | Value |
|-------|-------|
| URL | `https://www.easyprint.sg` |
| Platform | Magento 2 |
| Products | ~300-400 |
| Growth | +5 products/week |

### 3.3 Data to Extract

| Field | Source | Sheet Column |
|-------|--------|--------------|
| Product Name | Product page `<h1>` or structured data | A |
| Category | Breadcrumb or category page | B |
| Website URL | Product page URL (path only) | C |
| Other Names | Leave empty (VA fills) | D |
| Colors on Website | Color swatches or options | E |

### 3.4 Scraping Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCRAPING STRATEGY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OPTION A: Sitemap-based (Preferred)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Fetch /sitemap.xml                                    │   │
│  │ 2. Extract all product URLs                              │   │
│  │ 3. Visit each product page                               │   │
│  │ 4. Extract structured data (JSON-LD) or HTML             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  OPTION B: Category crawl (Fallback)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Start at category pages                               │   │
│  │ 2. Paginate through product listings                     │   │
│  │ 3. Visit each product page                               │   │
│  │ 4. Extract data                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  OPTION C: Magento 2 REST API (If available)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ GET /rest/V1/products?searchCriteria[pageSize]=100       │   │
│  │ - Requires API credentials                               │   │
│  │ - Most reliable and fastest                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Product Page Data Extraction

```javascript
// Expected data structure from each product page
{
  name: "Deluxe Leather Card Holder",
  category: "Card Holders",
  url: "/products/deluxe-leather-card-holder",
  colors: ["Black", "Brown", "Tan"],
  
  // Optional (if available)
  sku: "CH-DLX-001",
  description: "Premium leather card holder...",
  images: ["https://..."],
  price_range: null  // Usually hidden on B2B sites
}
```

### 3.6 Extraction Selectors (HTML Fallback)

```javascript
// These may need adjustment based on actual site structure
const selectors = {
  // Product name
  name: [
    'h1.page-title span',
    '[data-ui-id="page-title-wrapper"]',
    '.product-info-main h1'
  ],
  
  // Category from breadcrumb
  category: [
    '.breadcrumbs li:nth-last-child(2) a',
    '.breadcrumb a:last-of-type'
  ],
  
  // Color options
  colors: [
    '.swatch-option.color',
    '.swatch-attribute.color .swatch-option',
    '[data-option-label]'  // Color name in data attribute
  ],
  
  // JSON-LD structured data (preferred)
  jsonLd: 'script[type="application/ld+json"]'
};
```

### 3.7 Rate Limiting & Politeness

| Setting | Value | Reason |
|---------|-------|--------|
| Request delay | 1-2 seconds | Avoid overloading server |
| Concurrent requests | 1 | Sequential crawling |
| User-Agent | Identify as EasyPrint bot | Transparency |
| Respect robots.txt | Yes | Good practice |
| Max retries | 3 | Handle transient failures |

### 3.8 Scraper Output

```javascript
// Output format for each product
{
  row: {
    A: "Deluxe Leather Card Holder",    // Product Name
    B: "Card Holders",                   // Category
    C: "/products/deluxe-leather-card-holder",  // URL
    D: "",                               // Other Names (empty - VA fills)
    E: "Black, Brown, Tan"              // Colors on Website
  },
  metadata: {
    scraped_at: "2025-12-11T10:30:00Z",
    source_url: "https://www.easyprint.sg/products/deluxe-leather-card-holder"
  }
}
```

### 3.9 Incremental Updates

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATE STRATEGY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INITIAL RUN:                                                   │
│  • Scrape all ~400 products                                     │
│  • Populate columns A-E                                         │
│  • Leave columns F-P empty for VA                               │
│                                                                 │
│  SUBSEQUENT RUNS:                                               │
│  • Compare existing sheet URLs with scraped URLs                │
│  • NEW products: Append to sheet                                │
│  • EXISTING products: Update columns A, B, E only               │
│  • REMOVED products: Flag in Notes column (don't delete)        │
│  • NEVER overwrite columns D, F-P (manual data)                 │
│                                                                 │
│  TRIGGER OPTIONS:                                               │
│  • Manual: POST /api/scraper/run                                │
│  • Scheduled: Weekly cron (Railway)                             │
│  • On-demand: After VA adds new products                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Google Sheets Integration

### 4.1 Sheet Structure

**Spreadsheet Name:** `Product Intelligence`

**Sheet 1: Products** (Main data)

| Column | Header | Width | Source | Editable By |
|--------|--------|-------|--------|-------------|
| A | Product Name | 250px | Scraper | Scraper only |
| B | Category | 150px | Scraper | Scraper only |
| C | Website URL | 300px | Scraper | Scraper only |
| D | Other Names | 200px | VA | VA only |
| E | Colors on Website | 200px | Scraper | Scraper only |
| F | Local Supplier | 120px | VA | VA only |
| G | Local MOQ | 80px | VA | VA only |
| H | Local Lead Time | 100px | VA | VA only |
| I | Local Colors | 200px | VA | VA only |
| J | China Available? | 100px | VA | VA only |
| K | China MOQ | 80px | VA | VA only |
| L | China Air | 80px | VA | VA only |
| M | China Sea | 80px | VA | VA only |
| N | China Colors | 200px | VA | VA only |
| O | Notes | 300px | Anyone | Anyone |
| P | Last Updated | 120px | Auto | Auto |

**Sheet 2: Synonyms**

| Column | Header | Example |
|--------|--------|---------|
| A | Customer Says | badge case |
| B | We Call It | Card Holder |
| C | Notes | Very common |

**Sheet 3: Suppliers** (Reference)

| Column | Header |
|--------|--------|
| A | Supplier Name |
| B | Location |
| C | Lead Time |
| D | Best For |
| E | Contact |

### 4.2 Google Sheets API Operations

```javascript
// Required operations

// READ: Get all products
sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'Products!A2:P'
});

// READ: Get synonyms
sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'Synonyms!A2:C'
});

// WRITE: Append new products (scraper)
sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: 'Products!A:E',
  valueInputOption: 'USER_ENTERED',
  resource: { values: newRows }
});

// WRITE: Update existing product (scraper)
sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: `Products!A${rowNum}:E${rowNum}`,
  valueInputOption: 'USER_ENTERED',
  resource: { values: [updatedRow] }
});
```

### 4.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CACHING STRATEGY                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Products cache:                                                │
│  • Load full sheet on startup                                   │
│  • Refresh every 5 minutes (configurable)                       │
│  • Force refresh via API endpoint                               │
│                                                                 │
│  Synonyms cache:                                                │
│  • Load on startup                                              │
│  • Refresh every 15 minutes                                     │
│  • Small dataset (~100 rows)                                    │
│                                                                 │
│  Cache invalidation:                                            │
│  • After scraper runs                                           │
│  • Manual trigger: POST /api/cache/refresh                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Product Agent API

### 5.1 API Endpoints

#### 5.1.1 Health Check

```
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2025-12-11T10:30:00Z",
  "cache": {
    "products": 387,
    "synonyms": 45,
    "last_refresh": "2025-12-11T10:25:00Z"
  }
}
```

#### 5.1.2 Product Search

```
POST /api/product/search

Request:
{
  "query": "badge case",
  "include_sourcing": true
}

Response:
{
  "success": true,
  "data": {
    "query": "badge case",
    "synonym_resolved": "Card Holder",
    "products": [
      {
        "name": "Deluxe Leather Card Holder",
        "category": "Card Holders",
        "url": "/products/deluxe-leather-card-holder",
        "website_colors": ["Black", "Brown", "Tan"],
        "sourcing": {
          "local": {
            "supplier": "Ideahouse",
            "moq": 50,
            "lead_time": "5-10 days",
            "colors": ["Black", "Brown", "White", "Tan"]
          },
          "china": {
            "available": true,
            "moq": 500,
            "air": true,
            "sea": true,
            "colors": "Any Pantone"
          }
        }
      },
      {
        "name": "Acrylic Card Holder",
        "category": "Card Holders",
        "url": "/products/acrylic-card-holder",
        // ...
      }
    ],
    "total_found": 5
  }
}
```

#### 5.1.3 Availability Check

```
POST /api/product/availability

Request:
{
  "query": "white badge case",
  "quantity": 200,
  "urgent": true
}

Response:
{
  "success": true,
  "data": {
    "query": "white badge case",
    "parsed": {
      "product": "badge case",
      "color": "white",
      "quantity": 200,
      "urgent": true
    },
    "synonym_resolved": "Card Holder",
    "availability": {
      "found": true,
      "color_available": true,
      "matching_products": [
        {
          "name": "Deluxe Leather Card Holder",
          "url": "/products/deluxe-leather-card-holder",
          "color_match": {
            "on_website": false,
            "from_local": true,
            "from_china": true
          },
          "recommendation": {
            "source": "local",
            "supplier": "Ideahouse",
            "moq": 50,
            "lead_time": "5-10 days",
            "reason": "Quantity 200 below China MOQ (500), urgent delivery requested"
          }
        }
      ]
    },
    "summary": "White card holders available from Ideahouse (local supplier). For 200 pieces with urgent delivery: 5-10 working days lead time."
  }
}
```

#### 5.1.4 Multi-Product Availability Check (NEW)

Handles queries containing multiple products in a single request. Each product is parsed and resolved independently.

```
POST /api/product/availability-multi

Request:
{
  "query": "1,500 pcs t-shirts, 500 pcs hoodies",
  "urgent": false
}

Response:
{
  "success": true,
  "data": {
    "query": "1,500 pcs t-shirts, 500 pcs hoodies",
    "totalProductsRequested": 2,
    "totalProductsFound": 2,
    "results": [
      {
        "originalQuery": "1500 pcs t-shirts",
        "parsed": {
          "product": "t-shirts",
          "color": null,
          "quantity": 1500,
          "urgent": false
        },
        "synonymResolved": "T-Shirt",
        "availability": {
          "found": true,
          "colorAvailable": true,
          "matchingProducts": [
            {
              "name": "100% Cotton T-Shirts",
              "recommendation": {
                "source": "local",
                "supplier": "Orensport",
                "leadTime": "5-10 days"
              }
            }
          ]
        },
        "summary": "100% Cotton T-Shirts available from Orensport (local supplier). For 1500 pieces: 5-10 days lead time."
      },
      {
        "originalQuery": "500 pcs hoodies",
        "parsed": {
          "product": "hoodies",
          "color": null,
          "quantity": 500,
          "urgent": false
        },
        "synonymResolved": "Hooded Sweatshirt",
        "availability": {
          "found": true,
          "colorAvailable": true,
          "matchingProducts": [
            {
              "name": "Hooded Sweatshirt",
              "recommendation": {
                "source": "local",
                "supplier": "Jespa",
                "leadTime": "5-10 days"
              }
            }
          ]
        },
        "summary": "Hooded Sweatshirt available from Jespa (local supplier). For 500 pieces: 5-10 days lead time."
      }
    ],
    "combinedSummary": "Available: 100% Cotton T-Shirts (1500 pcs) from Orensport, Hooded Sweatshirt (500 pcs) from Jespa."
  }
}
```

**Use Cases:**
- Customer requests multiple product types in one query
- Batch availability checks from Discord tickets
- Orders containing mixed product categories

**Key Features:**
- Parses multiple products using Claude AI
- Resolves synonyms independently for each product
- Generates individual summaries per product
- Provides combined summary for entire order

#### 5.1.5 Product Term Resolution (NEW)

Lightweight endpoint that resolves customer terminology to canonical product names. Used by Price Agent to get correct product names before querying pricing.

```
POST /api/product/resolve

Request:
{
  "terms": ["hoodie", "t-shirts", "badge case"]
}

Response:
{
  "success": true,
  "data": {
    "resolutions": [
      {
        "input": "hoodie",
        "canonicalName": "Hooded Sweatshirt",
        "confidence": "synonym",
        "alternates": [],
        "category": "Apparel Headwear"
      },
      {
        "input": "t-shirts",
        "canonicalName": "100% Cotton T-Shirts",
        "confidence": "fuzzy",
        "alternates": ["Custom Dri-Fit T-shirts"],
        "category": "Apparel Headwear"
      },
      {
        "input": "badge case",
        "canonicalName": "Card Holder",
        "confidence": "synonym",
        "alternates": ["Leather Mobile Card Holder", "Hotel Card Holder"],
        "category": "Electronics Gadgets"
      }
    ]
  }
}
```

**Confidence Levels:**

| Level | When Used |
|-------|-----------|
| `exact` | Input exactly matches a canonical product name |
| `synonym` | Input matched via synonym mapping in Google Sheet |
| `fuzzy` | Input matched via partial/substring search |
| `not_found` | No match found - `canonicalName` will be `null` |

**Use Cases:**
- Price Agent needs correct product names before querying Supabase
- Orchestrator pre-resolves terms before calling multiple agents
- Batch resolution of multiple customer terms in one request

**Key Features:**
- Lightweight - no availability/sourcing lookups
- Fast - target <200ms response time
- Batch support - accepts array of terms
- Returns alternates when multiple products match
- Returns category for each resolved term

#### 5.1.6 Synonyms List

```
GET /api/product/synonyms

Response:
{
  "success": true,
  "data": {
    "synonyms": [
      { "customer_says": "badge case", "we_call_it": "Card Holder" },
      { "customer_says": "badge holder", "we_call_it": "Card Holder" },
      { "customer_says": "ID holder", "we_call_it": "Card Holder" },
      { "customer_says": "thumb drive", "we_call_it": "USB Flash Drive" },
      // ...
    ],
    "total": 45
  }
}
```

#### 5.1.7 Run Scraper

```
POST /api/scraper/run

Request:
{
  "mode": "incremental",  // or "full"
  "dry_run": false
}

Response:
{
  "success": true,
  "data": {
    "mode": "incremental",
    "started_at": "2025-12-11T10:30:00Z",
    "completed_at": "2025-12-11T10:35:00Z",
    "stats": {
      "pages_crawled": 387,
      "new_products": 5,
      "updated_products": 12,
      "unchanged": 370,
      "errors": 0
    }
  }
}
```

#### 5.1.8 Refresh Cache

```
POST /api/cache/refresh

Response:
{
  "success": true,
  "data": {
    "products_loaded": 387,
    "synonyms_loaded": 45,
    "refresh_time_ms": 1250
  }
}
```

### 5.2 Authentication

```
All endpoints require API key in header:

Headers:
  X-API-Key: <PRODUCT_AGENT_API_KEY>

Or query parameter:
  ?api_key=<PRODUCT_AGENT_API_KEY>
```

### 5.3 Error Responses

```javascript
// Standard error format
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "No products found matching query",
    "details": {
      "query": "xyz widget",
      "synonym_checked": true
    }
  }
}

// Error codes
- INVALID_REQUEST: Missing or invalid parameters
- PRODUCT_NOT_FOUND: No matching products
- SHEETS_ERROR: Google Sheets API error
- SCRAPER_ERROR: Website scraping failed
- UNAUTHORIZED: Invalid or missing API key
- INTERNAL_ERROR: Unexpected server error
```

---

## 6. Query Processing Logic

### 6.1 Natural Language Understanding

The agent uses Claude to parse natural language queries:

```javascript
// Input parsing prompt
const parseQueryPrompt = `
Parse this customer query and extract:
- product_type: What product they're asking about
- color: Specific color mentioned (or null)
- quantity: Number of units (or null)
- urgent: Whether they indicate urgency (boolean)

Query: "${query}"

Respond in JSON format only.
`;

// Example
// Input: "Do you have white badge case? Need 200 pcs, quite urgent"
// Output: {
//   "product_type": "badge case",
//   "color": "white",
//   "quantity": 200,
//   "urgent": true
// }
```

### 6.2 Synonym Resolution

```javascript
function resolveSynonym(term, synonymsCache) {
  // Direct match
  const directMatch = synonymsCache.find(
    s => s.customer_says.toLowerCase() === term.toLowerCase()
  );
  if (directMatch) return directMatch.we_call_it;
  
  // Partial match (term contains synonym)
  const partialMatch = synonymsCache.find(
    s => term.toLowerCase().includes(s.customer_says.toLowerCase())
  );
  if (partialMatch) return partialMatch.we_call_it;
  
  // No match - return original
  return term;
}
```

### 6.3 Product Matching

```javascript
function findProducts(searchTerm, productsCache) {
  const normalizedSearch = searchTerm.toLowerCase();
  
  return productsCache.filter(product => {
    // Match by name
    if (product.name.toLowerCase().includes(normalizedSearch)) return true;
    
    // Match by category
    if (product.category.toLowerCase().includes(normalizedSearch)) return true;
    
    // Match by other names (synonyms in column D)
    if (product.other_names) {
      const otherNames = product.other_names.split(',').map(n => n.trim().toLowerCase());
      if (otherNames.some(n => n.includes(normalizedSearch))) return true;
    }
    
    return false;
  });
}
```

### 6.4 Sourcing Decision

```javascript
function recommendSourcing(product, quantity, urgent) {
  const { local, china } = product.sourcing;
  
  // No China option
  if (!china.available) {
    return {
      source: 'local',
      supplier: local.supplier,
      reason: 'China sourcing not available for this product'
    };
  }
  
  // Urgent - always local
  if (urgent) {
    return {
      source: 'local',
      supplier: local.supplier,
      reason: 'Urgent delivery requested - local supplier fastest'
    };
  }
  
  // Quantity below China MOQ
  if (quantity < china.moq) {
    return {
      source: 'local',
      supplier: local.supplier,
      reason: `Quantity ${quantity} below China MOQ (${china.moq})`
    };
  }
  
  // Quantity meets China MOQ, not urgent
  return {
    source: 'china',
    reason: `Quantity ${quantity} meets China MOQ (${china.moq}), better pricing`
  };
}
```

### 6.5 Color Availability Check

```javascript
function checkColorAvailability(product, requestedColor) {
  if (!requestedColor) return { available: true, source: 'any' };
  
  const colorLower = requestedColor.toLowerCase();
  
  // Check website colors
  const websiteColors = product.website_colors.map(c => c.toLowerCase());
  if (websiteColors.some(c => c.includes(colorLower))) {
    return { available: true, source: 'website' };
  }
  
  // Check local supplier colors
  const localColors = product.sourcing.local.colors.map(c => c.toLowerCase());
  if (localColors.some(c => c.includes(colorLower))) {
    return { available: true, source: 'local' };
  }
  
  // Check China colors
  if (product.sourcing.china.colors.toLowerCase().includes('pantone')) {
    return { available: true, source: 'china', note: 'Custom Pantone color' };
  }
  
  return { available: false };
}
```

---

## 7. Project Structure

```
product-agent/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # Express server setup
│   │
│   ├── api/
│   │   ├── routes.ts            # Route definitions
│   │   ├── middleware/
│   │   │   ├── auth.ts          # API key validation
│   │   │   └── error.ts         # Error handling
│   │   └── controllers/
│   │       ├── product.ts       # Product endpoints
│   │       ├── scraper.ts       # Scraper endpoints
│   │       └── cache.ts         # Cache endpoints
│   │
│   ├── services/
│   │   ├── sheets.ts            # Google Sheets client
│   │   ├── scraper.ts           # Magento scraper
│   │   ├── cache.ts             # In-memory cache
│   │   ├── parser.ts            # NL query parser (Claude)
│   │   └── matcher.ts           # Product matching logic
│   │
│   ├── utils/
│   │   ├── logger.ts            # Logging utility
│   │   └── helpers.ts           # Common helpers
│   │
│   └── types/
│       ├── product.ts           # Product types
│       ├── api.ts               # API request/response types
│       └── sheets.ts            # Sheet row types
│
├── scripts/
│   ├── initial-scrape.ts        # One-time full scrape
│   └── test-scraper.ts          # Scraper testing
│
├── .env.example
├── package.json
├── tsconfig.json
├── railway.json
└── README.md
```

---

## 8. Environment Variables

```env
# Server
PORT=3001
NODE_ENV=production
API_KEY=your-product-agent-api-key

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=product-agent@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
PRODUCT_INTELLIGENCE_SHEET_ID=1abc123...

# Magento Website
MAGENTO_BASE_URL=https://www.easyprint.sg
# Optional: If using Magento REST API
MAGENTO_ACCESS_TOKEN=xxx

# Claude (for query parsing)
ANTHROPIC_API_KEY=sk-ant-xxx

# Scraper Settings
SCRAPER_DELAY_MS=1500
SCRAPER_MAX_RETRIES=3
SCRAPER_USER_AGENT=EasyPrint-ProductAgent/1.0

# Cache Settings
CACHE_REFRESH_INTERVAL_MS=300000  # 5 minutes
```

---

## 9. Implementation Plan

### Phase 1: Foundation (Day 1)
- [ ] Initialize project with TypeScript
- [ ] Set up Express server with routes
- [ ] Implement API key authentication
- [ ] Set up Google Sheets client
- [ ] Create basic health endpoint

### Phase 2: Scraper (Day 2)
- [ ] Analyze easyprint.sg structure
- [ ] Implement sitemap/category crawler
- [ ] Build product page extractor
- [ ] Write to Google Sheets
- [ ] Test with subset of products
- [ ] Run full initial scrape

### Phase 3: Agent API (Day 3)
- [ ] Implement cache layer
- [ ] Build synonym resolution
- [ ] Build product matching
- [ ] Build sourcing recommendation
- [ ] Implement all API endpoints
- [ ] Add Claude query parsing

### Phase 4: Testing & Deploy (Day 4)
- [ ] Write integration tests
- [ ] Test with real queries
- [ ] Deploy to Railway
- [ ] Connect to Ticket Manager orchestrator
- [ ] Monitor and tune

---

## 10. Testing Queries

```javascript
// Test cases for validation

// Basic product search
POST /api/product/search
{ "query": "card holder" }
// Expect: List of card holder products

// Synonym resolution
POST /api/product/search
{ "query": "badge case" }
// Expect: Resolves to "Card Holder", returns card holders

// Color availability
POST /api/product/availability
{ "query": "white badge case", "quantity": 100 }
// Expect: Check white availability, recommend local

// China recommendation
POST /api/product/availability
{ "query": "card holder", "quantity": 1000, "urgent": false }
// Expect: Recommend China (qty > MOQ, not urgent)

// Urgent local
POST /api/product/availability
{ "query": "card holder", "quantity": 1000, "urgent": true }
// Expect: Recommend local despite high qty (urgent)

// Unknown product
POST /api/product/search
{ "query": "flying carpet" }
// Expect: No results, helpful message

// Multi-product availability (NEW)
POST /api/product/availability-multi
{ "query": "1,500 pcs t-shirts, 500 pcs hoodies" }
// Expect: Both products resolved, individual summaries, combined summary

// Multi-product with colors
POST /api/product/availability-multi
{ "query": "200 red USB drives and 100 blue pens" }
// Expect: Separate results for USB drives and pens with colors

// Multi-product partial match
POST /api/product/availability-multi
{ "query": "1000 t-shirts and 500 unicorn horns" }
// Expect: t-shirts found, unicorn horns not found, partial results

// Term resolution - synonym (NEW)
POST /api/product/resolve
{ "terms": ["hoodie"] }
// Expect: canonicalName = "Hooded Sweatshirt", confidence = "synonym"

// Term resolution - exact match (NEW)
POST /api/product/resolve
{ "terms": ["Hooded Sweatshirt"] }
// Expect: canonicalName = "Hooded Sweatshirt", confidence = "exact"

// Term resolution - batch (NEW)
POST /api/product/resolve
{ "terms": ["hoodie", "t-shirts", "badge case"] }
// Expect: All three resolved with appropriate confidence levels

// Term resolution - not found (NEW)
POST /api/product/resolve
{ "terms": ["flying carpet"] }
// Expect: canonicalName = null, confidence = "not_found"
```

---

## 11. Success Criteria

| Metric | Target |
|--------|--------|
| Scraper coverage | 100% of website products |
| API response time | <2 seconds |
| Synonym resolution accuracy | >95% |
| Sourcing recommendation accuracy | >90% |
| Uptime | 99.5% |

---

## 12. Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "googleapis": "^128.0.0",
    "@anthropic-ai/sdk": "^0.24.0",
    "cheerio": "^1.0.0-rc.12",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.6.0"
  }
}
```

---

## 13. Appendix

### A. Sample Sheet Data

**Products Sheet:**

| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Deluxe Leather Card Holder | Card Holders | /products/deluxe-leather-card-holder | badge case, badge holder, ID holder | Black, Brown, Tan | Ideahouse | 50 | 5-10 days | Black, Brown, White, Tan | YES | 500 | ✓ | ✓ | Any Pantone |
| Acrylic Card Holder | Card Holders | /products/acrylic-card-holder | | Clear, Black | In-house | 100 | 1-3 days | Clear, Black, White | NO | | | | |

**Synonyms Sheet:**

| A | B | C |
|---|---|---|
| badge case | Card Holder | Very common |
| badge holder | Card Holder | |
| ID holder | Card Holder | |
| thumb drive | USB Flash Drive | |
| pendrive | USB Flash Drive | MY term |
| totebag | Tote Bag | |
| eco bag | Non-Woven Tote Bag | |

### B. Magento 2 JSON-LD Example

```json
{
  "@context": "http://schema.org",
  "@type": "Product",
  "name": "Deluxe Leather Card Holder",
  "description": "Premium leather card holder...",
  "image": "https://www.easyprint.sg/media/catalog/product/...",
  "sku": "CH-DLX-001",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "SGD",
    "lowPrice": "2.50",
    "highPrice": "5.00"
  }
}
```

### C. Error Handling Matrix

| Scenario | Response Code | Action |
|----------|---------------|--------|
| Invalid API key | 401 | Return unauthorized error |
| Missing query | 400 | Return validation error |
| No products found | 200 | Return empty results with suggestion |
| Sheets API error | 503 | Retry with cached data, log error |
| Scraper blocked | 503 | Return error, alert admin |
| Claude API error | 200 | Fallback to keyword matching |

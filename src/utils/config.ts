import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // Server
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  apiKey: requireEnv('API_KEY'),

  // Google Sheets
  google: {
    serviceAccountEmail: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    privateKey: requireEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    sheetId: requireEnv('PRODUCT_INTELLIGENCE_SHEET_ID'),
  },

  // Firecrawl
  firecrawl: {
    apiKey: requireEnv('FIRECRAWL_API_KEY'),
  },

  // Magento
  magento: {
    baseUrl: optionalEnv('MAGENTO_BASE_URL', 'https://www.easyprintsg.com'),
  },

  // Anthropic
  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },

  // Cache
  cache: {
    refreshIntervalMs: parseInt(optionalEnv('CACHE_REFRESH_INTERVAL_MS', '300000'), 10),
  },
};

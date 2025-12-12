import { google } from 'googleapis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { ProductSheetRow, SynonymSheetRow, ScraperRowData } from '../types/sheets.js';
import { Product, Synonym } from '../types/product.js';
import { parseCommaSeparated, isTruthy, parseNumber } from '../utils/helpers.js';

const SHEET_RANGES = {
  products: 'Products!A2:P',
  synonyms: 'Synonyms!A2:C',
  productsWrite: 'Products!A:E',
};

class SheetsService {
  private sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.JWT({
      email: config.google.serviceAccountEmail,
      key: config.google.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = config.google.sheetId;
  }

  /**
   * Fetch all products from the Products sheet
   */
  async getProducts(): Promise<Product[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: SHEET_RANGES.products,
      });

      const rows = response.data.values || [];
      logger.info('Fetched products from sheet', { count: rows.length });

      return rows.map((row) => this.parseProductRow(row));
    } catch (error) {
      logger.error('Failed to fetch products from sheet', { error });
      throw error;
    }
  }

  /**
   * Fetch all synonyms from the Synonyms sheet
   */
  async getSynonyms(): Promise<Synonym[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: SHEET_RANGES.synonyms,
      });

      const rows = response.data.values || [];
      logger.info('Fetched synonyms from sheet', { count: rows.length });

      return rows.map((row) => this.parseSynonymRow(row));
    } catch (error) {
      logger.error('Failed to fetch synonyms from sheet', { error });
      throw error;
    }
  }

  /**
   * Append new products (scraper data - columns A-E only)
   */
  async appendProducts(products: ScraperRowData[]): Promise<number> {
    try {
      const values = products.map((p) => [
        p.productName,
        p.category,
        p.websiteUrl,
        p.otherNames,
        p.colorsOnWebsite,
      ]);

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: SHEET_RANGES.productsWrite,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      const updatedRows = response.data.updates?.updatedRows || 0;
      logger.info('Appended products to sheet', { count: updatedRows });
      return updatedRows;
    } catch (error) {
      logger.error('Failed to append products to sheet', { error });
      throw error;
    }
  }

  /**
   * Update an existing product row (columns A, B, E only - preserve manual data)
   */
  async updateProduct(rowNumber: number, data: Partial<ScraperRowData>): Promise<void> {
    try {
      // Update columns A (name), B (category), E (colors) only
      const updates: Array<{ range: string; values: string[][] }> = [];

      if (data.productName !== undefined) {
        updates.push({
          range: `Products!A${rowNumber}`,
          values: [[data.productName]],
        });
      }

      if (data.category !== undefined) {
        updates.push({
          range: `Products!B${rowNumber}`,
          values: [[data.category]],
        });
      }

      if (data.colorsOnWebsite !== undefined) {
        updates.push({
          range: `Products!E${rowNumber}`,
          values: [[data.colorsOnWebsite]],
        });
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      });

      logger.info('Updated product row', { rowNumber });
    } catch (error) {
      logger.error('Failed to update product row', { rowNumber, error });
      throw error;
    }
  }

  /**
   * Get all existing product URLs for incremental update comparison
   */
  async getExistingProductUrls(): Promise<Map<string, number>> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Products!C2:C',
      });

      const rows = response.data.values || [];
      const urlMap = new Map<string, number>();

      rows.forEach((row, index) => {
        if (row[0]) {
          urlMap.set(row[0], index + 2); // +2 because row 1 is header, array is 0-indexed
        }
      });

      logger.info('Fetched existing product URLs', { count: urlMap.size });
      return urlMap;
    } catch (error) {
      logger.error('Failed to fetch existing product URLs', { error });
      throw error;
    }
  }

  private parseProductRow(row: string[]): Product {
    return {
      name: row[0] || '',
      category: row[1] || '',
      url: row[2] || '',
      otherNames: row[3] || '',
      websiteColors: parseCommaSeparated(row[4] || ''),
      sourcing: {
        local: {
          supplier: row[5] || '',
          moq: parseNumber(row[6] || ''),
          leadTime: row[7] || '',
          colors: parseCommaSeparated(row[8] || ''),
        },
        china: {
          available: isTruthy(row[9] || ''),
          moq: parseNumber(row[10] || ''),
          air: isTruthy(row[11] || ''),
          sea: isTruthy(row[12] || ''),
          colors: row[13] || '',
        },
      },
      notes: row[14] || '',
      lastUpdated: row[15] || '',
    };
  }

  private parseSynonymRow(row: string[]): Synonym {
    return {
      customerSays: row[0] || '',
      weCallIt: row[1] || '',
      notes: row[2] || '',
    };
  }
}

export const sheetsService = new SheetsService();

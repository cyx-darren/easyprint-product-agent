// Raw row data from Google Sheets

export interface ProductSheetRow {
  // Column A - Product Name (Scraper)
  productName: string;
  // Column B - Category (Scraper)
  category: string;
  // Column C - Website URL (Scraper)
  websiteUrl: string;
  // Column D - Other Names (VA)
  otherNames: string;
  // Column E - Colors on Website (Scraper)
  colorsOnWebsite: string;
  // Column F - Local Supplier (VA)
  localSupplier: string;
  // Column G - Local MOQ (VA)
  localMoq: string;
  // Column H - Local Lead Time (VA)
  localLeadTime: string;
  // Column I - Local Colors (VA)
  localColors: string;
  // Column J - China Available? (VA)
  chinaAvailable: string;
  // Column K - China MOQ (VA)
  chinaMoq: string;
  // Column L - China Air (VA)
  chinaAir: string;
  // Column M - China Sea (VA)
  chinaSea: string;
  // Column N - China Colors (VA)
  chinaColors: string;
  // Column O - Notes (Anyone)
  notes: string;
  // Column P - Last Updated (Auto)
  lastUpdated: string;
}

export interface SynonymSheetRow {
  // Column A - Customer Says
  customerSays: string;
  // Column B - We Call It
  weCallIt: string;
  // Column C - Notes
  notes: string;
}

// For writing scraper data (columns A-E only)
export interface ScraperRowData {
  productName: string;
  category: string;
  websiteUrl: string;
  otherNames: string; // Always empty from scraper
  colorsOnWebsite: string;
}

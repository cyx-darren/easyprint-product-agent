/**
 * Parse a comma-separated string into an array of trimmed strings
 */
export function parseCommaSeparated(value: string): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Check if a string represents a truthy value
 */
export function isTruthy(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return ['yes', 'true', '1', 'y', '✓', '✔'].includes(lower);
}

/**
 * Parse a number from string, returning null if invalid
 */
export function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

/**
 * Normalize a string for comparison (lowercase, trim, remove extra spaces)
 */
export function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if searchTerm is contained in target (case-insensitive)
 */
export function containsIgnoreCase(target: string, searchTerm: string): boolean {
  return normalize(target).includes(normalize(searchTerm));
}

/**
 * Parse quantity from query text when not provided in request body
 * Handles formats like: "5000pcs", "5,000 pieces", "5k pcs", "qty: 5000"
 * Returns the largest quantity found (main order quantity)
 */
export function parseQuantityFromQuery(query: string): number | null {
  if (!query) return null;

  const text = query.toLowerCase();
  const quantities: number[] = [];

  // Pattern 1: Numbers followed by pcs/pieces/units (e.g., "5000pcs", "5,000 pieces")
  const matches1 = text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:pcs|pieces|units)/gi);
  for (const match of matches1) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (num > 0) quantities.push(num);
  }

  // Pattern 2: "5k pcs" format
  const matches2 = text.matchAll(/(\d+)k\s*(?:pcs|pieces|units)?/gi);
  for (const match of matches2) {
    const num = parseInt(match[1], 10) * 1000;
    if (num > 0) quantities.push(num);
  }

  // Pattern 3: "quantity: 5000" or "qty 5000"
  const matches3 = text.matchAll(/(?:quantity|qty)[:\s]+(\d{1,3}(?:,\d{3})+|\d+)/gi);
  for (const match of matches3) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (num > 0) quantities.push(num);
  }

  // Return largest quantity (main order quantity)
  return quantities.length > 0 ? Math.max(...quantities) : null;
}

/**
 * Generate a human-readable summary for availability response
 */
export function generateAvailabilitySummary(
  productName: string,
  color: string | null,
  source: 'local' | 'china',
  supplier: string | undefined,
  leadTime: string | undefined,
  quantity: number | null
): string {
  const colorPart = color ? `${color} ` : '';
  const qtyPart = quantity ? ` For ${quantity} pieces` : '';

  if (source === 'local') {
    const supplierPart = supplier ? ` from ${supplier} (local supplier)` : ' from local supplier';
    const timePart = leadTime ? `: ${leadTime} lead time` : '';
    return `${colorPart}${productName} available${supplierPart}.${qtyPart}${timePart}.`;
  } else {
    return `${colorPart}${productName} recommended from China.${qtyPart}: better pricing for larger quantities.`;
  }
}

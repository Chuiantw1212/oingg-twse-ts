/**
 * Safely parses a string value (in thousands) from an API into a BigInt.
 * Removes commas, multiplies by 1000, and handles null/empty values.
 * @param value The string value to parse, representing thousands.
 * @returns A BigInt or null if parsing fails.
 */
export const parseBigIntInThousands = (value: string): bigint | null => {
  if (!value || typeof value !== 'string') return null;
  try {
    // The values from the API are in thousands, so we multiply by 1000.
    return BigInt(value.replace(/,/g, '')) * 1000n;
  } catch {
    return null;
  }
};

/**
 * Safely parses a string value from an API into a number (for decimals).
 * @param value The string value to parse.
 * @returns A number or null if parsing fails.
 */
export const parseNumeric = (value: string): number | null => {
  if (!value || typeof value !== 'string') return null;
  const num = parseFloat(value.replace(/,/g, ''));
  return isNaN(num) ? null : num;
};

/**
 * Safely parses a ROC (Republic of China) date string (e.g., "112/09/30") into a JS Date object in UTC.
 * @param rocDate The ROC date string.
 * @returns A Date object or null if parsing fails.
 */
export const parseRocDate = (rocDate: string): Date | null => {
  if (!rocDate || typeof rocDate !== 'string' || rocDate.trim() === '') return null;

  let yearStr: string, monthStr: string, dayStr: string;

  // Check for format "112/09/30"
  if (rocDate.includes('/')) {
    const parts = rocDate.split('/');
    if (parts.length !== 3) return null;
    [yearStr, monthStr, dayStr] = parts;
  }
  // Check for format "1150818" (length 6 or 7)
  else if (rocDate.length === 6 || rocDate.length === 7) {
    yearStr = rocDate.slice(0, -4);
    monthStr = rocDate.slice(-4, -2);
    dayStr = rocDate.slice(-2);
  }
  // Unrecognized format
  else {
    return null;
  }

  try {
    const year = parseInt(yearStr, 10) + 1911;
    const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
    const day = parseInt(dayStr, 10);
    const date = new Date(Date.UTC(year, month, day));
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
};
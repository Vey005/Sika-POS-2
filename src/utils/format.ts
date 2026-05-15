/**
 * Formats a number as a currency string with comma separators.
 * Example: 1234.56 -> 1,234.56
 */
export const formatCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return '0.00';
  return new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Formats a number with commas but no currency symbol.
 * Example: 1000 -> 1,000
 */
export const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '0';
  return new Intl.NumberFormat('en-GH').format(num);
};

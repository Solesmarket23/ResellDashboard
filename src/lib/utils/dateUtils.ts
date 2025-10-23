/**
 * Parse a date string in YYYY-MM-DD format as a local date (not UTC)
 * This prevents timezone conversion issues where dates like "2025-09-24" 
 * get converted to "2025-09-23" in certain timezones
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // If it's already in YYYY-MM-DD format, parse it as local date
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // For other formats, use regular Date parsing
  return new Date(dateString);
}

/**
 * Format a date for display in the UI
 * Handles both Date objects and date strings
 */
export function formatDisplayDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  return dateObj.toLocaleDateString();
}

/**
 * Format a date for display with short month/day format
 */
export function formatShortDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

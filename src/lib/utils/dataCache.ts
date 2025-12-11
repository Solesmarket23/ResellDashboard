/**
 * Simple in-memory cache for Firebase data to reduce read operations
 * Implements a cache with TTL (Time To Live) to ensure data freshness
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Set data in cache with a TTL
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    console.log(`📦 Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Get data from cache if it exists and hasn't expired
   * @param key - Cache key
   * @returns Cached data or null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      console.log(`📦 Cache MISS: ${key} (not found)`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    const isExpired = age > entry.ttl;

    if (isExpired) {
      console.log(`📦 Cache MISS: ${key} (expired after ${Math.round(age / 1000)}s)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`📦 Cache HIT: ${key} (age: ${Math.round(age / 1000)}s)`);
    return entry.data as T;
  }

  /**
   * Check if cache has valid (non-expired) data for a key
   * @param key - Cache key
   * @returns true if valid data exists
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Invalidate (clear) a specific cache key
   * @param key - Cache key to invalidate
   */
  invalidate(key: string): void {
    if (this.cache.delete(key)) {
      console.log(`📦 Cache INVALIDATE: ${key}`);
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    console.log(`📦 Cache CLEAR: Removing ${this.cache.size} entries`);
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.entries());
    return {
      size: this.cache.size,
      entries: entries.map(([key, entry]) => ({
        key,
        age: Math.round((Date.now() - entry.timestamp) / 1000),
        ttl: Math.round(entry.ttl / 1000)
      }))
    };
  }
}

// Export singleton instance
export const dataCache = new DataCache();

// Export cache key generators for consistency
export const CacheKeys = {
  purchases: (userId: string) => `purchases_${userId}`,
  sales: (userId: string) => `sales_${userId}`,
  deliveries: (userId: string) => `deliveries_${userId}`,
  monitoredProducts: (userId: string) => `monitored_products_${userId}`
};

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  SHORT: 1 * 60 * 1000,      // 1 minute
  MEDIUM: 5 * 60 * 1000,     // 5 minutes (default)
  LONG: 15 * 60 * 1000,      // 15 minutes
  VERY_LONG: 60 * 60 * 1000  // 1 hour
};


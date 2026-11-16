import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl?: number;
}

/**
 * FastStorage: High-Performance Hybrid Storage Engine
 * Provides 0ms synchronous in-memory reads (like MMKV) backed by persistent AsyncStorage.
 * Features:
 * - 0ms Instant Synchronous reads for first-frame rendering (Zero Blank Screen)
 * - TTL (Time-To-Live) cache expiration
 * - In-flight Request Deduplication (prevents redundant API calls)
 * - Stale-While-Revalidate support
 * - Safe user-session clearing on logout (clears sensitive tokens, keeps static catalogs)
 */
class FastStorageService {
  private memoryCache = new Map<string, CacheEntry>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private initialized = false;

  constructor() {
    this.hydrateFromDisk();
  }

  /**
   * Pre-load critical cached keys from disk into memory on startup
   */
  public async hydrateFromDisk(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(
        k =>
          k.startsWith('@fast_cache_') ||
          k.startsWith('@cached_') ||
          k.startsWith('@prod_cache_')
      );

      if (appKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(appKeys);
        const now = Date.now();
        pairs.forEach(([k, v]) => {
          if (v) {
            try {
              const parsed = JSON.parse(v);
              if (parsed && typeof parsed === 'object' && 'timestamp' in parsed && 'value' in parsed) {
                // If it has TTL and is expired, skip
                if (parsed.ttl && now - parsed.timestamp > parsed.ttl) {
                  AsyncStorage.removeItem(k).catch(() => {});
                  return;
                }
                this.memoryCache.set(k, parsed);
              } else {
                // Raw stored object
                this.memoryCache.set(k, { value: parsed, timestamp: now });
              }
            } catch (_) {
              this.memoryCache.set(k, { value: v, timestamp: now });
            }
          }
        });
      }
      this.initialized = true;
    } catch (e) {
      this.initialized = true;
    }
  }

  /**
   * 0ms Synchronous Get (Returns instantly from Memory Cache)
   */
  public getItemSync<T = any>(key: string, fallback: T | null = null): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return fallback;

    // Check TTL expiration
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      AsyncStorage.removeItem(key).catch(() => {});
      return fallback;
    }

    return (entry.value as T) ?? fallback;
  }

  /**
   * Synchronous + Background Async Set
   */
  public setItemSync<T = any>(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      ttl: ttlMs,
    };
    this.memoryCache.set(key, entry);

    // Persist to disk asynchronously in background without blocking JS thread
    AsyncStorage.setItem(key, JSON.stringify(entry)).catch(() => {});
  }

  /**
   * Async Get with automatic fallback to disk
   */
  public async getItem<T = any>(key: string, fallback: T | null = null): Promise<T | null> {
    const mem = this.getItemSync<T>(key);
    if (mem !== null && mem !== undefined) {
      return mem;
    }

    try {
      const diskVal = await AsyncStorage.getItem(key);
      if (!diskVal) return fallback;

      const parsed = JSON.parse(diskVal);
      if (parsed && typeof parsed === 'object' && 'timestamp' in parsed && 'value' in parsed) {
        if (parsed.ttl && Date.now() - parsed.timestamp > parsed.ttl) {
          AsyncStorage.removeItem(key).catch(() => {});
          return fallback;
        }
        this.memoryCache.set(key, parsed);
        return parsed.value as T;
      }

      this.memoryCache.set(key, { value: parsed, timestamp: Date.now() });
      return parsed as T;
    } catch (_) {
      return fallback;
    }
  }

  /**
   * Async Set
   */
  public async setItem<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.setItemSync(key, value, ttlMs);
  }

  /**
   * Remove item from memory and disk
   */
  public removeItem(key: string): void {
    this.memoryCache.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  }

  /**
   * Check if a cache entry is older than maxAgeMs (useful for Stale-While-Revalidate)
   */
  public isStale(key: string, maxAgeMs: number = 60000): boolean {
    const entry = this.memoryCache.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > maxAgeMs;
  }

  /**
   * Request Deduplication:
   * If an identical request is already in-flight, reuse its Promise rather than firing another HTTP call.
   */
  public deduplicate<T>(dedupeKey: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inFlightRequests.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const promise = fetcher()
      .then(res => {
        this.inFlightRequests.delete(dedupeKey);
        return res;
      })
      .catch(err => {
        this.inFlightRequests.delete(dedupeKey);
        throw err;
      });

    this.inFlightRequests.set(dedupeKey, promise);
    return promise;
  }

  /**
   * Wipe ALL user-specific tokens, profiles, orders, locations, and dynamic API caches on logout or account switch
   */
  public async clearUserSession(): Promise<void> {
    const userSensitiveKeys = [
      'token',
      'user',
      'userData',
      'userRole',
      'authToken',
      'customerPhone',
      'user_phone',
      'supplier_active_orders',
      'recent_bookings',
      '@user_location_cache',
      '@cart_state',
      '@user_profile',
      'cached_supplier_lottie',
      'registeredCustomerId',
      'registeredCustomerName',
      'registeredSupplierPhoto',
    ];

    userSensitiveKeys.forEach(k => {
      this.memoryCache.delete(k);
      AsyncStorage.removeItem(k).catch(() => {});
    });

    // Clear all fast/prod dynamic user & restaurant caches so new session starts 100% clean
    for (const k of Array.from(this.memoryCache.keys())) {
      if (
        k.startsWith('@fast_cache_') ||
        k.startsWith('@cached_') ||
        k.startsWith('@prod_cache_')
      ) {
        this.memoryCache.delete(k);
        AsyncStorage.removeItem(k).catch(() => {});
      }
    }
  }

  /**
   * Invalidate specific namespace (e.g. 'categories', 'banners', 'store_menu')
   */
  public invalidatePrefix(prefix: string): void {
    for (const k of this.memoryCache.keys()) {
      if (k.includes(prefix)) {
        this.memoryCache.delete(k);
        AsyncStorage.removeItem(k).catch(() => {});
      }
    }
  }
}

export const FastStorage = new FastStorageService();
export default FastStorage;


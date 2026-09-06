/**
 * Options for configuring the MemoryCache.
 */
export interface CacheOptions<T> {
  /** Time to live in milliseconds */
  ttlMs?: number;
  /** Max items allowed in cache before eviction */
  maxSize?: number;
  /** Custom key serializer or normalizer */
  keySerializer?: (key: string) => string;
  /** Initial entries to populate */
  initialEntries?: Record<string, T>;
}

/**
 * Cache metrics and hit/miss statistics.
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRatio: number;
}

/**
 * Standard typed error for library operations.
 */
export class LibraryError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'ERR_LIBRARY_DEFAULT') {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface CacheItem<T> {
  value: T;
  expiresAt: number | null;
}

/**
 * An in-memory, TTL-capable, type-safe generic cache implementation.
 */
export class MemoryCache<T = unknown> {
  private readonly items = new Map<string, CacheItem<T>>();
  private readonly ttlMs: number | null;
  private readonly maxSize: number;
  private readonly keySerializer: (key: string) => string;

  private hitCount = 0;
  private missCount = 0;

  constructor(options: CacheOptions<T> = {}) {
    this.ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : null;
    this.maxSize = options.maxSize && options.maxSize > 0 ? options.maxSize : 1000;
    this.keySerializer = options.keySerializer ?? ((k: string) => k);

    if (options.initialEntries) {
      for (const [key, value] of Object.entries(options.initialEntries)) {
        this.set(key, value);
      }
    }
  }

  /**
   * Sets a value in the cache with optional custom TTL override.
   */
  public set(key: string, value: T, customTtlMs?: number): void {
    if (!key) {
      throw new LibraryError('Key must be a non-empty string', 'ERR_INVALID_KEY');
    }

    const resolvedKey = this.keySerializer(key);

    if (this.items.size >= this.maxSize && !this.items.has(resolvedKey)) {
      const oldestKey = this.items.keys().next().value;
      if (oldestKey !== undefined) {
        this.items.delete(oldestKey);
      }
    }

    const ttl = customTtlMs ?? this.ttlMs;
    const expiresAt = ttl ? Date.now() + ttl : null;

    this.items.set(resolvedKey, { value, expiresAt });
  }

  /**
   * Retrieves a value from the cache. Returns undefined if not found or expired.
   */
  public get(key: string): T | undefined {
    const resolvedKey = this.keySerializer(key);
    const item = this.items.get(resolvedKey);

    if (!item) {
      this.missCount++;
      return undefined;
    }

    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      this.items.delete(resolvedKey);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    return item.value;
  }

  /**
   * Returns true if key exists and has not expired.
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Deletes a key from the cache.
   */
  public delete(key: string): boolean {
    const resolvedKey = this.keySerializer(key);
    return this.items.delete(resolvedKey);
  }

  /**
   * Clears all items and resets statistics.
   */
  public clear(): void {
    this.items.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Returns current statistics.
   */
  public getStats(): CacheStats {
    const total = this.hitCount + this.missCount;
    return {
      size: this.items.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRatio: total > 0 ? this.hitCount / total : 0,
    };
  }
}

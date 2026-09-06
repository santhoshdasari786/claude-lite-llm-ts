import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryCache, LibraryError } from './index.js';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new MemoryCache<string>();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  it('returns undefined for missing keys', () => {
    const cache = new MemoryCache<number>();
    expect(cache.get('nonexistent')).toBeUndefined();
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('supports initial entries in options', () => {
    const cache = new MemoryCache<number>({
      initialEntries: { a: 1, b: 2 },
    });
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.getStats().size).toBe(2);
  });

  it('throws LibraryError when given empty key', () => {
    const cache = new MemoryCache<string>();
    expect(() => cache.set('', 'val')).toThrow(LibraryError);
    expect(() => cache.set('', 'val')).toThrow('Key must be a non-empty string');
  });

  it('deletes keys properly', () => {
    const cache = new MemoryCache<string>();
    cache.set('foo', 'bar');
    expect(cache.delete('foo')).toBe(true);
    expect(cache.get('foo')).toBeUndefined();
    expect(cache.delete('foo')).toBe(false);
  });

  it('clears all entries and resets stats', () => {
    const cache = new MemoryCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a');
    expect(cache.getStats().hits).toBe(1);

    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.getStats().hits).toBe(0);
    expect(cache.getStats().misses).toBe(0);
  });

  it('handles item expiration with TTL', () => {
    vi.useFakeTimers();
    const cache = new MemoryCache<string>({ ttlMs: 100 });
    cache.set('temp', 'data');
    expect(cache.get('temp')).toBe('data');

    vi.advanceTimersByTime(101);
    expect(cache.get('temp')).toBeUndefined();
    expect(cache.has('temp')).toBe(false);
  });

  it('evicts oldest entries when maxSize is reached', () => {
    const cache = new MemoryCache<number>({ maxSize: 2 });
    cache.set('one', 1);
    cache.set('two', 2);
    cache.set('three', 3);

    expect(cache.get('one')).toBeUndefined();
    expect(cache.get('two')).toBe(2);
    expect(cache.get('three')).toBe(3);
  });

  it('tracks hit and miss statistics correctly', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'val');
    cache.get('key'); // hit
    cache.get('key'); // hit
    cache.get('miss'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRatio).toBeCloseTo(2 / 3);
  });
});

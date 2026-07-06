/**
 * Tiny in-process TTL cache for Meta Graph reads that repeat per postId (OBS-2).
 *
 * Many comments land on the same post, and each FB webhook otherwise re-fetches
 * that post's promotion_status (up to twice) and caption from Graph — burning
 * against Meta's ~200 calls/user/hour limit. Memoizing by postId collapses a
 * burst of comments on one post to a single set of Graph calls.
 *
 * Scope is deliberately modest: this is per-serverless-instance and short-lived,
 * so it helps within a warm instance handling a burst without introducing a
 * shared store (no DB table — prod's migration history is drifted). A stale
 * "not an ad" / caption value for a few minutes only affects source labelling
 * and reply context, never moderation or idempotency, so a short TTL is safe.
 */

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

/**
 * Return a cached value for `key`, or compute it via `fetcher`, store it with
 * the given TTL, and return it. Concurrent callers within the TTL share the
 * result. `fetcher` rejections are not cached.
 */
export async function cachedGraph<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return hit.value as T;
  }

  const value = await fetcher();
  store.set(key, { value, expires: now + ttlMs });

  if (store.size > MAX_ENTRIES) {
    // Drop expired entries first, then trim oldest insertions to the cap.
    for (const [k, e] of store) {
      if (e.expires <= now) store.delete(k);
    }
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return value;
}

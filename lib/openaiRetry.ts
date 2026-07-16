const MAX_BACKOFF_MS = 8000;

/**
 * Retry wrapper for OpenAI calls. Retries on 429 (rate limit) and transient 5xx
 * with exponential backoff, honoring a Retry-After header when present (capped
 * at MAX_BACKOFF_MS). A single rate-limit spike should not fail a whole batch
 * of comments.
 */
export async function withOpenAIRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; label?: string }
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status: number | undefined = err?.status ?? err?.response?.status;
      const retriable =
        status === 429 ||
        (typeof status === 'number' && status >= 500 && status < 600) ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT';

      if (!retriable || i === attempts - 1) throw err;

      const retryAfterRaw = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after'];
      const retryAfter = Number(retryAfterRaw);
      // Clamp Retry-After the same as the exponential branch: a 429 with
      // Retry-After: 60 would otherwise sleep past the route's maxDuration and
      // get the whole batch killed mid-loop.
      const backoffMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
          : Math.min(1000 * 2 ** i, MAX_BACKOFF_MS);

      console.warn(
        `[OpenAI retry] ${opts?.label || 'call'} attempt ${i + 1}/${attempts} failed (${status ?? err?.code}); retrying in ${backoffMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastErr;
}

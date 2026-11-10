export interface RateLimiter {
  /** Records one attempt for the key and reports whether it is within the limit. */
  tryConsume(key: string): boolean;
}

/**
 * Fixed-window limiter held in function-instance memory. Vercel may run
 * several instances, so this caps bursts per instance rather than globally;
 * the Gemini key's own quota in Google Cloud is the hard ceiling.
 * Before horizontal scaling, use an atomic shared store (e.g. Redis/Upstash)
 * keyed by the verified user ID, with an expiry on each counter.
 */
export function createMemoryRateLimiter(limit: number, windowMs: number, now: () => number): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  let nextSweepAt = 0;

  return {
    tryConsume(key) {
      const current = now();
      if (current >= nextSweepAt) {
        for (const [storedKey, entry] of windows) {
          if (current - entry.startedAt >= windowMs) windows.delete(storedKey);
        }
        nextSweepAt = current + windowMs;
      }
      const window = windows.get(key);
      if (!window || current - window.startedAt >= windowMs) {
        windows.set(key, { startedAt: current, count: 1 });
        return true;
      }
      window.count += 1;
      return window.count <= limit;
    },
  };
}

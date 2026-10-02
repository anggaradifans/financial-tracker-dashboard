export interface RateLimiter {
  /** Records one attempt for the key and reports whether it is within the limit. */
  tryConsume(key: string): boolean;
}

/**
 * Fixed-window limiter held in function-instance memory. Vercel may run
 * several instances, so this caps bursts per instance rather than globally;
 * the Gemini key's own quota in Google Cloud is the hard ceiling.
 */
export function createMemoryRateLimiter(limit: number, windowMs: number, now: () => number): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return {
    tryConsume(key) {
      const current = now();
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

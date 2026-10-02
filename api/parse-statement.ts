import { createGeminiExtractor } from './_lib/geminiTransactions.js';
import { jsonLogger } from './_lib/logger.js';
import { createParseStatementHandler } from './_lib/parseStatementHandler.js';
import { createMemoryRateLimiter } from './_lib/rateLimiter.js';
import { createSupabaseUserVerifier } from './_lib/supabaseUser.js';

const RATE_LIMIT_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// The Supabase values are the same public ones the browser bundle uses;
// GEMINI_API_KEY has no VITE_ prefix so Vite never ships it to the client.
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GEMINI_API_KEY } = process.env;

const handler = VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY && GEMINI_API_KEY
  ? createParseStatementHandler({
    verifyUser: createSupabaseUserVerifier(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, fetch),
    extractTransactions: createGeminiExtractor({ apiKey: GEMINI_API_KEY, fetchImpl: fetch, logger: jsonLogger }),
    rateLimiter: createMemoryRateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS, Date.now),
    logger: jsonLogger,
    now: Date.now,
    newCorrelationId: () => crypto.randomUUID(),
  })
  : null;

export async function POST(request: Request): Promise<Response> {
  if (handler) return handler(request);

  // Fail closed: without configuration nothing is authenticated or forwarded.
  const correlationId = crypto.randomUUID();
  jsonLogger.error({ correlationId, operation: 'parse_statement' }, 'missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or GEMINI_API_KEY');
  return Response.json(
    { status: 'error', code: 500, error: { code: 'CONFIG_ERROR', message: 'AI parsing is not configured.', correlationId } },
    { status: 500 }
  );
}

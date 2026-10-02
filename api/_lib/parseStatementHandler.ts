import type { ExtractTransactions } from './geminiTransactions.js';
import type { Logger } from './logger.js';
import type { RateLimiter } from './rateLimiter.js';
import type { VerifyUser } from './supabaseUser.js';

export const MAX_STATEMENT_CHARS = 100_000;

export interface ParseStatementDeps {
  verifyUser: VerifyUser;
  extractTransactions: ExtractTransactions;
  rateLimiter: RateLimiter;
  logger: Logger;
  now: () => number;
  newCorrelationId: () => string;
}

const OPERATION = 'parse_statement';

function errorResponse(status: number, code: string, message: string, correlationId: string): Response {
  return Response.json(
    { status: 'error', code: status, error: { code, message, correlationId } },
    { status, headers: { 'x-correlation-id': correlationId } }
  );
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
  return match ? match[1] : null;
}

async function readRawText(request: Request): Promise<string | null> {
  try {
    const body = await request.json() as { rawText?: unknown };
    const rawText = body?.rawText;
    if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > MAX_STATEMENT_CHARS) return null;
    return rawText;
  } catch {
    return null; // Malformed JSON is a client validation failure, reported by the caller.
  }
}

function describeError(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return { message: String(error) };
  const { name, message, stack } = error as Error;
  return { ...error, name, message, stack };
}

export function createParseStatementHandler(deps: ParseStatementDeps) {
  const { verifyUser, extractTransactions, rateLimiter, logger, now, newCorrelationId } = deps;

  return async function handleParseStatement(request: Request): Promise<Response> {
    const correlationId = newCorrelationId();
    const startedAt = now();
    const base = { correlationId, operation: OPERATION };
    let userId: string | undefined;
    logger.info(base, 'request received');

    try {
      const token = bearerToken(request);
      const user = token ? await verifyUser(token) : null;
      if (!user) {
        logger.warn({ ...base, event_type: 'auth_failed', duration: now() - startedAt }, 'rejected unauthenticated request');
        return errorResponse(401, 'UNAUTHENTICATED', 'Please sign in to use AI parsing.', correlationId);
      }
      userId = user.id;
      const context = { ...base, userId };

      if (!rateLimiter.tryConsume(user.id)) {
        logger.warn({ ...context, event_type: 'rate_limited', duration: now() - startedAt }, 'rate limit exceeded');
        return errorResponse(429, 'RATE_LIMITED', 'Too many AI parsing requests. Please wait a few minutes and try again.', correlationId);
      }

      const rawText = await readRawText(request);
      if (rawText === null) {
        logger.warn({ ...context, event_type: 'validation_failed', duration: now() - startedAt }, 'invalid request body');
        return errorResponse(400, 'VALIDATION_ERROR', `rawText must be a non-empty string of at most ${MAX_STATEMENT_CHARS} characters.`, correlationId);
      }

      const { rows, droppedRows, model } = await extractTransactions(rawText, correlationId);
      logger.info({ ...context, model, rowsReturned: rows.length, droppedRows, duration: now() - startedAt }, 'statement parsed');
      return Response.json({ data: { transactions: rows } }, { headers: { 'x-correlation-id': correlationId } });
    } catch (error) {
      logger.error({ ...base, userId, error: describeError(error), duration: now() - startedAt }, 'statement parsing failed');
      return errorResponse(502, 'AI_PARSING_UNAVAILABLE', 'AI parsing is unavailable right now. Please try again later.', correlationId);
    }
  };
}

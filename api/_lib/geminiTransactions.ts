import type { Logger } from './logger.js';

export interface StatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'outcome';
}

export interface SanitizedRows {
  rows: StatementRow[];
  droppedRows: number;
}

export interface ExtractionResult extends SanitizedRows {
  model: string;
}

export type ExtractTransactions = (rawText: string, correlationId: string) => Promise<ExtractionResult>;

export class GeminiUpstreamError extends Error {
  constructor(readonly upstreamStatus: number, readonly upstreamBody: string) {
    super(`Gemini API failed with status ${upstreamStatus}`);
    this.name = 'GeminiUpstreamError';
  }
}

// In order of preference. Gemini overload is per model, so when one is busy
// the next usually answers where retrying the same model would not.
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash'];
const ATTEMPT_TIMEOUT_MS = 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transactions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          description: { type: 'STRING' },
          amount: { type: 'NUMBER', description: 'Positive number' },
          type: { type: 'STRING', enum: ['income', 'outcome'] },
        },
        required: ['date', 'description', 'amount', 'type'],
      },
    },
  },
  required: ['transactions'],
};

function buildPrompt(rawText: string): string {
  return `You are a financial document parser. Extract all transaction line items from the following bank statement text into a clean JSON array.
Text:
${rawText}
`;
}

function isStatementRow(value: unknown): value is StatementRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.date === 'string'
    && ISO_DATE.test(row.date)
    && !Number.isNaN(Date.parse(`${row.date}T12:00:00Z`))
    && typeof row.description === 'string'
    && typeof row.amount === 'number'
    && Number.isFinite(row.amount)
    && (row.type === 'income' || row.type === 'outcome');
}

/** Keeps only rows that match the schema; model output is untrusted input. */
export function sanitizeRows(candidateText: string | undefined): SanitizedRows {
  if (!candidateText) return { rows: [], droppedRows: 0 };

  const parsed = JSON.parse(candidateText) as { transactions?: unknown };
  const list = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  const rows = list.filter(isStatementRow).map((row) => ({
    date: row.date,
    description: row.description.slice(0, 500),
    amount: Math.abs(row.amount),
    type: row.type,
  }));
  return { rows, droppedRows: list.length - rows.length };
}

/**
 * Worth trying the next model: retired (404), rate-limited (429), overloaded
 * (5xx) or timed out. 400/401/403 mean a bad request or key, which no model fixes.
 */
function shouldFallBack(error: unknown): boolean {
  if (error instanceof GeminiUpstreamError) {
    return error.upstreamStatus === 404 || error.upstreamStatus === 429 || error.upstreamStatus >= 500;
  }
  return (error as Error)?.name === 'TimeoutError';
}

interface GeminiExtractorDeps {
  apiKey: string;
  fetchImpl: typeof fetch;
  logger: Logger;
  models?: string[];
}

export function createGeminiExtractor({ apiKey, fetchImpl, logger, models = GEMINI_MODELS }: GeminiExtractorDeps): ExtractTransactions {
  async function callModel(model: string, rawText: string): Promise<SanitizedRows> {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        // Header, not ?key=, so the key never lands in URL-based access logs.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(rawText) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        }),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      throw new GeminiUpstreamError(response.status, (await response.text()).slice(0, 2000));
    }

    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return sanitizeRows(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  return async (rawText, correlationId) => {
    for (const [index, model] of models.entries()) {
      try {
        return { ...await callModel(model, rawText), model };
      } catch (error) {
        const fallbackModel = models[index + 1];
        if (!fallbackModel || !shouldFallBack(error)) throw error;
        logger.warn({
          correlationId,
          operation: 'parse_statement',
          model,
          fallbackModel,
          upstreamStatus: (error as Partial<GeminiUpstreamError>).upstreamStatus,
          error: (error as Error).message,
        }, 'Gemini model unavailable, falling back');
      }
    }
    throw new Error('No Gemini models configured');
  };
}

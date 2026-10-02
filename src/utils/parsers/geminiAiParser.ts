import { ParsedCandidate } from '../../types/bankStatement';
import { inferCategory } from './categoryClassifier';

export interface GeminiParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'outcome';
}

// Must match MAX_STATEMENT_CHARS in api/_lib/parseStatementHandler.ts.
const MAX_STATEMENT_CHARS = 100_000;

/**
 * Sends statement text to the /api/parse-statement function, which holds the
 * Gemini key server-side. The access token identifies the signed-in user.
 */
export async function parseWithGemini(
  rawText: string,
  accessToken: string,
  options?: { accountId?: string }
): Promise<ParsedCandidate[]> {
  const response = await fetch('/api/parse-statement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ rawText: rawText.slice(0, MAX_STATEMENT_CHARS) }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `AI parsing failed (${response.status}).`;
    const correlationId = body?.error?.correlationId;
    throw new Error(correlationId ? `${message} (ref: ${correlationId})` : message);
  }

  const rawList: GeminiParsedRow[] = body?.data?.transactions || [];

  return rawList.map((row, idx) => {
    const occurredAt = new Date(`${row.date}T12:00:00Z`).toISOString();
    const inferred = inferCategory(row.description);
    return {
      tempId: `gemini-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      occurred_at: occurredAt,
      date_raw: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      suggestedCategoryName: inferred.categoryName,
      categoryId: inferred.categoryId,
      targetAccountId: options?.accountId || null,
      isDuplicate: false,
      selected: true,
    };
  });
}

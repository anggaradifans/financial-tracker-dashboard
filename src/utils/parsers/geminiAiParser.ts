import { ParsedCandidate } from '../../types/bankStatement';
import { inferCategory } from './categoryClassifier';

export interface GeminiParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'outcome';
}

export async function parseWithGemini(
  rawText: string,
  apiKey?: string,
  options?: { accountId?: string }
): Promise<ParsedCandidate[]> {
  const resolvedKey = apiKey || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY);
  if (!resolvedKey) {
    throw new Error('Gemini API key is required for AI parsing. Configure VITE_GEMINI_API_KEY.');
  }

  const prompt = `You are a financial document parser. Extract all transaction line items from the following bank statement text into a clean JSON array.
Text:
${rawText.slice(0, 100000)}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${resolvedKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
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
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    return [];
  }

  const parsed = JSON.parse(textOutput) as { transactions: GeminiParsedRow[] };
  const rawList = parsed.transactions || [];

  return rawList.map((row, idx) => {
    const occurredAt = new Date(`${row.date}T12:00:00Z`).toISOString();
    const inferred = inferCategory(row.description);
    return {
      tempId: `gemini-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      occurred_at: occurredAt,
      date_raw: row.date,
      description: row.description.slice(0, 500),
      amount: Math.abs(row.amount),
      type: row.type,
      suggestedCategoryName: inferred.categoryName,
      categoryId: inferred.categoryId,
      targetAccountId: options?.accountId || null,
      isDuplicate: false,
      selected: true,
    };
  });
}

import { TransactionType } from './financial';

export interface ParsedCandidate {
  tempId: string;
  occurred_at: string; // ISO 8601 UTC
  date_raw: string; // Raw date string from statement, e.g. "15 Sep 2026"
  description: string;
  amount: number;
  type: TransactionType;
  suggestedCategoryName: string;
  categoryId: string | null;
  targetAccountId: string | null;
  isDuplicate: boolean;
  duplicateReason?: string;
  selected: boolean;
  rawLine?: string;
}

export interface BankParserOptions {
  defaultYear?: number;
  accountId?: string;
}

export interface BankParser {
  name: string;
  canHandle(rawText: string): boolean;
  parse(rawText: string, options?: BankParserOptions): ParsedCandidate[];
}

export interface ParserResult {
  parserName: string;
  candidates: ParsedCandidate[];
  needsAiFallback?: boolean;
}

export interface CategoryRule {
  name: string;
  pattern: RegExp;
}

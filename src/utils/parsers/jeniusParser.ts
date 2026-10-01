import { BankParser, BankParserOptions, ParsedCandidate } from '../../types/bankStatement';
import { inferCategory } from './categoryClassifier';

const MONTHS: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9,
  nov: 10, november: 10,
  des: 11, desember: 11, dec: 11, december: 11,
};

function jakartaDateToUtc(year: number, monthIndex: number, day: number, hour = 12, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour - 7, minute, second));
}

function parseJakartaDate(raw: string, fallbackYear: number): Date | null {
  const text = raw.trim();
  const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const year = Number(yyyy.length === 2 ? `20${yyyy}` : yyyy);
    return jakartaDateToUtc(year, Number(mm) - 1, Number(dd));
  }

  const wordMatch = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{2,4}))?$/);
  if (wordMatch) {
    const [, dd, monthRaw, yyyy] = wordMatch;
    const month = MONTHS[monthRaw.toLowerCase()];
    if (month === undefined) return null;
    const year = yyyy ? Number(yyyy.length === 2 ? `20${yyyy}` : yyyy) : fallbackYear;
    return jakartaDateToUtc(year, month, Number(dd));
  }

  return null;
}

function normalizeAmount(raw: string): number {
  const cleaned = String(raw || '').replace(/[^\d,.-]/g, '');
  if (!cleaned) return NaN;
  const sign = cleaned.startsWith('-') ? -1 : 1;
  const unsigned = cleaned.replace(/^-/, '');

  const commaCount = (unsigned.match(/,/g) || []).length;
  const dotCount = (unsigned.match(/\./g) || []).length;
  const commaDecimal = commaCount === 1 && dotCount > 0 && /,\d{1,2}$/.test(unsigned);
  const plainDecimal = commaCount === 1 && dotCount === 0 && /,\d{1,2}$/.test(unsigned);

  if (commaDecimal || plainDecimal) {
    return sign * Number(unsigned.replace(/\./g, '').replace(',', '.'));
  }

  return sign * Number(unsigned.replace(/[.,]/g, ''));
}

function findStatementAmount(rest: string) {
  const amountPattern = /(?<![\w])(?<sign>-)?\s*(?<amount>\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?![\w])/g;
  const matches = [...rest.matchAll(amountPattern)];
  if (!matches.length) return null;

  const signed = matches.find((match) => match.groups?.sign === '-');
  if (signed) return signed;

  const moneyLike = matches.filter((match) => /[.,]/.test(match.groups?.amount || match[0]));
  if (moneyLike.length) return moneyLike[moneyLike.length >= 2 ? moneyLike.length - 2 : moneyLike.length - 1];

  return matches[matches.length >= 2 ? matches.length - 2 : matches.length - 1];
}

export const jeniusParser: BankParser = {
  name: 'Jenius',

  canHandle(rawText: string): boolean {
    if (/mandiri/i.test(rawText) && /saldo\s*\(idr\)/i.test(rawText)) {
      return false;
    }
    return (
      /jenius/i.test(rawText) ||
      /(?:m-Card|e-Card|x-Card|Flexi Saver|Maxi Saver)/i.test(rawText)
    );
  },

  parse(rawText: string, options?: BankParserOptions): ParsedCandidate[] {
    const fallbackYear = options?.defaultYear || new Date().getFullYear();
    const rows: ParsedCandidate[] = [];
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const datePattern = /^(?<date>(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(?:\d{1,2}\s+[A-Za-z]{3,}(?:\s+\d{2,4})?))\s+(?<rest>.+)$/;

    for (const line of lines) {
      if (/angga\s+radifan\s+sumarna/i.test(line)) continue;

      const dateMatch = line.match(datePattern);
      if (!dateMatch?.groups) continue;

      const dateRaw = dateMatch.groups.date;
      const occurred = parseJakartaDate(dateRaw, fallbackYear);
      if (!occurred) continue;

      const rest = dateMatch.groups.rest;
      const amountMatch = findStatementAmount(rest);
      if (!amountMatch) continue;

      const sign = amountMatch.groups?.sign === '-' ? '-' : '';
      const signedAmount = normalizeAmount(`${sign}${amountMatch.groups?.amount || amountMatch[0]}`);
      if (!Number.isFinite(signedAmount) || signedAmount === 0) continue;

      const description = rest
        .slice(0, amountMatch.index)
        .replace(/\s+[-–]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!description || /saldo|balance|total\s+mutasi|rekening|periode/i.test(description)) {
        continue;
      }

      const inferred = inferCategory(description);

      rows.push({
        tempId: `jenius-${Date.now()}-${rows.length}-${Math.random().toString(36).slice(2, 7)}`,
        occurred_at: occurred.toISOString(),
        date_raw: dateRaw,
        description: description.slice(0, 500),
        amount: Math.abs(signedAmount),
        type: signedAmount < 0 ? 'outcome' : 'income',
        suggestedCategoryName: inferred.categoryName,
        categoryId: inferred.categoryId,
        targetAccountId: options?.accountId || null,
        isDuplicate: false,
        selected: true,
      });
    }

    return rows;
  },
};

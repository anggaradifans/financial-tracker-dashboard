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

  const wordMatch = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})?$/);
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

  // Indoneisan format: 50.000,00 -> dot is thousand separator, comma is decimal
  if (unsigned.includes(',') && unsigned.includes('.')) {
    return sign * Number(unsigned.replace(/\./g, '').replace(',', '.'));
  }
  if (unsigned.includes(',')) {
    return sign * Number(unsigned.replace(',', '.'));
  }
  return sign * Number(unsigned);
}

function isMandiriBoilerplate(line: string): boolean {
  return /(?:PT Bank Mandiri|Otoritas Jasa Keuangan|Mandiri Call 14000|Lembaga Penjamin Simpanan|e-Statement|Menara Mandiri|Jalan Jenderal Sudirman|Nama\/Name\s*:|Periode\/Period\s*:|Cabang\/Branch\s*:|Dicetak pada\/Issued on\s*:|ini adalah batas akhir transaksi|Disclaimer from Bank Mandiri|Customer'?s role responsibility|Nasabah tunduk dan terikat|Customers are subject to and bound|Livin'? Term(?:s)? and Conditions|\b\d+\s+dari\s+\d+\b|\b\d+\s+of\s+\d+\b)/i.test(line);
}

export const mandiriParser: BankParser = {
  name: 'Mandiri',

  canHandle(rawText: string): boolean {
    return (
      /Nominal\s*\(IDR\)[\s\S]{0,120}Saldo\s*\(IDR\)/i.test(rawText) ||
      /Amount\s*\(IDR\)[\s\S]{0,120}Balance\s*\(IDR\)/i.test(rawText)
    );
  },

  parse(rawText: string, options?: BankParserOptions): ParsedCandidate[] {
    const fallbackYear = options?.defaultYear || new Date().getFullYear();
    const rows: ParsedCandidate[] = [];
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const datePattern = /^(?<date>\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})(?:\s+(?<detail>.+))?$/i;
    const amountPattern = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
    const timePattern = /\b(?<time>\d{2}:\d{2}:\d{2})\s+WIB\b/i;

    let currentBlock: {
      dateRaw: string;
      dateUtc: Date;
      timeRaw?: string;
      detailLines: string[];
      amount?: number;
      balance?: number;
    } | null = null;

    const flushBlock = () => {
      if (!currentBlock || currentBlock.amount === undefined) return;

      const fullNarration = currentBlock.detailLines
        .filter((line) => !isMandiriBoilerplate(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const signedAmount = currentBlock.amount;
      const amount = Math.abs(signedAmount);
      const type = signedAmount < 0 ? 'outcome' : 'income';
      const inferred = inferCategory(fullNarration);

      let finalDate = currentBlock.dateUtc;
      if (currentBlock.timeRaw) {
        const timeMatch = currentBlock.timeRaw.match(/^(\d{2}):(\d{2}):(\d{2})$/);
        if (timeMatch) {
          const [, hh, mm, ss] = timeMatch;
          finalDate = new Date(Date.UTC(
            currentBlock.dateUtc.getUTCFullYear(),
            currentBlock.dateUtc.getUTCMonth(),
            currentBlock.dateUtc.getUTCDate(),
            Number(hh) - 7,
            Number(mm),
            Number(ss)
          ));
        }
      }

      rows.push({
        tempId: `mandiri-${Date.now()}-${rows.length}-${Math.random().toString(36).slice(2, 7)}`,
        occurred_at: finalDate.toISOString(),
        date_raw: currentBlock.dateRaw,
        description: fullNarration.slice(0, 500),
        amount,
        type,
        suggestedCategoryName: inferred.categoryName,
        categoryId: inferred.categoryId,
        targetAccountId: options?.accountId || null,
        isDuplicate: false,
        selected: true,
      });

      currentBlock = null;
    };

    for (const line of lines) {
      if (isMandiriBoilerplate(line)) continue;

      const dateMatch = line.match(datePattern);
      if (dateMatch?.groups?.date) {
        flushBlock();
        const dateRaw = dateMatch.groups.date;
        const dateUtc = parseJakartaDate(dateRaw, fallbackYear);
        if (!dateUtc) continue;

        const detail = dateMatch.groups.detail || '';
        const amounts = [...detail.matchAll(amountPattern)];

        let parsedAmount: number | undefined;
        let detailWithoutAmounts = detail;

        if (amounts.length >= 1) {
          parsedAmount = normalizeAmount(amounts[0][0]);
          detailWithoutAmounts = detail.replace(amountPattern, '').trim();
        }

        currentBlock = {
          dateRaw,
          dateUtc,
          detailLines: [detailWithoutAmounts].filter(Boolean),
          amount: parsedAmount,
        };
      } else if (currentBlock) {
        const timeMatch = line.match(timePattern);
        if (timeMatch?.groups?.time) {
          currentBlock.timeRaw = timeMatch.groups.time;
        }

        const amounts = [...line.matchAll(amountPattern)];
        if (currentBlock.amount === undefined && amounts.length >= 1) {
          currentBlock.amount = normalizeAmount(amounts[0][0]);
          const lineWithoutAmounts = line.replace(amountPattern, '').replace(timePattern, '').trim();
          if (lineWithoutAmounts) currentBlock.detailLines.push(lineWithoutAmounts);
        } else {
          const cleanedLine = line.replace(timePattern, '').trim();
          if (cleanedLine) currentBlock.detailLines.push(cleanedLine);
        }
      }
    }

    flushBlock();
    return rows;
  },
};

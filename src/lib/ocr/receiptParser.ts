/**
 * Receipt Parser — Pure Business Logic
 *
 * Extracts structured receipt data from raw OCR text.
 * No I/O, no side effects — purely regex + heuristics.
 */

export interface ParsedReceiptItem {
  name: string
  price: number
}

export interface ParsedReceipt {
  /** Extracted total amount, or null if not found */
  amount: number | null
  /** Detected currency code, or null */
  currency: string | null
  /** Date in YYYY-MM-DD format, or null */
  date: string | null
  /** Merchant/bank name from top of receipt — maps to Account */
  merchantName: string | null
  /** Company/product name from labeled field — maps to Description */
  companyName: string | null
  /** Individual line items */
  items: ParsedReceiptItem[]
  /** Original raw OCR text */
  rawText: string
}

/**
 * Parse raw OCR text from a receipt into structured data.
 * Uses heuristics optimized for Indonesian receipts (IDR, Rp format).
 */
export function parseReceipt(text: string): ParsedReceipt {
  return {
    amount: extractTotalAmount(text),
    currency: extractCurrency(text),
    date: extractDate(text),
    merchantName: extractMerchantName(text),
    companyName: extractCompanyName(text),
    items: extractLineItems(text),
    rawText: text,
  }
}

// --- Amount Extraction ---

/**
 * Extract the total amount from receipt text.
 * Looks for "TOTAL", "GRAND TOTAL", "JUMLAH" keywords and nearby numbers.
 * Falls back to the largest number found on the receipt.
 */
export function extractTotalAmount(text: string): number | null {
  const lines = text.split('\n')

  // Strategy 1: Look for TOTAL/JUMLAH/Bill Total/Total Payment keywords and grab the number on the same line
  const totalKeywords = /\b(grand\s*total|total\s*payment|bill\s*total|total|jumlah|subtotal|sub\s*total|amount\s*due)\b/i
  for (const line of lines) {
    if (totalKeywords.test(line)) {
      const amount = extractAmountFromLine(line)
      if (amount !== null && amount > 0) {
        return amount
      }
    }
  }

  // Strategy 2: Fall back to the largest number on the receipt
  const allAmounts: number[] = []
  for (const line of lines) {
    const amount = extractAmountFromLine(line)
    if (amount !== null && amount > 0) {
      allAmounts.push(amount)
    }
  }

  if (allAmounts.length > 0) {
    return Math.max(...allAmounts)
  }

  return null
}

/**
 * Extract a numeric amount from a single line of text.
 * Handles Indonesian formats: Rp 50.000, Rp. 50,000, IDR 50000, etc.
 */
export function extractAmountFromLine(line: string): number | null {
  // Pattern: Rp/Rp./IDR followed by number with possible dots/commas as thousands separators
  const idrPattern = /(?:Rp\.?\s*|IDR\s*)([\d.,]+)/i
  const idrMatch = line.match(idrPattern)
  if (idrMatch) {
    return parseIndonesianNumber(idrMatch[1])
  }

  // Pattern: USD/$/EUR followed by number
  const foreignPattern = /(?:\$|USD|EUR|€)\s*([\d.,]+)/i
  const foreignMatch = line.match(foreignPattern)
  if (foreignMatch) {
    return parseStandardNumber(foreignMatch[1])
  }

  // Pattern: bare number (at least 3 digits to avoid matching item counts)
  const bareNumberPattern = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*$/
  const bareMatch = line.match(bareNumberPattern)
  if (bareMatch) {
    return parseIndonesianNumber(bareMatch[1])
  }

  return null
}

/**
 * Parse a number string with various separator formats.
 * Handles:
 * - Indonesian: "50.000" -> 50000, "1.250.000" -> 1250000
 * - Standard:   "199,800.00" -> 199800 (comma=thousands, dot=decimal)
 * - European:   "199.800,00" -> 199800 (dot=thousands, comma=decimal)
 * - Plain:      "50000" -> 50000
 */
export function parseIndonesianNumber(numStr: string): number | null {
  const cleaned = numStr.trim()
  if (!cleaned) return null

  const hasDot = cleaned.includes('.')
  const hasComma = cleaned.includes(',')

  // Both dot AND comma present — determine which is the decimal separator
  // by checking which appears LAST in the string
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')

    if (lastDot > lastComma) {
      // Dot appears after comma → standard format: "199,800.00"
      // Comma is thousands, dot is decimal
      const value = parseFloat(cleaned.replace(/,/g, ''))
      return isNaN(value) ? null : value
    } else {
      // Comma appears after dot → European/Indonesian: "199.800,00"
      // Dot is thousands, comma is decimal
      const value = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
      return isNaN(value) ? null : value
    }
  }

  // Only dots — could be thousands separator (IDR) or decimal
  if (hasDot && !hasComma) {
    const parts = cleaned.split('.')
    // All parts after the first should be 3 digits if they're thousands separators
    const isThousandsSep = parts.slice(1).every(p => p.length === 3)
    if (isThousandsSep) {
      const value = parseFloat(parts.join(''))
      return isNaN(value) ? null : value
    }
    // Otherwise treat dot as decimal
    const value = parseFloat(cleaned)
    return isNaN(value) ? null : value
  }

  // Only commas — could be thousands separator or decimal
  if (hasComma) {
    const parts = cleaned.split(',')
    const lastPart = parts[parts.length - 1]
    // If last part is 3 digits, comma is a thousands separator
    if (lastPart.length === 3) {
      const value = parseFloat(cleaned.replace(/,/g, ''))
      return isNaN(value) ? null : value
    }
    // Otherwise comma is a decimal separator
    const value = parseFloat(cleaned.replace(',', '.'))
    return isNaN(value) ? null : value
  }

  const value = parseFloat(cleaned)
  return isNaN(value) ? null : value
}

/**
 * Parse standard number format (dot as decimal, comma as thousands).
 * Examples: "1,250.50" -> 1250.5
 */
function parseStandardNumber(numStr: string): number | null {
  const cleaned = numStr.replace(/,/g, '')
  const value = parseFloat(cleaned)
  return isNaN(value) ? null : value
}

// --- Currency Detection ---

export function extractCurrency(text: string): string | null {
  if (/\b(Rp\.?|IDR)\b/i.test(text)) return 'IDR'
  if (/(\$|USD)\b/i.test(text)) return 'USD'
  if (/(€|EUR)\b/i.test(text)) return 'EUR'
  return null
}

// --- Date Extraction ---

/**
 * Extract a date from receipt text.
 * Supports formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY, etc.
 */
export function extractDate(text: string): string | null {
  const lines = text.split('\n')

  for (const line of lines) {
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = line.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1])
      const month = parseInt(dmyMatch[2])
      const year = parseInt(dmyMatch[3])
      if (isValidDate(year, month, day)) {
        return formatDate(year, month, day)
      }
    }

    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = line.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1])
      const month = parseInt(ymdMatch[2])
      const day = parseInt(ymdMatch[3])
      if (isValidDate(year, month, day)) {
        return formatDate(year, month, day)
      }
    }

    // DD MMM YYYY (e.g., "04 Mar 2026", "4 Maret 2026")
    const monthNames: Record<string, number> = {
      jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2,
      mar: 3, maret: 3, march: 3, apr: 4, april: 4,
      may: 5, mei: 5, jun: 6, juni: 6, june: 6,
      jul: 7, juli: 7, july: 7, aug: 8, agustus: 8, august: 8,
      sep: 9, september: 9, oct: 10, oktober: 10, october: 10,
      nov: 11, november: 11, dec: 12, desember: 12, december: 12,
    }
    const namedMonthMatch = line.match(/(\d{1,2})\s+([\w]+)\s+(\d{4})/i)
    if (namedMonthMatch) {
      const day = parseInt(namedMonthMatch[1])
      const monthName = namedMonthMatch[2].toLowerCase()
      const year = parseInt(namedMonthMatch[3])
      const month = monthNames[monthName]
      if (month && isValidDate(year, month, day)) {
        return formatDate(year, month, day)
      }
    }
  }

  return null
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  return true
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// --- Merchant Name Extraction ---

/**
 * Extract merchant/store name from receipt text.
 * Heuristic: typically the first few non-empty, non-numeric lines at the top.
 */
export function extractMerchantName(text: string): string | null {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  for (const line of lines.slice(0, 5)) {
    // Skip lines that are mostly numbers, dates, or common receipt headers
    if (/^\d+$/.test(line)) continue
    if (/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/.test(line)) continue
    if (/^(receipt|invoice|nota|struk|kwitansi|kasir|cashier)/i.test(line)) continue
    if (line.length < 3) continue
    // Skip lines that look like addresses (contain common address keywords)
    if (/\b(jl\.|jln|jalan|no\.|telp|tel|fax|email)\b/i.test(line)) continue

    return line
  }

  return null
}

// --- Company/Product Name Extraction ---

/**
 * Extract company or product name from labeled fields in structured receipts.
 * Looks for lines like "Company/Product Name : PT MEDIA DOKTER INVESTAMA / HALODOC"
 */
export function extractCompanyName(text: string): string | null {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const companyLabels = /\b(company\/product\s*name|company\s*name|product\s*name|merchant|nama\s*toko|nama\s*merchant|nama\s*perusahaan|vendor|store|toko)\b/i
  for (const line of lines) {
    if (companyLabels.test(line)) {
      const colonMatch = line.match(/:\s*(.+)$/)
      if (colonMatch) {
        const value = colonMatch[1].trim()
        if (value.length >= 2) return value
      }
    }
  }

  return null
}

// --- Line Items Extraction ---

/**
 * Extract individual line items (name + price) from receipt text.
 * Looks for lines with a description followed by a price.
 */
export function extractLineItems(text: string): ParsedReceiptItem[] {
  const lines = text.split('\n')
  const items: ParsedReceiptItem[] = []

  // Skip keywords that are summary lines, not items
  const skipKeywords = /\b(total|jumlah|subtotal|sub\s*total|grand\s*total|tax|pajak|ppn|diskon|discount|change|kembalian|tunai|cash|debit|credit|kartu|card)\b/i

  for (const line of lines) {
    if (skipKeywords.test(line)) continue

    // Pattern: "Item name    50.000" or "Item name  Rp 50.000"
    const itemPattern = /^(.{3,}?)\s{2,}(?:Rp\.?\s*)?(\d[\d.,]*)\s*$/
    const match = line.match(itemPattern)
    if (match) {
      const name = match[1].trim()
      const price = parseIndonesianNumber(match[2])
      if (price !== null && price > 0 && name.length >= 2) {
        items.push({ name, price })
      }
    }
  }

  return items
}

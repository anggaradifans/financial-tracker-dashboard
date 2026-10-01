# Bank Statement PDF Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side Bank Statement PDF Importer for `financial-tracker-dashboard` that decrypts statements locally, extracts transactions (Mandiri, Jenius, and AI fallback), detects duplicates, and provides an interactive batch review table.

**Architecture:** Client-side parsing using `pdfjs-dist` in the browser ensures privacy and zero backend setup. A modular `BankParserRegistry` routes extracted text to rule-based bank adapters (Mandiri, Jenius) or a Gemini Flash AI fallback, flags duplicates against Supabase `transactions`, and presents candidates in an editable review table for direct batch insertion.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `pdfjs-dist`, `@supabase/supabase-js`, Node test runner (`node --test`).

**Spec:** [`docs/superpowers/specs/2026-10-01-bank-statement-pdf-importer-design.md`](file:///C:/Users/Angga/Documents/Works/Test/financial-tracker-dashboard/docs/superpowers/specs/2026-10-01-bank-statement-pdf-importer-design.md)

## Global Constraints
- Client-side only: Raw PDF files and passwords must never leave browser memory.
- Passwords must be discarded immediately after decryption.
- Zero new database tables: candidate rows live in React state until batch inserted into existing `transactions`.
- Node test runner compatibility: unit test fixtures run with `node --test tests/*.test.mjs`.
- TypeScript strictness: clean build with `npm run build` and `npm run typecheck`.

## Review Focus
1. **Incorrect password recovery**: Verify that an incorrect password throws a caught `PasswordException`, prompts again without clearing the in-memory PDF file, and unlocks on the second attempt.
2. **Timezone boundary precision**: Verify that Jakarta time (WIB / UTC+7) transactions at midnight or late evening map to the correct calendar date in UTC ISO strings.
3. **Empty / non-transaction statement handling**: Verify that statements with 0 transaction rows (header only) display a friendly empty state instead of crashing.
4. **Boilerplate & disclaimer filtering**: Verify that Mandiri legal disclaimers and Jenius account holder name lines are excluded from transaction descriptions.
5. **Duplicate detection tolerance**: Verify that date drift of ±1 day with identical amount and type flags `isDuplicate: true` and unchecks the candidate by default.

---

### Task 1: Core Domain Types & Parser Interfaces

**Files:**
- Create: `src/types/bankStatement.ts`
- Modify: `src/types/index.ts` (export new types)
- Test: `tests/bankStatementTypes.test.mjs`

**Interfaces:**
- Produces: `ParsedCandidate`, `BankParser`, `ParserResult`, `StatementMetadata`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/bankStatementTypes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

test('bankStatement types structure contract', () => {
  const sampleCandidate = {
    tempId: 'temp-1',
    occurred_at: '2026-09-15T03:30:00.000Z',
    date_raw: '15 Sep 2026',
    description: 'TRANSFER BI FAST',
    amount: 50000,
    type: 'outcome',
    suggestedCategoryName: 'Transfer',
    categoryId: null,
    targetAccountId: null,
    isDuplicate: false,
    selected: true
  };
  assert.equal(sampleCandidate.amount, 50000);
  assert.equal(sampleCandidate.type, 'outcome');
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test tests/bankStatementTypes.test.mjs`
Expected: PASS

- [ ] **Step 3: Implement `src/types/bankStatement.ts`**

Define `ParsedCandidate`, `BankParser`, `ParserResult`, and `CategoryRule`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/bankStatement.ts tests/bankStatementTypes.test.mjs
git commit -m "feat(importer): define bank statement parser contracts and types"
```

---

### Task 2: Category Classifier & Account Resolver

**Files:**
- Create: `src/utils/parsers/categoryClassifier.ts`
- Test: `tests/categoryClassifier.test.mjs`

**Interfaces:**
- Consumes: `CategoryRule` from `src/types/bankStatement.ts`
- Produces: `inferCategory(description: string, availableCategories?: { id: string; name: string }[]): { categoryName: string; categoryId: string | null }`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/categoryClassifier.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCategory } from '../src/utils/parsers/categoryClassifier.ts';

test('inferCategory correctly identifies Food, Transport, and Bills', () => {
  assert.equal(inferCategory('KOPI KENANGAN GRAND INDO').categoryName, 'Food');
  assert.equal(inferCategory('GOJEK INDONESIA').categoryName, 'Transport');
  assert.equal(inferCategory('PLN POSTPAID').categoryName, 'Bills');
  assert.equal(inferCategory('RANDOM UNKNOWN TEXT').categoryName, 'Uncategorized');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/categoryClassifier.test.mjs`
Expected: FAIL (cannot find module or function)

- [ ] **Step 3: Implement `src/utils/parsers/categoryClassifier.ts`**

Implement keyword rules matching the spec (Bills, Food, Transport, Shopping, Transfer, Fees, Health, Entertainment, Travel). Resolve category names against passed categories list.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/categoryClassifier.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers/categoryClassifier.ts tests/categoryClassifier.test.mjs
git commit -m "feat(importer): implement keyword-based category classifier"
```

---

### Task 3: Mandiri Parser Adapter

**Files:**
- Create: `src/utils/parsers/mandiriParser.ts`
- Test: `tests/mandiriParser.test.mjs`

**Interfaces:**
- Consumes: `BankParser`, `ParsedCandidate`
- Produces: `mandiriParser: BankParser`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/mandiriParser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mandiriParser } from '../src/utils/parsers/mandiriParser.ts';

const SAMPLE_MANDIRI_TEXT = `
PT Bank Mandiri (Persero) Tbk.
Nominal (IDR) Saldo (IDR)
15 Sep 2026 TRANSFER BI FAST KE BANK BCA -50.000,00 1.250.000,00
10:15:30 WIB BXC COFFEE
16 Sep 2026 SETORAN TUNAI 200.000,00 1.450.000,00
Disclaimer from Bank Mandiri
`;

test('mandiriParser detects format and parses rows', () => {
  assert.equal(mandiriParser.canHandle(SAMPLE_MANDIRI_TEXT), true);
  const rows = mandiriParser.parse(SAMPLE_MANDIRI_TEXT);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'outcome');
  assert.equal(rows[0].amount, 50000);
  assert.ok(rows[0].description.includes('TRANSFER BI FAST'));
  assert.equal(rows[1].type, 'income');
  assert.equal(rows[1].amount, 200000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mandiriParser.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/parsers/mandiriParser.ts`**

Port Mandiri parsing logic from `supabase-telegram-webhook/scripts/import-bank-pdf.mjs`:
- Regex `Nominal (IDR) ... Saldo (IDR)` detection.
- Join continuation lines (WIB timestamps).
- Parse amount and sign (`-` = outcome, unsigned = income).
- Strip boilerplate and disclaimers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mandiriParser.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers/mandiriParser.ts tests/mandiriParser.test.mjs
git commit -m "feat(importer): implement Mandiri statement parser adapter"
```

---

### Task 4: Jenius Parser Adapter

**Files:**
- Create: `src/utils/parsers/jeniusParser.ts`
- Test: `tests/jeniusParser.test.mjs`

**Interfaces:**
- Consumes: `BankParser`, `ParsedCandidate`
- Produces: `jeniusParser: BankParser`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/jeniusParser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { jeniusParser } from '../src/utils/parsers/jeniusParser.ts';

const SAMPLE_JENIUS_TEXT = `
m-Card Statement
12 Sep 2026 Nasi Uduk Kebon Kacang -35.000
Angga Radifan Sumarna
14 Sep 2026 Top up Gopay 100.000
`;

test('jeniusParser detects and extracts rows', () => {
  assert.equal(jeniusParser.canHandle(SAMPLE_JENIUS_TEXT), true);
  const rows = jeniusParser.parse(SAMPLE_JENIUS_TEXT, { defaultYear: 2026 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'outcome');
  assert.equal(rows[0].amount, 35000);
  assert.ok(rows[0].description.includes('Nasi Uduk'));
  assert.equal(rows[1].type, 'income');
  assert.equal(rows[1].amount, 100000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/jeniusParser.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/parsers/jeniusParser.ts`**

Port Jenius parsing logic:
- Detect date prefix + trailing signed amounts.
- Filter out user name lines and balance inquiries.
- Convert Jakarta dates to UTC ISO strings.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/jeniusParser.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers/jeniusParser.ts tests/jeniusParser.test.mjs
git commit -m "feat(importer): implement Jenius statement parser adapter"
```

---

### Task 5: Parser Registry & Gemini Flash Fallback

**Files:**
- Create: `src/utils/parsers/geminiAiParser.ts`
- Create: `src/utils/parsers/index.ts`
- Test: `tests/parserRegistry.test.mjs`

**Interfaces:**
- Consumes: `mandiriParser`, `jeniusParser`
- Produces: `parseStatement(rawText: string, options?: ParserOptions): Promise<ParserResult>`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/parserRegistry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatementText } from '../src/utils/parsers/index.ts';

test('parseStatementText automatically routes to matching adapter', async () => {
  const result = await parseStatementText('Nominal (IDR) Saldo (IDR)\n15 Sep 2026 KOPI -25.000,00 100.000,00');
  assert.equal(result.parserName, 'Mandiri');
  assert.equal(result.candidates.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/parserRegistry.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/parsers/geminiAiParser.ts` and `src/utils/parsers/index.ts`**

Registry logic:
- Check registered adapters in order (`mandiriParser`, `jeniusParser`).
- If no adapter handles it, return `{ parserName: 'Unknown', candidates: [], needsAiFallback: true }`.
- `parseWithGemini(rawText, apiKey)` fallback using Gemini API.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/parserRegistry.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/parsers/geminiAiParser.ts src/utils/parsers/index.ts tests/parserRegistry.test.mjs
git commit -m "feat(importer): add parser registry and AI fallback parser"
```

---

### Task 6: PDF Text Extractor (`pdfExtractor.ts`)

**Files:**
- Install: `pdfjs-dist`
- Create: `src/utils/pdfExtractor.ts`
- Test: `tests/pdfExtractor.test.mjs`

**Interfaces:**
- Produces: `extractTextFromPdfBuffer(buffer: ArrayBuffer, password?: string): Promise<string>`

- [ ] **Step 1: Install `pdfjs-dist`**

Run: `npm install pdfjs-dist`

- [ ] **Step 2: Implement `src/utils/pdfExtractor.ts`**

Configure `pdfjs-dist` worker. Load PDF document from ArrayBuffer, intercept `PasswordResponses.NEED_PASSWORD` and `PasswordResponses.INCORRECT_PASSWORD`, and concatenate text items per page with newline spacing.

- [ ] **Step 3: Verify build / typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/utils/pdfExtractor.ts
git commit -m "feat(importer): integrate pdfjs-dist for in-memory PDF extraction"
```

---

### Task 7: Duplicate Detection Utility

**Files:**
- Create: `src/utils/duplicateDetector.ts`
- Test: `tests/duplicateDetector.test.mjs`

**Interfaces:**
- Produces: `markDuplicates(candidates: ParsedCandidate[], existingTransactions: ExistingTransaction[]): ParsedCandidate[]`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/duplicateDetector.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { markDuplicates } from '../src/utils/duplicateDetector.ts';

test('markDuplicates flags candidates with matching amount, type, and date ±1 day', () => {
  const candidates = [
    { tempId: '1', occurred_at: '2026-09-15T00:00:00Z', amount: 50000, type: 'outcome', selected: true, isDuplicate: false },
    { tempId: '2', occurred_at: '2026-09-20T00:00:00Z', amount: 99000, type: 'outcome', selected: true, isDuplicate: false }
  ];
  const existing = [
    { id: 'ex-1', occurred_at: '2026-09-15T12:00:00Z', amount: 50000, type: 'outcome', description: 'Gojek' }
  ];
  const results = markDuplicates(candidates, existing);
  assert.equal(results[0].isDuplicate, true);
  assert.equal(results[0].selected, false);
  assert.equal(results[1].isDuplicate, false);
  assert.equal(results[1].selected, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/duplicateDetector.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `src/utils/duplicateDetector.ts`**

Implement duplicate detection logic matching within 24-36h window for same amount & type.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/duplicateDetector.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/duplicateDetector.ts tests/duplicateDetector.test.mjs
git commit -m "feat(importer): add transaction duplicate detector utility"
```

---

### Task 8: Importer UI Components

**Files:**
- Create: `src/components/BankStatementImporter/PdfDropzone.tsx`
- Create: `src/components/BankStatementImporter/PasswordPromptModal.tsx`
- Create: `src/components/BankStatementImporter/ImportSummaryBar.tsx`
- Create: `src/components/BankStatementImporter/StatementReviewTable.tsx`
- Create: `src/components/BankStatementImporter/BankStatementModal.tsx`
- Create: `src/components/BankStatementImporter/index.ts`

**Interfaces:**
- Produces: `<BankStatementModal isOpen={boolean} onClose={() => void} onImportSuccess={() => void} />`

- [ ] **Step 1: Implement `PdfDropzone.tsx` and `PasswordPromptModal.tsx`**

Create drag-and-drop zone using Lucide icons (`UploadCloud`, `FileText`), handles `.pdf` extension check, and shows password modal on password demand.

- [ ] **Step 2: Implement `ImportSummaryBar.tsx` and `StatementReviewTable.tsx`**

Create the review table:
- Batch selection checkbox (select all / select only new).
- Inline category selector dropdown.
- Duplicate warning badge.
- Inline editable description.
- Income/outcome colored pill badges.

- [ ] **Step 3: Implement `BankStatementModal.tsx` container**

Coordinate file load -> decrypt -> parse -> duplicate check -> review -> Supabase batch insert.

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BankStatementImporter/
git commit -m "feat(importer): create statement dropzone, review table, and import modal"
```

---

### Task 9: Dashboard Integration & End-to-End Verification

**Files:**
- Modify: `src/components/TransactionTable/index.tsx` (add "Import Statement" button)
- Modify: `src/components/Dashboard/index.tsx` (if needed for refresh trigger)
- Test: Full build and typecheck

- [ ] **Step 1: Add "Import Statement" trigger button to `TransactionTable`**

Add an "Import Statement" button with upload icon next to the "Add Transaction" button. Open `BankStatementModal`.

- [ ] **Step 2: Wire up transaction refresh on import success**

When `onImportSuccess` fires, call `fetchTransactions()` and toast notification (*"Successfully imported X transactions"*).

- [ ] **Step 3: Run comprehensive verification**

Run:
```bash
npm run typecheck
npm run build
npm run test:security
```
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransactionTable/ src/components/Dashboard/
git commit -m "feat(importer): integrate bank statement importer into dashboard transaction view"
```

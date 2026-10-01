import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

const SAMPLE_JENIUS_TEXT = `
Jenius Transaction History
12 Sep 2026 Nasi Uduk Kebon Kacang -35.000
Angga Radifan Sumarna
Saldo Awal Rp 5.000.000
14 Sep 2026 Top up Gopay 100.000
Total Mutasi Rp 65.000
`;

test('jeniusParser detects and extracts rows, filtering user name and balance rows', async () => {
  const { jeniusParser } = await loadTsModule('../src/utils/parsers/jeniusParser.ts', import.meta.url);

  assert.equal(jeniusParser.canHandle(SAMPLE_JENIUS_TEXT), true);
  assert.equal(jeniusParser.canHandle('Completely unknown bank text'), false);

  const rows = jeniusParser.parse(SAMPLE_JENIUS_TEXT, { defaultYear: 2026 });
  assert.equal(rows.length, 2);

  // Outcome
  assert.equal(rows[0].type, 'outcome');
  assert.equal(rows[0].amount, 35000);
  assert.ok(rows[0].description.includes('Nasi Uduk'));
  assert.equal(rows[0].suggestedCategoryName, 'Food');

  // Income
  assert.equal(rows[1].type, 'income');
  assert.equal(rows[1].amount, 100000);
  assert.ok(rows[1].description.includes('Top up Gopay'));
  assert.equal(rows[1].suggestedCategoryName, 'Transfer');
});

test('jeniusParser filters arbitrary accountHolderName passed in options and generic cardholder lines', async () => {
  const { jeniusParser } = await loadTsModule('../src/utils/parsers/jeniusParser.ts', import.meta.url);
  const textWithCustomUser = `
Jenius Transaction History
Account Holder: Budi Santoso
12 Sep 2026 Budi Santoso -50.000
14 Sep 2026 Kopi Kenangan -25.000
`;
  const rows = jeniusParser.parse(textWithCustomUser, { defaultYear: 2026, accountHolderName: 'Budi Santoso' });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].description.includes('Kopi Kenangan'));
});


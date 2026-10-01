import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

const SAMPLE_MANDIRI_TEXT = `
PT Bank Mandiri (Persero) Tbk.
Nominal (IDR) Saldo (IDR)
15 Sep 2026 TRANSFER BI FAST KE BANK BCA -50.000,00 1.250.000,00
10:15:30 WIB BXC COFFEE
16 Sep 2026 SETORAN TUNAI 200.000,00 1.450.000,00
Disclaimer from Bank Mandiri
Customer's role responsibility
Nasabah tunduk dan terikat
`;

test('mandiriParser detects format, parses rows, joins WIB time, and strips boilerplate', async () => {
  const { mandiriParser } = await loadTsModule('../src/utils/parsers/mandiriParser.ts', import.meta.url);

  assert.equal(mandiriParser.canHandle(SAMPLE_MANDIRI_TEXT), true);
  assert.equal(mandiriParser.canHandle('Some other document text'), false);

  const rows = mandiriParser.parse(SAMPLE_MANDIRI_TEXT);
  assert.equal(rows.length, 2);

  // First row: negative amount -> outcome
  assert.equal(rows[0].type, 'outcome');
  assert.equal(rows[0].amount, 50000);
  assert.ok(rows[0].description.includes('TRANSFER BI FAST'));
  assert.ok(rows[0].description.includes('BXC COFFEE'));
  assert.ok(!rows[0].description.includes('Disclaimer'));

  // Second row: unsigned amount -> income
  assert.equal(rows[1].type, 'income');
  assert.equal(rows[1].amount, 200000);
  assert.ok(rows[1].description.includes('SETORAN TUNAI'));
});

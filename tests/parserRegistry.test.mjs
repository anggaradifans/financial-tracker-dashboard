import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

test('parseStatementText automatically routes to matching adapter or signals AI fallback', async () => {
  const { parseStatementText } = await loadTsModule('../src/utils/parsers/index.ts', import.meta.url);

  // Mandiri sample
  const mandiriSample = 'Nominal (IDR) Saldo (IDR)\n15 Sep 2026 KOPI -25.000,00 100.000,00';
  const mandiriResult = await parseStatementText(mandiriSample);
  assert.equal(mandiriResult.parserName, 'Mandiri');
  assert.equal(mandiriResult.candidates.length, 1);
  assert.equal(mandiriResult.needsAiFallback, false);

  // Jenius sample
  const jeniusSample = 'Jenius Statement\n12 Sep 2026 Nasi Uduk -35.000';
  const jeniusResult = await parseStatementText(jeniusSample, { defaultYear: 2026 });
  assert.equal(jeniusResult.parserName, 'Jenius');
  assert.equal(jeniusResult.candidates.length, 1);
  assert.equal(jeniusResult.needsAiFallback, false);

  // Unknown sample
  const unknownSample = 'Bank XYZ Random Statement Unstructured Text 12345';
  const unknownResult = await parseStatementText(unknownSample);
  assert.equal(unknownResult.parserName, 'Unknown');
  assert.equal(unknownResult.candidates.length, 0);
  assert.equal(unknownResult.needsAiFallback, true);
});

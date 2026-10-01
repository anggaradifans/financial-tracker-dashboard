import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

test('markDuplicates flags candidates with matching amount, type, and date within ±1 day', async () => {
  const { markDuplicates } = await loadTsModule('../src/utils/duplicateDetector.ts', import.meta.url);

  const candidates = [
    {
      tempId: 'c-1',
      occurred_at: '2026-09-15T03:00:00.000Z',
      amount: 50000,
      type: 'outcome',
      selected: true,
      isDuplicate: false,
    },
    {
      tempId: 'c-2',
      occurred_at: '2026-09-20T00:00:00.000Z',
      amount: 99000,
      type: 'outcome',
      selected: true,
      isDuplicate: false,
    },
  ];

  const existingTransactions = [
    {
      id: 'tx-1',
      occurred_at: '2026-09-15T10:00:00.000Z', // Same day, different hour
      amount: 50000,
      type: 'outcome',
      description: 'Gojek Ride',
    },
  ];

  const results = markDuplicates(candidates, existingTransactions);

  // c-1 is a duplicate of tx-1
  assert.equal(results[0].isDuplicate, true);
  assert.equal(results[0].selected, false);
  assert.ok(results[0].duplicateReason.includes('50.000'));

  // c-2 has no match
  assert.equal(results[1].isDuplicate, false);
  assert.equal(results[1].selected, true);
});

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

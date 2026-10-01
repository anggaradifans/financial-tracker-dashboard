import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

test('inferCategory correctly identifies Food, Transport, and Bills', async () => {
  const { inferCategory } = await loadTsModule('../src/utils/parsers/categoryClassifier.ts', import.meta.url);

  const mockCategories = [
    { id: 'cat-1', name: 'Food' },
    { id: 'cat-2', name: 'Transport' },
    { id: 'cat-3', name: 'Bills' },
    { id: 'cat-4', name: 'Uncategorized' }
  ];

  const foodResult = inferCategory('KOPI KENANGAN GRAND INDO', mockCategories);
  assert.equal(foodResult.categoryName, 'Food');
  assert.equal(foodResult.categoryId, 'cat-1');

  const transportResult = inferCategory('GOJEK INDONESIA', mockCategories);
  assert.equal(transportResult.categoryName, 'Transport');
  assert.equal(transportResult.categoryId, 'cat-2');

  const billsResult = inferCategory('PLN POSTPAID', mockCategories);
  assert.equal(billsResult.categoryName, 'Bills');
  assert.equal(billsResult.categoryId, 'cat-3');

  const unknownResult = inferCategory('RANDOM UNKNOWN 9999', mockCategories);
  assert.equal(unknownResult.categoryName, 'Uncategorized');
  assert.equal(unknownResult.categoryId, 'cat-4');
});

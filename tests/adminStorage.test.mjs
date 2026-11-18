import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';
const { storageForecast, storageHealth } = await loadTsModule('../src/components/AdminStorage/storage.ts', import.meta.url);
test('capacity thresholds use bytes and trigger at their boundary', () => {
  assert.equal(storageHealth(349999999), 'Within capacity');
  assert.equal(storageHealth(350000000), 'Warning');
  assert.equal(storageHealth(400000000), 'Prepare archive');
  assert.equal(storageHealth(450000000), 'Urgent action');
});
test('forecast needs distinct daily samples and handles stable or shrinking data', () => {
  assert.equal(storageForecast([], 100, 500), null);
  assert.equal(storageForecast([{ day: '2026-11-18', database_bytes: 100 }], 100, 500), null);
  const samples = [{ day: '2026-11-16', database_bytes: 100 }, { day: '2026-11-18', database_bytes: 120 }];
  assert.equal(storageForecast(samples, 120, 500).daily, 10);
  assert.equal(storageForecast(samples, 120, 500).daysRemaining, 38);
  assert.equal(storageForecast(samples, 600, 500).daysRemaining, 0);
  samples[1].database_bytes = 90;
  assert.equal(storageForecast(samples, 90, 500).daysRemaining, null);
});

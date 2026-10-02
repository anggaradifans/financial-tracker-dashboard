import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

const { createMemoryRateLimiter } = await loadTsModule('../api/_lib/rateLimiter.ts', import.meta.url);

test('should allow requests up to the limit and reject the next one', () => {
  const limiter = createMemoryRateLimiter(2, 1000, () => 0);

  assert.equal(limiter.tryConsume('user-1'), true);
  assert.equal(limiter.tryConsume('user-1'), true);
  assert.equal(limiter.tryConsume('user-1'), false);
});

test('should track each user separately', () => {
  const limiter = createMemoryRateLimiter(1, 1000, () => 0);

  assert.equal(limiter.tryConsume('user-1'), true);
  assert.equal(limiter.tryConsume('user-2'), true);
});

test('should allow requests again when the window has passed', () => {
  let time = 0;
  const limiter = createMemoryRateLimiter(1, 1000, () => time);

  limiter.tryConsume('user-1');
  time = 1000;

  assert.equal(limiter.tryConsume('user-1'), true);
});

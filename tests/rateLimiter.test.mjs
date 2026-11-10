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

test('evicts inactive expired keys without resetting active windows', async () => {
  const vm = await import('node:vm');
  const maps = [];
  class TrackedMap extends Map { constructor() { super(); maps.push(this); } }
  const module = await loadTsModule('../api/_lib/rateLimiter.ts', import.meta.url, {}, new Map(), vm.createContext({ Map: TrackedMap }));
  let time = 0;
  const limiter = module.createMemoryRateLimiter(1, 1000, () => time);
  limiter.tryConsume('expired');
  time = 500;
  limiter.tryConsume('active');
  time = 1000;
  limiter.tryConsume('new');
  const [retained] = maps;
  assert.equal(retained.has('expired'), false);
  assert.equal(retained.has('active'), true);
  assert.equal(limiter.tryConsume('active'), false);
});

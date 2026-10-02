import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadTsModule } from './testUtils.mjs';

// Objects built inside the vm context fail strict deep-equal against main-realm literals.
const plain = (value) => JSON.parse(JSON.stringify(value));

const { createGeminiExtractor, sanitizeRows, GeminiUpstreamError } = await loadTsModule(
  '../api/_lib/geminiTransactions.ts',
  import.meta.url,
  {},
  new Map(),
  vm.createContext({ AbortSignal }),
);

const MODELS = ['primary-model', 'fallback-model'];

function extractorWith(respond, logs = []) {
  const requests = [];
  const extract = createGeminiExtractor({
    apiKey: 'AIza-test-key',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return respond(url, requests.length);
    },
    logger: { info() {}, error() {}, warn: (fields, msg) => logs.push({ msg, ...fields }) },
    models: MODELS,
  });
  return { extract, requests, logs };
}

const modelOf = (url) => /models\/([^:]+):/.exec(url)[1];

function geminiReply(transactions) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ transactions }) }] } }],
  }));
}

test('should send the API key in a header and never in the URL', async () => {
  const { extract, requests } = extractorWith(() => geminiReply([]));

  await extract('statement', 'corr-1');

  assert.equal(requests.length, 1);
  assert.ok(!requests[0].url.includes('AIza-test-key'));
  assert.ok(!requests[0].url.includes('key='));
  assert.equal(requests[0].init.headers['x-goog-api-key'], 'AIza-test-key');
});

test('should return sanitized rows from the Gemini response', async () => {
  const { extract, requests } = extractorWith(() => geminiReply([
    { date: '2026-09-01', description: 'Transfer', amount: -250000, type: 'outcome' },
  ]));

  const result = await extract('statement', 'corr-1');

  assert.deepEqual(plain(result), {
    rows: [{ date: '2026-09-01', description: 'Transfer', amount: 250000, type: 'outcome' }],
    droppedRows: 0,
    model: 'primary-model',
  });
  assert.equal(requests.length, 1);
});

for (const status of [503, 500, 429, 404]) {
  test(`should fall back to the next model when the primary returns ${status}`, async () => {
    const { extract, requests, logs } = extractorWith((url) => (modelOf(url) === 'primary-model'
      ? new Response('high demand', { status })
      : geminiReply([{ date: '2026-09-01', description: 'ok', amount: 1, type: 'income' }])));

    const result = await extract('statement', 'corr-1');

    assert.equal(result.model, 'fallback-model');
    assert.equal(result.rows.length, 1);
    assert.deepEqual(requests.map((r) => modelOf(r.url)), MODELS);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].correlationId, 'corr-1');
    assert.equal(logs[0].upstreamStatus, status);
    assert.equal(logs[0].fallbackModel, 'fallback-model');
  });
}

test('should fall back to the next model when the primary times out', async () => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const { extract } = extractorWith((url) => {
    if (modelOf(url) === 'primary-model') throw timeout;
    return geminiReply([]);
  });

  assert.equal((await extract('statement', 'corr-1')).model, 'fallback-model');
});

test('should not fall back when Gemini rejects the request or key', async () => {
  const { extract, requests } = extractorWith(() => new Response('API key not valid', { status: 400 }));

  await assert.rejects(extract('statement', 'corr-1'), (err) => {
    assert.ok(err instanceof GeminiUpstreamError);
    assert.equal(err.upstreamStatus, 400);
    assert.equal(err.upstreamBody, 'API key not valid');
    return true;
  });
  assert.equal(requests.length, 1);
});

test('should throw the last error when every model is unavailable', async () => {
  const { extract, requests } = extractorWith(() => new Response('high demand', { status: 503 }));

  await assert.rejects(extract('statement', 'corr-1'), (err) => err.upstreamStatus === 503);
  assert.equal(requests.length, 2);
});

test('should bound each attempt with a timeout signal', async () => {
  const { extract, requests } = extractorWith(() => geminiReply([]));

  await extract('statement', 'corr-1');

  assert.ok(requests[0].init.signal);
});

test('should drop rows that do not match the schema', () => {
  const result = sanitizeRows(JSON.stringify({ transactions: [
    { date: '2026-09-01', description: 'ok', amount: 10, type: 'income' },
    { date: '01/09/2026', description: 'bad date format', amount: 10, type: 'income' },
    { date: '2026-13-45', description: 'impossible date', amount: 10, type: 'income' },
    { date: '2026-09-01', description: 'bad type', amount: 10, type: 'refund' },
    { date: '2026-09-01', description: 'bad amount', amount: 'ten', type: 'income' },
    { date: '2026-09-01', amount: 10, type: 'income' },
    null,
  ] }));

  assert.equal(result.rows.length, 1);
  assert.equal(result.droppedRows, 6);
});

test('should truncate descriptions to 500 characters', () => {
  const result = sanitizeRows(JSON.stringify({ transactions: [
    { date: '2026-09-01', description: 'x'.repeat(600), amount: 1, type: 'income' },
  ] }));

  assert.equal(result.rows[0].description.length, 500);
});

test('should return no rows when Gemini returns no candidate text', () => {
  assert.deepEqual(plain(sanitizeRows(undefined)), { rows: [], droppedRows: 0 });
});

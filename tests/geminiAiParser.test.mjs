import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadTsModule } from './testUtils.mjs';

async function parserWith(respond) {
  const requests = [];
  const context = vm.createContext({
    fetch: async (url, init) => {
      requests.push({ url, init });
      return respond();
    },
  });
  const { parseWithGemini } = await loadTsModule('../src/utils/parsers/geminiAiParser.ts', import.meta.url, {}, new Map(), context);
  return { parseWithGemini, requests };
}

test('should call the server function with the user token and no Gemini key', async () => {
  const { parseWithGemini, requests } = await parserWith(() => new Response(JSON.stringify({ data: { transactions: [] } })));

  await parseWithGemini('statement', 'user-token');

  assert.equal(requests[0].url, '/api/parse-statement');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer user-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), { rawText: 'statement' });
  assert.ok(!/generativelanguage|key=/.test(JSON.stringify(requests)));
});

test('should map returned rows to candidates', async () => {
  const { parseWithGemini } = await parserWith(() => new Response(JSON.stringify({
    data: { transactions: [{ date: '2026-09-01', description: 'Gaji', amount: 5000000, type: 'income' }] },
  })));

  const [candidate] = await parseWithGemini('statement', 'user-token', { accountId: 'acc-1' });

  assert.equal(candidate.occurred_at, '2026-09-01T12:00:00.000Z');
  assert.equal(candidate.amount, 5000000);
  assert.equal(candidate.type, 'income');
  assert.equal(candidate.targetAccountId, 'acc-1');
  assert.equal(candidate.selected, true);
});

test('should surface the server message and correlation id on failure', async () => {
  const { parseWithGemini } = await parserWith(() => new Response(JSON.stringify({
    status: 'error', code: 429, error: { code: 'RATE_LIMITED', message: 'Too many requests.', correlationId: 'corr-9' },
  }), { status: 429 }));

  await assert.rejects(parseWithGemini('statement', 'user-token'), /Too many requests\. \(ref: corr-9\)/);
});

test('should fall back to a generic message when the error body is not JSON', async () => {
  const { parseWithGemini } = await parserWith(() => new Response('<html>Bad Gateway</html>', { status: 502 }));

  await assert.rejects(parseWithGemini('statement', 'user-token'), /AI parsing failed \(502\)/);
});

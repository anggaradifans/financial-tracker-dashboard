import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadTsModule } from './testUtils.mjs';

const { createParseStatementHandler, MAX_STATEMENT_CHARS } = await loadTsModule(
  '../api/_lib/parseStatementHandler.ts',
  import.meta.url,
  {},
  new Map(),
  vm.createContext({ Response }),
);

function setup(overrides = {}) {
  const logs = [];
  const calls = { extract: [] };
  const record = (level) => (fields, msg) => logs.push({ level, msg, ...fields });
  const handler = createParseStatementHandler({
    verifyUser: async (token) => (token === 'good-token' ? { id: 'user-1' } : null),
    extractTransactions: async (rawText, correlationId) => {
      calls.extract.push({ rawText, correlationId });
      return { rows: [{ date: '2026-09-01', description: 'Gaji', amount: 1000, type: 'income' }], droppedRows: 1, model: 'gemini-test' };
    },
    rateLimiter: { tryConsume: () => true },
    logger: { info: record('info'), warn: record('warn'), error: record('error') },
    now: () => 1000,
    newCorrelationId: () => 'corr-1',
    ...overrides,
  });
  return { handler, logs, calls };
}

function request(body, token = 'good-token') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://app.test/api/parse-statement', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('should return parsed transactions when the user is authenticated', async () => {
  const { handler, logs, calls } = setup();

  const response = await handler(request({ rawText: 'statement text' }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-correlation-id'), 'corr-1');
  assert.deepEqual(await response.json(), {
    data: { transactions: [{ date: '2026-09-01', description: 'Gaji', amount: 1000, type: 'income' }] },
  });
  assert.deepEqual(calls.extract, [{ rawText: 'statement text', correlationId: 'corr-1' }]);
  const done = logs.find((l) => l.msg === 'statement parsed');
  assert.equal(done.userId, 'user-1');
  assert.equal(done.model, 'gemini-test');
  assert.equal(done.droppedRows, 1);
});

test('should return 401 and never call Gemini when the token is missing', async () => {
  const { handler, calls } = setup();

  const response = await handler(request({ rawText: 'x' }, null));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
  assert.equal(calls.extract.length, 0);
});

test('should return 401 when Supabase rejects the token', async () => {
  const { handler, logs, calls } = setup();

  const response = await handler(request({ rawText: 'x' }, 'forged-token'));

  assert.equal(response.status, 401);
  assert.equal(calls.extract.length, 0);
  assert.ok(logs.some((l) => l.event_type === 'auth_failed'));
});

test('should return 429 when the user exceeds the rate limit', async () => {
  const { handler, calls } = setup({ rateLimiter: { tryConsume: () => false } });

  const response = await handler(request({ rawText: 'x' }));

  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'RATE_LIMITED');
  assert.equal(calls.extract.length, 0);
});

test('should return 400 when rawText is missing, blank, too long, or the body is not JSON', async () => {
  const { handler, calls } = setup();

  for (const body of [{}, { rawText: '   ' }, { rawText: 42 }, { rawText: 'a'.repeat(MAX_STATEMENT_CHARS + 1) }, 'not json']) {
    const response = await handler(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(calls.extract.length, 0);
});

test('should return a generic 502 without upstream details when Gemini fails', async () => {
  const upstream = Object.assign(new Error('Gemini API failed with status 403'), { upstreamBody: 'API key not valid' });
  const { handler, logs } = setup({ extractTransactions: async () => { throw upstream; } });

  const response = await handler(request({ rawText: 'x' }));

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.deepEqual(body, {
    status: 'error',
    code: 502,
    error: {
      code: 'AI_PARSING_UNAVAILABLE',
      message: 'AI parsing is unavailable right now. Please try again later.',
      correlationId: 'corr-1',
    },
  });
  const failure = logs.find((l) => l.level === 'error');
  assert.equal(failure.userId, 'user-1');
  assert.equal(failure.error.upstreamBody, 'API key not valid');
});

test('should never log the statement text or the access token', async () => {
  const { handler, logs } = setup();

  await handler(request({ rawText: 'SECRET-STATEMENT-LINE' }));

  const serialized = JSON.stringify(logs);
  assert.ok(!serialized.includes('SECRET-STATEMENT-LINE'));
  assert.ok(!serialized.includes('good-token'));
});

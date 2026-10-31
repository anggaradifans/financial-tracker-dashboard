import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTsModule } from './testUtils.mjs';

const load = () => loadTsModule('../src/utils/transfers.ts', import.meta.url);
// The module runs in its own VM realm, so its arrays and objects fail strict deep-equality
// against ones made here even when the values match.
const plain = (value) => JSON.parse(JSON.stringify(value));
const tx = (overrides) => ({ id: 'tx', type: 'outcome', amount: 100, occurred_at: '2026-10-10T03:00:00.000Z', category_id: 'cat', ...overrides });
const leg = (id, type, amount = 2000000, extra = {}) => tx({ id, type, amount, category_id: null, transfer_id: 'transfer-1', ...extra });

test('a transfer pair nets to zero in the balance and an unknown type counts as nothing', async () => {
  const { balanceEffect, sumBalance } = await load();
  assert.equal(balanceEffect(tx({ type: 'income', amount: '150.50' })), 150.5);
  assert.equal(balanceEffect(tx({ type: 'outcome', amount: 40 })), -40);
  assert.equal(balanceEffect(leg('a', 'transfer_out', 2000000)), -2000000);
  assert.equal(balanceEffect(leg('b', 'transfer_in', 2000000)), 2000000);
  assert.equal(balanceEffect(tx({ type: 'something_new', amount: 99 })), 0);
  const rows = [tx({ type: 'income', amount: 1000 }), tx({ type: 'outcome', amount: 300 }), leg('a', 'transfer_out'), leg('b', 'transfer_in')];
  assert.equal(sumBalance(rows), 700);
});

test('the chart ignores transfer legs, leaves no empty day and never treats an unknown type as spending', async () => {
  const { buildTimeSeries } = await load();
  const series = buildTimeSeries([
    tx({ type: 'income', amount: 500, occurred_at: '2026-10-10T03:00:00.000Z' }),
    tx({ type: 'outcome', amount: 200, occurred_at: '2026-10-10T05:00:00.000Z' }),
    leg('a', 'transfer_out', 9000000, { occurred_at: '2026-10-11T03:00:00.000Z' }),
    leg('b', 'transfer_in', 9000000, { occurred_at: '2026-10-11T03:00:00.000Z' }),
    tx({ type: 'something_new', amount: 777, occurred_at: '2026-10-12T03:00:00.000Z' }),
  ]);
  assert.deepEqual(plain(series), [{ date: '2026-10-10', income: 500, outcome: 200, net: 300 }]);
});

test('category breakdown skips transfer legs, filters by type and keeps income and outcome apart', async () => {
  const { buildCategoryBreakdown } = await load();
  const rows = [
    tx({ id: '1', type: 'outcome', amount: 100, category_id: 'food', category: { name: 'Food' } }),
    tx({ id: '2', type: 'outcome', amount: 50, category_id: 'food', category: { name: 'Food' } }),
    tx({ id: '3', type: 'income', amount: 10, category_id: 'food', category: { name: 'Food' } }),
    leg('a', 'transfer_out'), leg('b', 'transfer_in'),
    // not possible in the database, but the type alone must keep a leg out of the breakdown
    leg('c', 'transfer_out', 1, { category_id: 'food', category: { name: 'Food' } }),
  ];
  const all = buildCategoryBreakdown(rows);
  assert.deepEqual(plain(all.map(c => [c.category_id, c.type, c.amount, c.count])), [['food', 'outcome', 150, 2], ['food', 'income', 10, 1]]);
  assert.ok(!all.some(c => c.category_name === 'Unknown'));
  assert.deepEqual(plain(buildCategoryBreakdown(rows, 'income').map(c => c.amount)), [10]);
});

test('transfers are neutral and carry the sign of their effect on the account', async () => {
  const { amountTone, amountSign } = await load();
  assert.deepEqual(['income', 'outcome', 'transfer_out', 'transfer_in'].map(amountTone), ['positive', 'negative', 'neutral', 'neutral']);
  assert.deepEqual(['income', 'outcome', 'transfer_out', 'transfer_in'].map(amountSign), ['+', '-', '-', '+']);
});

test('labels name the other side when it is known and fall back safely when it is not', async () => {
  const { categoryLabel, transferLabel, transferPartner, isTransferType } = await load();
  assert.equal(categoryLabel(tx({ category: { name: 'Food' } })), 'Food');
  assert.equal(categoryLabel(tx({ category: null })), 'Uncategorized');
  assert.equal(categoryLabel(leg('a', 'transfer_out', 1, { category: null })), 'Transfer');
  assert.equal(transferLabel({ type: 'transfer_out' }, 'BCA'), 'Transfer to BCA');
  assert.equal(transferLabel({ type: 'transfer_in' }, 'Mandiri'), 'Transfer from Mandiri');
  assert.equal(transferLabel({ type: 'transfer_out' }), 'Transfer out');
  assert.equal(transferLabel({ type: 'transfer_in' }, null), 'Transfer in');
  assert.ok(isTransferType('transfer_out') && isTransferType('transfer_in') && !isTransferType('income') && !isTransferType('outcome'));
  const out = leg('a', 'transfer_out'), inn = leg('b', 'transfer_in'), other = leg('c', 'transfer_in', 5, { transfer_id: 'transfer-2' });
  assert.equal(transferPartner([out, inn, other], out).id, 'b');
  assert.equal(transferPartner([out, other], out), undefined);
  assert.equal(transferPartner([tx({ id: 'plain' })], tx({ id: 'plain' })), undefined);
});

test('deleting an ordinary transaction soft-deletes just that row', async () => {
  const { deleteTransactionRecord } = await load();
  const calls = [];
  const api = { softDelete: async id => calls.push(['soft', id]), deleteTransfer: async id => calls.push(['transfer', id]) };
  const removed = await deleteTransactionRecord([tx({ id: 'a' }), tx({ id: 'b' })], 'a', api);
  assert.deepEqual(plain(removed), ['a']);
  assert.deepEqual(calls, [['soft', 'a']]);
});

test('deleting either leg deletes the whole transfer through its own call and removes both rows', async () => {
  const { deleteTransactionRecord } = await load();
  const rows = [tx({ id: 'plain' }), leg('out', 'transfer_out'), leg('in', 'transfer_in'), leg('other', 'transfer_in', 5, { transfer_id: 'transfer-2' })];
  for (const clicked of ['out', 'in']) {
    const calls = [];
    const api = { softDelete: async id => calls.push(['soft', id]), deleteTransfer: async id => calls.push(['transfer', id]) };
    const removed = await deleteTransactionRecord(rows, clicked, api);
    assert.deepEqual(plain(removed).sort(), ['in', 'out']);
    assert.deepEqual(calls, [['transfer', 'transfer-1']], 'a leg must never be soft-deleted directly');
  }
});

test('only the leg in view is removed when the other is outside the list, and a failure removes nothing', async () => {
  const { deleteTransactionRecord } = await load();
  const api = { softDelete: async () => {}, deleteTransfer: async () => {} };
  assert.deepEqual(plain(await deleteTransactionRecord([leg('out', 'transfer_out')], 'out', api)), ['out']);
  const failing = { softDelete: async () => { throw new Error('soft'); }, deleteTransfer: async () => { throw new Error('boom'); } };
  await assert.rejects(deleteTransactionRecord([leg('out', 'transfer_out'), leg('in', 'transfer_in')], 'in', failing), /boom/);
  await assert.rejects(deleteTransactionRecord([tx({ id: 'a' })], 'a', failing), /soft/);
});

test('a transaction missing from the list still goes down the ordinary delete path', async () => {
  const { deleteTransactionRecord } = await load();
  const calls = [];
  const removed = await deleteTransactionRecord([], 'ghost', { softDelete: async id => calls.push(id), deleteTransfer: async () => calls.push('transfer') });
  assert.deepEqual(plain(removed), ['ghost']);
  assert.deepEqual(calls, ['ghost']);
});

test('a transfer cannot be edited but an ordinary transaction and a missing one can', async () => {
  const { assertEditable } = await load();
  assert.throws(() => assertEditable(leg('out', 'transfer_out')), /cannot be edited/);
  assert.doesNotThrow(() => assertEditable(tx({})));
  assert.doesNotThrow(() => assertEditable(undefined));
});

// ---------------------------------------------------------------------------
// The transfer form
// ---------------------------------------------------------------------------
const account = (id, name, currency = 'IDR') => ({ id, name, currency, created_at: '2026-01-01T00:00:00.000Z' });
const accounts = [account('mandiri', 'Mandiri'), account('bca', 'BCA'), account('usd', 'USD Cash', 'USD'), account('gopay', 'GoPay', 'IDR ')];
const good = { fromAccountId: 'mandiri', toAccountId: 'bca', amount: '2000000', occurredOn: '2026-10-31', description: '' };
const errorsFor = async (patch) => { const { validateTransfer } = await load(); return plain(validateTransfer({ ...good, ...patch }, accounts)); };

test('the destination list holds other accounts in the same currency, even with padded currency codes', async () => {
  const { transferTargets, canTransfer } = await load();
  assert.deepEqual(plain(transferTargets(accounts, 'mandiri').map(a => a.id)), ['bca', 'gopay']);
  assert.deepEqual(plain(transferTargets(accounts, 'usd')), []);
  assert.deepEqual(plain(transferTargets(accounts, 'ghost')), []);
  assert.equal(canTransfer(accounts), true);
  assert.equal(canTransfer([]), false);
  assert.equal(canTransfer([account('a', 'A')]), false);
  assert.equal(canTransfer([account('a', 'A'), account('b', 'B', 'USD')]), false);
});

test('a complete transfer has no errors, and boundary amounts are judged exactly', async () => {
  assert.deepEqual(await errorsFor({}), {});
  for (const amount of ['0.01', '.5', '10.5', '9999999999999.99']) assert.deepEqual(await errorsFor({ amount }), {}, amount);
  for (const amount of ['', '  ', '0', '0.00', '-5', '1.234', '1e3', 'abc', '10.', '10000000000000']) {
    assert.ok((await errorsFor({ amount })).amount, `amount "${amount}" should be refused`);
  }
});

test('the accounts must be chosen, different and in the same currency', async () => {
  assert.match((await errorsFor({ fromAccountId: '' })).fromAccountId, /Choose the account the money leaves/);
  assert.match((await errorsFor({ toAccountId: '' })).toAccountId, /Choose the account the money goes to/);
  assert.match((await errorsFor({ toAccountId: 'mandiri' })).toAccountId, /different account/);
  assert.match((await errorsFor({ toAccountId: 'usd' })).toAccountId, /same currency \(IDR\)/);
  assert.match((await errorsFor({ toAccountId: 'ghost' })).toAccountId, /valid destination/);
  assert.match((await errorsFor({ fromAccountId: 'ghost' })).fromAccountId, /Choose the account the money leaves/);
});

test('the date and description are checked', async () => {
  for (const occurredOn of ['', '31-10-2026', '2026-13-45', 'tomorrow']) assert.match((await errorsFor({ occurredOn })).occurredOn, /valid date/, occurredOn);
  assert.deepEqual(await errorsFor({ description: 'x'.repeat(500) }), {});
  assert.match((await errorsFor({ description: 'x'.repeat(501) })).description, /500 characters/);
  assert.deepEqual(await errorsFor({ description: ' '.repeat(600) }), {}, 'spaces alone are trimmed away');
});

test('the request carries the source currency, an exact amount, the transfer key and a UTC date like the transaction form', async () => {
  const { buildCreateTransferParams } = await load();
  const params = plain(buildCreateTransferParams({ ...good, amount: ' 1234567.89 ', description: '  Move to BCA  ', fromAccountId: 'gopay', toAccountId: 'mandiri' }, accounts, 'key-1'));
  assert.deepEqual(params, {
    p_from_account_id: 'gopay',
    p_to_account_id: 'mandiri',
    p_amount: 1234567.89,
    p_currency: 'IDR',
    p_occurred_at: '2026-10-31T00:00:00.000Z',
    p_description: 'Move to BCA',
    p_transfer_id: 'key-1',
  });
  assert.equal(plain(buildCreateTransferParams(good, accounts, 'key-2')).p_description, null);
  assert.throws(() => buildCreateTransferParams({ ...good, toAccountId: 'ghost' }, accounts, 'key-3'), /Choose both accounts/);
});

test('the request uses exactly the parameter names create_transfer declares in the migration', async () => {
  const { buildCreateTransferParams } = await load();
  const sql = await readFile(new URL('../supabase/migrations/20261031110000_linked_transfers.sql', import.meta.url), 'utf8');
  const signature = sql.match(/CREATE FUNCTION public\.create_transfer\(([\s\S]*?)\) RETURNS uuid/)[1];
  const declared = [...signature.matchAll(/^\s*(p_\w+)\s/gm)].map(m => m[1]);
  assert.equal(declared.length, 7);
  assert.deepEqual(Object.keys(plain(buildCreateTransferParams(good, accounts, 'key'))), declared);
});

test('failures show the database validation message and otherwise nothing that came from the server', async () => {
  const { transferErrorMessage } = await load();
  const rpc = (status, body) => new Error(`Supabase RPC error: ${status} - ${JSON.stringify(body)}`);
  assert.equal(transferErrorMessage(rpc(400, { code: '22023', message: 'Both accounts must exist and use the transfer currency' })), 'Both accounts must exist and use the transfer currency');
  assert.match(transferErrorMessage(rpc(409, { code: '23505', message: 'Transfer id already used' })), /already saved/);
  assert.match(transferErrorMessage(rpc(400, { code: '22003', message: 'numeric field overflow' })), /too large/);
  assert.match(transferErrorMessage(rpc(403, { code: '42501', message: 'Authentication required' })), /sign in/);
  for (const error of [
    rpc(500, { code: 'XX000', message: 'relation "secret_table" does not exist' }),
    new Error('Supabase RPC error: 502 - <html>bad gateway</html>'),
    new Error('Failed to fetch'),
    'not an error',
    undefined,
  ]) {
    const message = transferErrorMessage(error);
    assert.equal(message, 'Could not save the transfer. Please try again.');
  }
});

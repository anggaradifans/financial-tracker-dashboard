import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { loadTsModule } from './testUtils.mjs'

let downloaded
let clicked = false
const context = vm.createContext({
  Blob: class { constructor(parts) { downloaded = parts.join('') } },
  URL: { createObjectURL: () => 'blob:csv', revokeObjectURL: () => {} },
  document: { createElement: () => ({ setAttribute() {}, style: {}, click() { clicked = true } }), body: { appendChild() {}, removeChild() {} } },
})
const { escapeCSVCell, exportToCSV } = await loadTsModule('../src/utils/exportUtils.ts', import.meta.url, {
  'date-fns': { format: () => '2026-11-09' },
}, new Map(), context)

test('CSV neutralizes spreadsheet formulas and preserves CSV escaping', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n']) {
    assert.equal(escapeCSVCell(prefix + '"payload",x'), `"'${prefix}""payload"",x"`)
  }
  assert.equal(escapeCSVCell('normal,"text"'), '"normal,""text"""')
  assert.equal(escapeCSVCell(123.45), '"123.45"')
})
test('the downloaded CSV escapes formulas in every transaction field', () => {
  exportToCSV([{
    occurred_at: '2026-11-09', type: 'income', category: { name: '=category' },
    account: { name: '+account' }, amount: -1, currency: '@currency', description: '\tformula',
  }])
  assert.equal(clicked, true)
  for (const cell of ["'=category", "'+account", "'-1", "'@currency", "'\tformula"]) {
    assert.ok(downloaded.includes(`"${cell}"`), cell)
  }
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Plus, Trash2 } from 'lucide-react'
import ts from 'typescript'

const source = await readFile(new URL('../src/components/CategoryAccountManager/CategoryAccountManager.tsx', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
})
const context = vm.createContext({})
const imports = {
  react: { default: React, useState: React.useState },
  'lucide-react': { Plus, Trash2 },
  '../../utils/notifications': { notifications: {} },
}
const module = new vm.SourceTextModule(outputText, { context })
await module.link(specifier => {
  assert.ok(specifier in imports, `Unexpected import: ${specifier}`)
  const exports = imports[specifier]
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
  }, { context })
})
await module.evaluate()

const props = {
  accounts: [],
  categories: [
    { id: 'shared', name: 'Default category', allowed_type: 'both', user_id: null },
    { id: 'private', name: 'Personal category', allowed_type: 'both', user_id: 'user-a' },
  ],
  onAddAccount: async () => {}, onDeleteAccount: async () => {},
  onAddCategory: async () => {}, onDeleteCategory: async () => {},
}

test('dashboard exposes deletion only for the current user custom categories', () => {
  const html = renderToStaticMarkup(React.createElement(module.namespace.default, {
    ...props, canDeleteCategory: category => category.user_id === 'user-a',
  }))
  assert.match(html, /Shared default/)
  assert.doesNotMatch(html, /Delete category Default category/)
  assert.match(html, /Delete category Personal category/)
})

test('demo and story callers can keep their existing local deletion controls', () => {
  const html = renderToStaticMarkup(React.createElement(module.namespace.default, props))
  assert.match(html, /Delete category Default category/)
  assert.match(html, /Delete category Personal category/)
})

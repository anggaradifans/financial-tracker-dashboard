import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './testUtils.mjs';

test('pdfExtractor exports error classes and extractor function', async () => {
  const { PasswordRequiredError, IncorrectPasswordError, extractTextFromPdfBuffer } =
    await loadTsModule('../src/utils/pdfExtractor.ts', import.meta.url, {
      'pdfjs-dist': {
        GlobalWorkerOptions: {},
        getDocument: () => {
          throw new Error('mock getDocument');
        },
      },
    });

  const err1 = new PasswordRequiredError();
  assert.equal(err1.name, 'PasswordRequiredError');

  const err2 = new IncorrectPasswordError();
  assert.equal(err2.name, 'IncorrectPasswordError');

  assert.equal(typeof extractTextFromPdfBuffer, 'function');
});

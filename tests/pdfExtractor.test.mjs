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

test('reports completed pages after extraction, without changing extracted text', async () => {
  const { extractTextFromPdfBuffer } = await loadTsModule('../src/utils/pdfExtractor.ts', import.meta.url, {
    'pdfjs-dist': {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 3,
        getPage: async page => ({ getTextContent: async () => ({
          items: [{ str: `Page ${page}`, transform: [1, 0, 0, 1, 0, 100] }],
        }) }),
      }) }),
    },
  });
  const updates = [];
  const text = await extractTextFromPdfBuffer(new ArrayBuffer(0), undefined,
    (completed, total) => updates.push([completed, total]));
  assert.deepEqual(updates, [[0, 3], [1, 3], [2, 3], [3, 3]]);
  assert.equal(text, 'Page 1\nPage 2\nPage 3\n');
  assert.equal(await extractTextFromPdfBuffer(new ArrayBuffer(0)), text);
});

test('does not report a failed page as completed', async () => {
  const { extractTextFromPdfBuffer } = await loadTsModule('../src/utils/pdfExtractor.ts', import.meta.url, {
    'pdfjs-dist': {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 2,
        getPage: async page => ({ getTextContent: async () => {
          if (page === 2) throw new Error('Unreadable page');
          return { items: [] };
        } }),
      }) }),
    },
  });
  const updates = [];
  await assert.rejects(extractTextFromPdfBuffer(new ArrayBuffer(0), undefined,
    (completed, total) => updates.push([completed, total])), /Unreadable page/);
  assert.deepEqual(updates, [[0, 2], [1, 2]]);
});

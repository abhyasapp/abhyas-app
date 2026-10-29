import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 37, 69, 79, 70, 10]);

function response(contentType, bytes, json) {
  return {
    ok: true,
    status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    clone() { return response(contentType, bytes, json); },
    blob: async () => new Blob([bytes]),
    json: async () => json
  };
}

function app(fetchImpl) {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Set, Map,
    AbortController, Blob, ArrayBuffer, Uint8Array, URL, atob, btoa,
    setTimeout, clearTimeout,
    location: { origin: 'https://app.example' },
    S: { user: { username: 'student', token: 'test-token' }, online: true, forcedOffline: false },
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ['js/core/config.js', 'js/core/net.js', 'js/features/study-docs.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

for (const format of ['raw application/pdf', 'JSON with base64 content']) {
  test(`STUDYDOCS.open loads ${format} using getFile and the stored pdfPath`, async () => {
    const calls = [];
    const context = app(async (url, options) => {
      calls.push({ url, options });
      if (format === 'raw application/pdf') return response('application/pdf', pdfBytes, null);
      return response('application/json', [], {
        success: true,
        content: btoa(String.fromCharCode(...pdfBytes))
      });
    });
    let viewerOptions;
    context.PDFVIEW = { open(options) { viewerOptions = options; } };
    context.STUDYDOCS.docs = [{
      id: 'study-doc-record-id',
      title: 'Example answers',
      fileId: 'old-generic-id',
      pdfPath: 'study-docs/example.pdf',
      fileName: 'example.pdf'
    }];

    context.STUDYDOCS.open('study-doc-record-id');
    const loaded = await viewerOptions.load();

    assert.equal(atob(loaded.base64), '%PDF-1.7\n%%EOF\n');
    assert.equal(loaded.filename, 'example.pdf');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, context.ABHYAS_CONFIG.SUPABASE_URL);
    assert.equal(calls[0].options.method, 'POST');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.action, 'getFile');
    assert.equal(body.fileId, 'study-docs/example.pdf');
  });
}
